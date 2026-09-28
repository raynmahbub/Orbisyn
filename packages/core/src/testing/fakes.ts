import { createConsoleLogger } from '../adapters/console-logger.js';
import { createFixedClock } from '../adapters/system-clock.js';
import type {
  AppRecord,
  Collection,
  CollectionDraft,
  Platform,
  ProviderCapabilities,
  ProviderDescriptor,
  Release,
  SearchQuery,
  SearchResult,
  SourceKind,
  SyncOperation,
} from '../model.js';
import { EMPTY_TELEMETRY } from '../model.js';
import type {
  AppStorePort,
  CachePort,
  ClockPort,
  LoggerPort,
  ProviderContext,
  ProviderRegistryPort,
  ProviderResolution,
  ResolveOptions,
  SourceProvider,
} from '../ports.js';
import { toSummary } from '../ports.js';

/**
 * Test doubles.
 *
 * The domain is defined entirely in terms of ports, so every use case can be
 * exercised with deterministic fakes: no network, no clock drift, no fixtures to
 * clean up. These doubles are also the reference for what a real adapter must
 * provide.
 */

export const CAPABILITIES: ProviderCapabilities = {
  resolveApp: true,
  listReleases: true,
  listArtifacts: true,
  verifyArtifacts: true,
  repositoryStats: true,
  projectGovernance: true,
  authenticated: false,
};

export function createFakeProvider(options: {
  kind?: SourceKind;
  supports?: (reference: string) => boolean;
  resolve?: (reference: string, options: ResolveOptions) => Promise<ProviderResolution>;
  descriptor?: Partial<ProviderDescriptor>;
}): SourceProvider & { calls: string[] } {
  const kind = options.kind ?? 'github';
  const calls: string[] = [];

  return {
    calls,
    descriptor: {
      kind,
      label: kind,
      homepage: 'https://example.test',
      capabilities: CAPABILITIES,
      examples: [],
      status: 'stable',
      ...options.descriptor,
    },
    supports: options.supports ?? (() => true),
    async resolve(
      reference,
      _context: ProviderContext,
      resolveOptions,
    ): Promise<ProviderResolution> {
      calls.push(reference);
      if (options.resolve !== undefined) return options.resolve(reference, resolveOptions);
      return createProviderResolution(kind);
    },
  };
}

export function createProviderResolution(kind: SourceKind = 'github'): ProviderResolution {
  const app: AppRecord = {
    id: 'example-app',
    ospUri: 'osp://example-app',
    name: 'Example App',
    summary: 'A resolvable example',
    screenshots: [],
    license: 'MIT',
    categories: ['utilities'],
    tags: [],
    platforms: ['android'] satisfies Platform[],
    source: {
      kind,
      id: '1',
      host: 'github.com',
      path: 'example/app',
      webUrl: 'https://github.com/example/app',
    },
    alternateSources: [],
    archived: false,
    fetchedAt: '2024-01-01T00:00:00.000Z',
  };

  return {
    app,
    releases: [createRelease()],
    telemetry: { ...EMPTY_TELEMETRY, stars: 120, licenseSpdx: 'MIT' },
  };
}

