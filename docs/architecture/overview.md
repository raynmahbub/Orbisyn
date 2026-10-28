# Architecture

Orbisyn turns a reference to an open-source project into one canonical, verifiable
record. The reference can be anything a person might paste — a GitHub URL, an
F-Droid package id, an `osp://` identity, a link to an APK — and the output is
always the same shape: an `AppRecord`, its releases, and a diagnostics trail that
says which provider answered and how long it took.

## Shape of the system

```
            browser (PWA)                other clients
                  │                            │
                  │  HTTP, same origin         │  HTTP
                  ▼                            ▼
        ┌───────────────────────────────────────────────┐
        │  services/gateway      Fastify, one origin    │
        │  routes → use cases → ports → providers       │
        └───────────────────────────────────────────────┘
                  │                            │
                  ▼                            ▼
        packages/core (domain)        packages/providers (adapters)
                                              │
                                              ▼
                             github · gitlab · codeberg · forgejo
                                  fdroid · direct download
```

The gateway serves the built client from the same origin as the API, so a
deployment is one process on one port with no reverse proxy and no CORS
configuration. Everything the browser needs is fetched from `/api/...`.

## Layers

| Layer | Package | Rules |
| --- | --- | --- |
| Domain | `packages/core` | No runtime dependencies, no I/O, no knowledge of HTTP or of any provider SDK. Entities, use cases, ports, errors. |
| Contracts | `packages/contracts` | The wire format. Zod schemas that are validated on the way in *and* on the way out. Depends on `zod` only. |
| Providers | `packages/providers` | The only place that knows a forge's URL layout. Implements the `SourceProvider` port; every network call goes through one HTTP port. |
| Identity | `packages/osp` | The `osp://` scheme and the `orbisyn.json` manifest: how a project names itself. |
| Client SDK | `packages/sdk` | A typed, zod-validated client for the gateway. Shared by the web app and any script. |
| Service | `services/gateway` | Composition root: configuration, routing, error mapping, static client, process lifecycle. |
| Client | `apps/web` | React + Vite PWA. Talks to the gateway through the SDK, caches in IndexedDB, works offline. |

Dependencies point inwards and only inwards: `core` imports nothing, `providers`
imports `core`, `gateway` imports all of them. The dependency rule is enforced by
package boundaries rather than by convention — `core` has no dependencies to
import from in the first place.

## Request lifecycle

A resolution request is the interesting path, because it is the only one that
touches the open internet:

1. `POST /api/resolve` validates the body against `ResolveRequestSchema`. A
   malformed body never reaches a provider.
2. `ResolveSourceUseCase` normalises the reference (trim, lowercase, strip the
   scheme, drop a trailing `.git`) and asks the registry for the first provider
   that claims it.
3. The provider fetches from its API through `HttpPort`, maps the response into
   domain entities, and reports telemetry (`cache`, `durationMs`).
4. The use case computes the health score, derives the `osp://` identity and
   returns the record.
5. The route persists the record and validates the *response* against
   `ResolveResponseSchema` before serialising it. A provider bug becomes a 502
   with a readable message instead of a broken payload in someone's client.
6. Success or failure is recorded per provider, which is what `/api/health`
   reports as `ok` or `degraded`.

Caching sits between step 3 and the network: `CachePort` keys on the normalised
reference, honours `refresh: true` to bypass, and reports `hit`, `miss`,
`revalidate` or `bypass` back through diagnostics.

## Failure model

Failures are values, not accidents. `DomainError` carries a stable code
(`source-not-found`, `rate-limited`, `invariant-violated`, …) which the gateway
maps to an HTTP status and an `ApiError` envelope containing a request id and a
timestamp. Nothing throws a raw `TypeError` at a client; if an unexpected error
escapes, the error handler logs it with the request id and answers `500` with the
same envelope shape.

## Extending it

- **A new provider**: implement `SourceProvider`, add it to the registry in
  `packages/providers/src/catalog`, and write the adapter's tests against a fake
  HTTP port. Nothing in the client or the gateway names a provider.
- **A new endpoint**: add the route in `services/gateway/src/routes`, the schema
  in `packages/contracts`, and the SDK method. The schema is the contract; the
  route is a thin adapter over a use case.
- **A different store**: implement `AppStorePort` and return it from
  `services/gateway/src/store/index.ts`. See [persistence](./persistence.md).

Further reading: [gateway](./gateway.md), [data model](./data-model.md),
[configuration](./configuration.md), [testing](./testing.md),
[provider contract](../providers/README.md), [decision records](../adr/README.md).
