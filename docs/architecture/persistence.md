# Persistence

All server-side state goes through `AppStorePort` in `packages/core`. The gateway
composes the backend in `services/gateway/src/store` and passes it into the
composition root; routes never construct a store directly.

```ts
export interface AppStorePort {
  saveApp(app: AppRecord, releases: readonly Release[]): Promise<void>;
  findApp(id: string): Promise<AppRecord | null>;
  findAppBySource(fingerprint: string): Promise<AppRecord | null>;
  search(query: SearchQuery): Promise<SearchResult>;
  listReleases(appId: string, limit: number): Promise<readonly Release[]>;
  saveCollection(draft: CollectionDraft & { id?: string }): Promise<Collection>;
  listCollections(): Promise<readonly Collection[]>;
  applySync(operations: readonly SyncOperation[]): Promise<SyncOutcome>;
}
```

## File-backed store

The gateway process uses a versioned JSON snapshot at
`ORBISYN_STORE_FILE` (default `./var/orbisyn/store.json`). It persists resolved
records, releases, collections, and the library-sync cursor across restarts.
Writes are serialized within the process, validated on startup, written to a
same-directory temporary file, synced, then atomically renamed into place. A
failed write rolls the in-memory mutation back; malformed or unsupported state
fails startup rather than being silently overwritten.

The default location is ignored by Git. In Docker Compose, the snapshot is stored
on the `orbisyn-data` named volume mounted at `/data`. Back up that volume before
upgrading or moving an instance. The server store does not include browser-local
favorites, theme preferences, or install queue state; those remain in the PWA's
local storage and user-exportable backup.

This adapter is intentionally scoped to **one gateway process and modest
catalogs**. It rewrites a bounded snapshot after each write. Do not share the
same file between replicas or network filesystems; use a database-backed adapter
for multiple instances or high write volume. The memory adapter remains available
for tests and embedded callers through `createStore()`.

## Cache versus store

They are separate on purpose. `CachePort` holds resolved records with a TTL
(`GATEWAY_CACHE_TTL_SECONDS`, LRU-bounded) and is allowed to lose data — that only
costs an upstream request. The store is the record of what Orbisyn knows, and it
is what search, `/api/apps/:id`, `/api/osp/:id` and the update check read. Confusing
the two is what makes a metadata service re-fetch a repository for every page
view.
