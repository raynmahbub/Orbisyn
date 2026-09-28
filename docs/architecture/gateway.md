# Gateway

One Fastify process. It serves the API under `/api` and the built web client from
every other path, which is why a deployment needs neither a reverse proxy nor a
CORS allowlist.

```
services/gateway/src
├── main.ts            process contract: load config, listen, exit gracefully
├── app.ts             composition root: build the context, register plugins and routes
├── config.ts          environment schema (see configuration.md)
├── context.ts         the assembled dependencies passed to every route
├── routes/            system · resolve · osp · library
├── store/             store composition, in-memory backend
├── errors.ts          DomainError → HTTP status → ApiError envelope
├── outbound.ts        validates responses before they leave the process
├── provider-health.ts per-provider success/failure tracker behind /api/health
├── logger.ts          pino, with redaction for tokens
└── static.ts          serves apps/web/dist and the SPA fallback
```

## HTTP surface

All routes are registered under `/api`. Paths below omit the prefix.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Version, uptime, per-provider state, active store |
| `GET` | `/providers` | Provider descriptors and capabilities |
| `GET` | `/catalog` | Curated collections and their entries |
| `POST` | `/resolve` | Resolve a reference into an `AppRecord` plus releases |
| `GET` | `/search` | Search stored records (`q`, `platform`, `license`, `source`, `minHealthScore`, `limit`, `cursor`) |
| `GET` | `/apps/:id` | One stored record |
| `GET` | `/apps/:id/releases` | Stored releases, `limit` 1–100 (default 10) |
| `GET` | `/osp/:id` | Resolve an `osp://` identity against the store |
| `GET` | `/collections` | List collections |
| `POST` | `/collections` | Create a collection (draft body, `201`) |
| `POST` | `/sync` | Drain a cursor-based mutation stream |
| `POST` | `/updates/check` | Compare installed versions against stored releases |

Anything else that is not an API path and asks for `text/html` receives the client
shell, so a refresh on `/apps/bitwarden-android` works; anything else receives the
JSON error envelope. Exactly one not-found handler exists — it decides between the
two — because two handlers would silently shadow each other.

### `POST /api/resolve`

```jsonc
// request
{ "reference": "https://github.com/bitwarden/android", "releases": 10, "refresh": false }

// response
{
  "app": { /* AppRecord */ },
  "releases": [ /* Release[] */ ],
  "diagnostics": {
    "source": "github",
    "cache": "miss",          // hit | miss | revalidate | bypass
    "durationMs": 412,
    "steps": [ { "stage": "resolve", "status": "ok", "detail": "github.com" } ]
  }
}
```

`releases: 0` resolves metadata only. `refresh: true` bypasses the cache for this
request and refreshes the entry. The resolved record is persisted before the
response is written, so two clients asking for the same reference cause one
upstream fetch.

## Validation

- **Inbound**: every request body and query string is parsed with the schema from
  `packages/contracts`. A malformed body becomes `400 bad-request` with the field
  path in `details`; it never reaches a provider or the store.
- **Outbound**: `parseOutbound` validates the response against the same schema
  family before serialisation. This is what turns a provider's surprise payload
  into `502 upstream-unavailable` with a readable message instead of a subtly
  wrong JSON document in a mobile client.

## Errors

| `DomainError` code | Status | `ApiError.code` |
| --- | --- | --- |
| — (schema failure) | 400 | `bad-request` |
| `invalid-reference` | 400 | `bad-request` |
| `unsupported-source` | 400 | `unsupported-source` |
| `source-not-found` | 404 | `not-found` |
| `source-unauthorized` | 401 | `unauthorized` |
| `source-rate-limited` | 429 | `rate-limited` |
| `invalid-release` | 422 | `validation-failed` |
| `identity-collision` | 409 | `conflict` |
| `source-protocol-error` | 502 | `upstream-unavailable` |
| `invariant-violated` | 500 | `internal` |
| anything else | 500 | `internal` |

Every error body is an `ApiError`: `{ error: { code, message, details?, retryAfterSeconds? }, requestId, timestamp }`.
Rate-limit rejections carry `retryAfterSeconds`, so a client can back off without
guessing.

## Middleware

- `@fastify/helmet` — the client is served from this origin and loads remote icons,
  so CSP is off and `crossOriginResourcePolicy` is `cross-origin`. `frameguard`
  (`sameorigin`) is applied in production only: in development the client is
  routinely embedded in an editor preview pane.
- `@fastify/cors` — `*` or an exact allowlist from `GATEWAY_CORS_ORIGINS`. A
  single-origin deployment does not need it at all; the option exists for clients
  served elsewhere.
- `@fastify/rate-limit` — per client address, `GATEWAY_RATE_LIMIT_MAX` per
  `GATEWAY_RATE_LIMIT_WINDOW_MS`; `0` disables the limiter.
- Body limit is 1 MiB. Credentials are read from configuration, never from a
  request: a client cannot make the gateway spend the operator's API quota.

## Health and degradation

`ProviderHealthTracker` records the outcome of every provider call. Three
consecutive failures mark a provider degraded and `/api/health` reports `degraded`
with the per-provider state and the timestamp of the last failure. The endpoint
itself never calls upstream — a monitoring system can poll it during an outage.
`store` reports the backend actually composed (`memory` today), which is how an
operator confirms what a running instance mounted.

## Process contract

`main.ts` exports three things: `startGateway()` (config → listen → return a
running handle), `installProcessHandlers()` (`SIGINT`/`SIGTERM` → graceful close
with an exit code; `unhandledRejection`/`uncaughtException` → logged, then exit),
and `main()`. The direct-run guard means importing the module in a test starts
nothing. Tests bind port `0` and read the assigned address, so they never collide
with a running development server.