export function createRelease(overrides: Partial<Release> = {}): Release {
  return {
    id: 'example-app:1',
    appId: 'example-app',
    source: 'github',
    version: '1.4.0',
    channel: 'stable',
    isPrerelease: false,
    publishedAt: '2024-01-01T00:00:00.000Z',
    sourceUrl: 'https://github.com/example/app/releases/tag/v1.4.0',
    artifacts: [],
    fetchedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function createFakeRegistry(providers: readonly SourceProvider[]): ProviderRegistryPort {
  return {
    all: () => providers,
    descriptors: () => providers.map((provider) => provider.descriptor),
    get: (kind) => providers.find((provider) => provider.descriptor.kind === kind) ?? null,
    detect: (reference) => providers.find((provider) => provider.supports(reference)) ?? null,
  };
}

export function createFakeStore(seed: readonly AppRecord[] = []): AppStorePort & {
  readonly apps: Map<string, AppRecord>;
  readonly releases: Map<string, Release[]>;
  readonly collections: Map<string, Collection>;
} {
  const apps = new Map(seed.map((app) => [app.id, app]));
  const releases = new Map<string, Release[]>();
  const collections = new Map<string, Collection>();
  let cursor = 0;

  return {
    apps,
    releases,
    collections,

    async saveApp(app, appReleases) {
      apps.set(app.id, app);
      if (appReleases.length > 0) releases.set(app.id, [...appReleases]);
    },

    async findApp(id) {
      return apps.get(id) ?? null;
    },

    async findAppBySource(fingerprint) {
      for (const app of apps.values()) {
        if (`${app.source.host}/${app.source.path}`.toLowerCase() === fingerprint.toLowerCase()) {
          return app;
        }
      }
      return null;
    },

    async search(query: SearchQuery): Promise<SearchResult> {
      const needle = query.q.toLowerCase();
      const matched = [...apps.values()]
        .filter((app) => app.name.toLowerCase().includes(needle) || app.id.includes(needle))
        .filter(
          (app) =>
            query.platform === undefined || app.platforms.some((p) => query.platform?.includes(p)),
        )
        .slice(0, query.limit)
        .map((app) => toSummary(app, app.health?.inputs.stars ?? null));

      return { items: matched, nextCursor: null, tookMs: 0, queriedSources: [] };
    },

    async listReleases(appId, limit) {
      return (releases.get(appId) ?? []).slice(0, limit);
    },

    async saveCollection(draft: CollectionDraft & { id?: string }): Promise<Collection> {
      const now = new Date().toISOString();
      const existing = draft.id === undefined ? undefined : collections.get(draft.id);
      const collection: Collection = {
        id: existing?.id ?? draft.id ?? `collection-${collections.size + 1}`,
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
      return [...collections.values()];
    },

    async applySync(operations: readonly SyncOperation[]) {
      const applied: string[] = [];
      const rejected: { id: string; reason: string }[] = [];

      for (const operation of operations) {
        if (operation.entity !== 'collection') {
          applied.push(operation.id);
          continue;
        }
        if (operation.op === 'delete') {
          collections.delete(operation.entityId);
          applied.push(operation.id);
          continue;
        }
        const payload = operation.payload as CollectionDraft | undefined;
        if (payload === undefined || typeof payload.name !== 'string') {
          rejected.push({ id: operation.id, reason: 'collection payload requires a name' });
          continue;
        }
        await this.saveCollection({ ...payload, id: operation.entityId });
        applied.push(operation.id);
      }

      cursor += 1;
      return { applied, rejected, collections: [...collections.values()], cursor: String(cursor) };
    },
  };
}

export function createFakeCache(
  clock: ClockPort,
): CachePort & { readonly entries: Map<string, unknown> } {
  const entries = new Map<string, { value: unknown; storedAt: string; expiresAt: string }>();

  return {
    entries,
    async get<T>(key: string) {
      const entry = entries.get(key);
      if (entry === undefined) return null;
      return {
        value: entry.value as T,
        storedAt: entry.storedAt,
        expiresAt: entry.expiresAt,
        stale: Date.parse(entry.expiresAt) <= clock.now().getTime(),
      };
    },
    async set<T>(key: string, value: T, ttlSeconds: number) {
      const now = clock.now();
      entries.set(key, {
        value,
        storedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
      });
    },
    async delete(key: string) {
      entries.delete(key);
    },
  };
}

export function testClock(
  iso = '2024-06-01T00:00:00.000Z',
): ClockPort & { advance(ms: number): void } {
  return createFixedClock(iso);
}

export function silentLogger(): LoggerPort {
  return createConsoleLogger({ test: true }, 'error');
}

export function neverCredentials() {
  return { get: () => null };
}
