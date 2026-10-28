import type {
  AppRecord,
  AppStorePort,
  Collection,
  CollectionDraft,
  Release,
  SearchQuery,
  SearchResult,
  SyncOperation,
} from '@orbisyn/core';
import { compareVersions, toSummary } from '@orbisyn/core';

/**
 * In-memory store.
 *
 * This adapter is the fast ephemeral implementation for tests and embedded
 * callers. The normal gateway composes it with the file adapter, which persists
 * validated snapshots between restarts.
 *
 * Search is a linear scan with token matching. That is the honest choice at this
 * scale: an index would add failure modes without changing any user-visible
 * behaviour until the catalogue is far larger than a curated one.
 */
export interface MemoryStoreSnapshot {
  readonly version: 1;
  readonly apps: readonly {
    readonly app: AppRecord;
    readonly releases: readonly Release[];
  }[];
  readonly collections: readonly Collection[];
  readonly syncCursor: number;
}

export interface MemoryStore extends AppStorePort {
  readonly size: () => number;
  readonly all: () => readonly AppRecord[];
  /** Snapshot and restore are used by the durable file adapter. */
  readonly snapshot: () => MemoryStoreSnapshot;
  readonly restore: (snapshot: MemoryStoreSnapshot) => void;
}

export function createMemoryStore(options: { maxApps?: number } = {}): MemoryStore {
  const apps = new Map<string, AppRecord>();
  const releases = new Map<string, Release[]>();
  const collections = new Map<string, Collection>();
  const maxApps = options.maxApps ?? 10_000;
  let syncCursor = 0;

  const indexableText = (app: AppRecord): string =>
    [app.id, app.name, app.summary, app.description, ...app.categories, ...app.tags]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join(' ')
      .toLowerCase();

  const matches = (app: AppRecord, query: SearchQuery): boolean => {
    if (query.q.trim().length > 0) {
      const haystack = indexableText(app);
      const terms = query.q
        .toLowerCase()
        .split(/\s+/)
        .filter((term) => term.length > 0);
      // Every term must appear: narrowing, never widening.
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    if (query.platform !== undefined && query.platform.length > 0) {
      if (!app.platforms.some((platform) => query.platform?.includes(platform))) return false;
    }
    if (query.license !== undefined && query.license.length > 0) {
      if (!query.license.includes(app.license)) return false;
    }
    if (query.source !== undefined && query.source.length > 0) {
      if (!query.source.includes(app.source.kind)) return false;
    }
    if (query.minHealthScore !== undefined && (app.health?.score ?? 0) < query.minHealthScore) {
      return false;
    }
    return true;
  };

  const rank = (app: AppRecord): number => {
    // Health first, then star count, then how recently the app shipped.
    const health = app.health?.score ?? 0;
    const published =
      app.latestRelease === undefined ? 0 : Date.parse(app.latestRelease.publishedAt) / 1e11;
    const stars = app.health?.inputs.stars ?? 0;
    return health * 1_000 + Math.min(stars, 10_000) + published;
  };

  const decodeCursor = (cursor: string | undefined): number => {
    if (cursor === undefined) return 0;
    const parsed = Number.parseInt(cursor, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };

  return {
    size: () => apps.size,
    all: () => [...apps.values()],
    snapshot: () => ({
      version: 1,
      apps: [...apps.values()].map((app) => ({
        app,
        releases: [...(releases.get(app.id) ?? [])],
      })),
      collections: [...collections.values()],
      syncCursor,
    }),
    restore(snapshot) {
      if (snapshot.apps.length > maxApps) {
        throw new RangeError(`snapshot contains more than ${maxApps} apps`);
      }
      apps.clear();
      releases.clear();
      collections.clear();
      for (const entry of snapshot.apps) {
        apps.set(entry.app.id, entry.app);
        releases.set(entry.app.id, [...entry.releases]);
      }
      for (const collection of snapshot.collections) {
        collections.set(collection.id, collection);
      }
      syncCursor = snapshot.syncCursor;
    },

    async saveApp(app, appReleases) {
      if (!apps.has(app.id) && apps.size >= maxApps) {
        // Evict the lowest ranked record rather than growing without bound.
        const victim = [...apps.values()].sort((left, right) => rank(left) - rank(right))[0];
        if (victim !== undefined) {
          apps.delete(victim.id);
          releases.delete(victim.id);
        }
      }

      apps.set(app.id, app);
      if (appReleases.length > 0) {
        const merged = new Map<string, Release>();
        for (const release of [...(releases.get(app.id) ?? []), ...appReleases]) {
          merged.set(release.version, release);
        }
        const ordered = [...merged.values()].sort((left, right) => {
          try {
            return compareVersions(right.version, left.version);
          } catch {
            return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
          }
        });
        releases.set(app.id, ordered.slice(0, 100));
      }
    },

    async findApp(id) {
      return apps.get(id) ?? null;
    },

    async findAppBySource(fingerprint) {
      const needle = fingerprint.toLowerCase();
      for (const app of apps.values()) {
        if (`${app.source.host}/${app.source.path}`.toLowerCase() === needle) return app;
      }
      return null;
    },

    async search(query): Promise<SearchResult> {
      const offset = decodeCursor(query.cursor);
      const matched = [...apps.values()]
        .filter((app) => matches(app, query))
        .sort((left, right) => rank(right) - rank(left));

      const page = matched.slice(offset, offset + query.limit);
      const nextOffset = offset + page.length;

      return {
        items: page.map((app) => toSummary(app, app.health?.inputs.stars ?? null)),
        nextCursor: nextOffset < matched.length ? String(nextOffset) : null,
        tookMs: 0,
        queriedSources: [...new Set(page.map((app) => app.source.kind))],
      };
    },

    async listReleases(appId, limit) {
      return (releases.get(appId) ?? []).slice(0, limit);
    },

    async saveCollection(draft: CollectionDraft & { id?: string }): Promise<Collection> {
      const now = new Date().toISOString();
      const existing = draft.id === undefined ? undefined : collections.get(draft.id);
      const collection: Collection = {
        id:
          existing?.id ??
          draft.id ??
          `collection-${collections.size + 1}-${Date.now().toString(36)}`,
        name: draft.name,
        ...(draft.description === undefined ? {} : { description: draft.description }),
        appIds: [...(draft.appIds ?? existing?.appIds ?? [])],
        visibility: draft.visibility ?? existing?.visibility ?? 'private',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      collections.set(collection.id, collection);
      return collection;
    },

    async listCollections() {
      return [...collections.values()].sort((left, right) => left.name.localeCompare(right.name));
    },

    async applySync(operations: readonly SyncOperation[]) {
      const applied: string[] = [];
      const rejected: { id: string; reason: string }[] = [];

      for (const operation of operations) {
        if (operation.entity !== 'collection') {
          // Favourites, history and settings are client-owned; acknowledge them
          // so the offline queue drains without pretending to store them.
          applied.push(operation.id);
          continue;
        }

        if (operation.op === 'delete') {
          collections.delete(operation.entityId);
          applied.push(operation.id);
          continue;
        }

        const payload = operation.payload as
          | {
              name?: unknown;
              description?: string;
              appIds?: string[];
              visibility?: Collection['visibility'];
            }
          | undefined;

        if (payload === undefined || typeof payload.name !== 'string') {
          rejected.push({ id: operation.id, reason: 'collection payload requires a name' });
          continue;
        }

        await this.saveCollection({
          id: operation.entityId,
          name: payload.name,
          ...(payload.description === undefined ? {} : { description: payload.description }),
          ...(payload.appIds === undefined ? {} : { appIds: payload.appIds }),
          ...(payload.visibility === undefined ? {} : { visibility: payload.visibility }),
        });
        applied.push(operation.id);
      }

      syncCursor += 1;
      return {
        applied,
        rejected,
        collections: [...collections.values()],
        cursor: String(syncCursor),
      };
    },
  };
}
