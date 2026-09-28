# Persistence

All persisted state goes through `AppStorePort` in `packages/core`. The gateway
composes a backend in `services/gateway/src/store/index.ts` and passes it into the
composition root; routes never construct one.

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

## The shipped backend

`store/memory.ts` keeps records, releases and collections in maps inside the
process. It is deliberate for the first release rather than a placeholder:

- one instance needs no external service, so `npm run start` is the whole
  deployment story;
- the cache already absorbs repeat resolutions, so the store is written on
  resolve and read on search, `/apps/:id` and sync;
- capacity is bounded (`maxApps`, 10 000 by default) and eviction is
  least-recently-updated, so an instance cannot grow without limit;
- `applySync` is idempotent per operation id and returns the same cursor
  semantics a durable backend would, which is what lets the client queue
  mutations offline today.

`/api/health` reports the backend that was actually composed, so what an operator
sees is never aspirational.

## What durability requires

Two things, in order:

1. **A deployment shape.** State in the process means requests from the same
   client must reach the same instance. On one host that is automatic; behind a
   load balancer it means sticky sessions until the backend below exists.
2. **A backend.** Implement `AppStorePort` — the queries are all key lookups or
   prefix matches, so an SQL backend needs one table for records, one for
   releases (indexed by `app_id, published_at DESC`), one for collections, and a
   unique index on the source fingerprint for `findAppBySource`. Return it from
   `createStore()` with its own `StoreKind`, and the routes, the SDK and the
   client stay untouched.

Migrations would live in their own directory at that point, owned by the backend
package rather than by the gateway; nothing in the current tree assumes a schema.

## Cache versus store

They are separate on purpose. `CachePort` holds resolved records with a TTL
(`GATEWAY_CACHE_TTL_SECONDS`, LRU-bounded) and is allowed to lose data — that only
costs an upstream request. The store is the record of what Orbisyn knows, and it
is what search, `/apps/:id`, `/api/osp/:id` and the update check read. Confusing
the two is what makes a metadata service re-fetch a repository for every page
view.
