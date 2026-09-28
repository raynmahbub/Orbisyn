<div align="center">

<img src="design/brand/mark.svg" alt="" width="72" height="72" />

# Orbisyn

**Every source, one orbit.** Paste a GitHub link, an F-Droid package, a Forgejo
repository or a plain download URL — get back one canonical, verifiable record.

[Documentation](docs/README.md) · [Provider contract](docs/providers/README.md) ·
[Protocol](docs/protocol/osp.md) · [Decisions](docs/adr/README.md)

</div>

---

## What it does

A reference goes in, a project record comes out: name, licence, platforms, release
history, artifacts with the checksums their publisher actually signed, and a health
score whose components are shown rather than hidden. Six sources are supported
today:

| Provider | Status | What it adds |
| --- | --- | --- |
| GitHub | stable | Releases, assets with SHA-256 digests, stars, contributors, policy files |
| GitLab | stable | Releases and asset links, on gitlab.com or any self-managed instance |
| Codeberg | stable | The Gitea-family API on the public instance |
| Forgejo | beta | The same API on hosts you configure |
| F-Droid | stable | Every published version with its APK hash and signing fingerprint |
| Direct download | beta | Vendors and mirrors that publish outside a forge |

Every record is a first-class citizen of the OSP identity scheme (`osp://…`),
resolvable through the API and by any client that speaks the protocol.

## Quick start

Requires **Node 22 or newer**.

```bash
git clone https://github.com/raynmahbub/Orbisyn.git
cd Orbisyn
npm ci

npm run dev:api     # gateway + API on http://localhost:8787
npm run dev         # web client on http://localhost:5173, proxying /api
```

Open <http://localhost:5173>, paste a reference such as
`https://github.com/florisboard/florisboard`, and press **Resolve**.

### Single-process deployment

```bash
npm run build       # gateway bundle + web client
npm run start       # one process serving both on :8787
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
Both wrap the same build, offline library and all.

## Repository layout

```
packages/contracts   wire schemas and inferred types
packages/core        domain: entities, use cases, ports — no runtime dependencies
packages/providers   one adapter per source, plus ordered detection
packages/osp         the presence document and identity scheme
packages/sdk         typed, zod-validated client for the gateway
services/gateway     Fastify service: API, static client, process lifecycle
apps/web             React + Vite PWA: browse, resolve, track, work offline
docs/                architecture, providers, protocol, design, ADRs
infra/docker         image and compose file for self-hosting
design/brand         logo, app icon and wordmark
```

## Development

```bash
npm run verify         # lint → typecheck → test → build (what CI runs)
npm test               # the suite
npm run test:coverage  # with thresholds enforced
npm run lint:fix       # format and fix
```

The gateway and the web client are two workspaces with one contract: the client
calls relative `/api` paths and never sees another origin. Details, including the
error envelope and every environment variable, are in
[docs/architecture](docs/architecture/overview.md).

## Principles

- **Verifiable over convenient.** A checksum appears only when the publisher
  published one; missing data scores neutral, never zero and never invented.
- **Explicit boundaries.** Validation on the way in *and* on the way out; a
  provider bug becomes a clear `502`, not corrupt data on a phone.
- **Ports, not frameworks, in the core.** The domain has no runtime dependencies,
  so it runs anywhere and is tested without I/O.
- **One origin.** No CORS story, no proxy to misconfigure, one artefact to deploy.

## Contributing

Bug reports and pull requests are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md). Security issues should go through
[SECURITY.md](SECURITY.md), not the public tracker.

## Licence

[AGPL-3.0-or-later](LICENSE). Self-host it, fork it, ship it inside your
organisation; if you run a modified version as a network service, publish your
changes.
