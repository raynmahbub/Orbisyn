<div align="center">

<img src="design/brand/mark.svg" alt="" width="72" height="72" />

# Orbisyn

**Every source. One orbit.**

A modern, cross-platform app store for people who combine forges, F-Droid repos,
direct release pages, community registries and companion stores — without losing
sight of where an app actually came from.

[Storefront guide](docs/storefront/README.md) · [Documentation](docs/README.md) ·
[Provider contract](docs/providers/README.md) · [Protocol](docs/protocol/osp.md) ·
[Architecture decisions](docs/adr/README.md)

</div>

---

## What it is

Orbisyn has two faces on one origin:

| Surface | Route | Purpose |
| --- | --- | --- |
| **Orbisyn Store** | `/` | The consumer app store: discovery, filters, comparisons, detail pages, updates, library, sources, settings and onboarding. |
| **Resolver console** | `/console` | The transparent developer console: resolve a reference, inspect provider diagnostics, releases, artifacts, OSP and health data. |

The storefront is a full interactive PWA, not a landing page. It includes a
curated 40-app catalog, URL-driven search and filters, side-by-side comparison,
live upstream verification, an install/update queue, wishlists, tracking,
collections, custom sources, Obtainium/OSP imports, theme and density settings,
backup export/import, notifications, a command palette and responsive desktop,
tablet and mobile layouts.

## Source compatibility

Orbisyn models source **capabilities**, not fake integrations. Each bridge states
what is live, what is bridged, what is custom and what needs a companion session.

| Bridge | Mode | What it covers |
| --- | --- | --- |
| Forge mesh | Live API | GitHub, GitLab, Codeberg, Gitea and Forgejo releases and assets. |
| Komi / GitHub Store | Catalog bridge | One lineage: Komi Store is the successor to GitHub Store / OpenHub. |
| Droid-ify / F-Droid | Live signed indexes | Signed repository indexes, APK hashes and signer fingerprints where published. |
| Obtainium | Direct tracking | Release-page/URL tracking and Obtainium JSON export imports. |
| Aurora / Play | Companion handoff | Links to a local Aurora/Play session; the browser never proxies Google Play. |
| Odion / Otherz / community | Custom registry | HTTPS OSP/JSON registries with explicit verification status. No invented public API. |
| Direct download | Official artifact | Vendor pages, mirrors and direct installer URLs with source-pinning controls. |

**Honesty is a feature.** Curated listing versions, sizes and screenshots are
labelled `demo*` preview metadata. “Verify live source” fetches real facts from
the provider engine. Licenses, signatures, checksums, source lineage and missing
evidence are shown as published — never invented.

## Quick start

Requires **Node 22 or newer**.

```bash
git clone https://github.com/raynmahbub/Orbisyn.git
cd Orbisyn
npm ci

npm run dev          # gateway on :8787 + Vite storefront on :5173
```

Open <http://localhost:5173> for the storefront. Vite proxies relative `/api`
calls to the gateway, so the browser only ever sees one origin. The resolver
console is at <http://localhost:5173/console>.

Useful scripts:

```bash
npm run dev:web       # Vite only
npm run dev:api       # gateway watch only
npm run verify        # lint → typecheck → test → build
npm run preview       # production build served by one gateway process on :8787
npm run selfhost      # alias-style build + start for deployments
```

### Single-process deployment

```bash
npm run build
npm run start         # one process serving both the API and the built PWA on :8787
```

Or with containers:

```bash
cp .env.example .env
docker compose -f infra/docker/compose.yaml up --build
```

Optional tokens lift upstream rate limits and unlock private repositories — see
[configuration](docs/architecture/configuration.md). Orbisyn works anonymously
without them; a token just means fewer `429`s.

## Install it as an app

The web client is a PWA. On iOS, open the deployment in Safari and choose
**Share → Add to Home Screen**; on Android, use the install prompt in Chrome.
The manifest shortcuts open Explore, Updates, Library and Sources. Native OS
installer backends — system, session, Shizuku/Dhizuku, root and download-only —
are explicit settings/handoffs in this web preview; a native Orbisyn shell would
execute them on-device.

## Repository layout

```
packages/contracts   wire schemas and inferred types
packages/core        domain: entities, use cases, ports — no runtime dependencies
packages/providers   one adapter per source, plus ordered detection
packages/osp         the presence document and identity scheme
packages/sdk         typed, zod-validated client for the gateway
services/gateway     Fastify service: API, static client, process lifecycle
apps/web             React + Vite PWA: storefront at /, console at /console
docs/                architecture, providers, protocol, storefront, design, ADRs
infra/docker         image and compose file for self-hosting
design/brand         logo, app icon and wordmark
```

## Development

```bash
npm test               # the suite, including storefront behaviour tests
npm run test:coverage  # package coverage thresholds
npm run lint:fix       # format and fix
```

Storefront tests cover navigation, URL filters, live verification, custom
sources, library imports, install/update/wishlist flows, settings, backup
import/export and keyboard accessibility. See the
[storefront guide](docs/storefront/README.md) for the feature and route map.

## Principles

- **Verifiable over convenient.** A checksum appears only when the publisher
  published one; missing data stays missing.
- **One catalog, many honest sources.** Source lineage and bridge limitations are
  visible before an install is queued.
- **Explicit boundaries.** Validation on the way in *and* on the way out; a
  provider bug becomes a clear error, not corrupt data.
- **Ports, not frameworks, in the core.** The domain has no runtime dependencies,
  so it runs anywhere and is tested without I/O.
- **One origin.** No CORS story, no browser-side localhost calls, one artefact to
  deploy.

## Contributing

Bug reports and pull requests are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md). Security issues should go through
[SECURITY.md](SECURITY.md), not the public tracker.

## Licence

[AGPL-3.0-or-later](LICENSE). Self-host it, fork it, ship it inside your
organisation; if you run a modified version as a network service, publish your
changes.
