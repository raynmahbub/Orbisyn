# Configuration

Configuration is read once, at boot, and validated with a schema. A mistyped port
or a stray space in a token stops the process with a list of field errors rather
than surfacing as a puzzling 500 later. Empty strings are treated as absent.

`ENV_VAR_MAP` in `services/gateway/src/config.ts` is the single source of truth:
a variable that is not listed there is ignored, and the test suite checks that
table against `.env.example` in both directions, so the two cannot drift.

## Runtime

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test` or `production`. Production enables the frame guard. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` or `silent`. |

## Gateway service

| Variable | Default | Notes |
| --- | --- | --- |
| `GATEWAY_HOST` | `0.0.0.0` | Bind address. |
| `GATEWAY_PORT` | `8787` | `0` asks the OS for a free port (used by tests and embedded runs). |
| `GATEWAY_CORS_ORIGINS` | *(none)* | Comma-separated allowlist; `*` allows any origin. For native shells connecting to a different gateway origin, add the Capacitor/Tauri app origins documented in [native clients](./native-clients.md). |
| `GATEWAY_RATE_LIMIT_MAX` | `120` | Requests per window per address; `0` disables the limiter. |
| `GATEWAY_RATE_LIMIT_WINDOW_MS` | `60000` | Minimum 1000. |
| `ORBISYN_WEB_ROOT` | `apps/web/dist` | Directory holding a built client. Skipped when it does not exist, which is how the API-only development server works. |
| `ORBISYN_STORE_FILE` | `./var/orbisyn/store.json` | Durable JSON snapshot for resolved records, releases, collections, and sync cursor. Keep this path on persistent storage and back it up. |

## Outbound HTTP

| Variable | Default | Notes |
| --- | --- | --- |
| `GITHUB_TOKEN` | *(none)* | Lifts the anonymous limit from 60 to 5000 requests/hour and enables private repositories. |
| `GITLAB_TOKEN` | *(none)* | Same idea for GitLab, including self-hosted instances. |
| `ORBISYN_FORGE_TOKENS` | *(none)* | `host=token` pairs for self-hosted forges, e.g. `forgejo.example.org=abc123`. Malformed pairs are dropped rather than failing the boot: one bad token must not stop the other forges. |
| `ORBISYN_FORGE_HOSTS` | *(none)* | Extra self-hosted Forgejo/Gitea hosts to probe. |
| `GATEWAY_HTTP_TIMEOUT_MS` | `10000` | Per attempt, including retry budget. Minimum 1000. |

## Cache

| Variable | Default | Notes |
| --- | --- | --- |
| `GATEWAY_CACHE_TTL_SECONDS` | `300` | Freshness window for resolved records; `0` disables caching. |
| `GATEWAY_CACHE_MAX_ENTRIES` | `2000` | LRU capacity. Minimum 16. |

## Build

| Variable | Default | Notes |
| --- | --- | --- |
| `ORBISYN_VERSION` | `0.1.0-dev.0` | Reported by `/api/health` and used in the outbound `User-Agent`. A release build sets it from the tag. |

## Local development

```bash
cp .env.example .env
npm install
npm run dev        # gateway on :8787 and storefront on :5173
npm run dev:api    # gateway only, when you need a separate terminal
npm run dev:web    # Vite only, when you need a separate terminal
npm run preview    # production build served by one process on :8787
```

The client never reads these variables: it calls `/api` on its own origin, and the
Vite dev server proxies that path to `ORBISYN_GATEWAY_URL` (default
`http://127.0.0.1:8787`). One origin in development, one origin in production.

Behind a TLS-inspecting proxy, Node may need the proxy's CA in addition to its
bundled store. Point `NODE_EXTRA_CA_CERTS` at the PEM certificate bundle for that
proxy when starting the gateway. Without the CA, Node's outbound `fetch` may fail
TLS verification; the gateway surfaces that as a typed `upstream-unavailable`
response rather than pretending a source resolved.

## Secrets

`.env` is git-ignored; `.env.example` documents every variable and contains no
real value. Redaction is configured on the logger itself rather than left to call
sites — `req.headers.authorization`, `req.headers.cookie` and any `token` or
`accessToken` field are replaced with `[redacted]` — and the HTTP client strips
token query parameters from error messages, so a credential cannot leak into a
log line or an error response.
