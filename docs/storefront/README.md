# Orbisyn Store

**Every source. One orbit.**

The consumer storefront is the default application at `/`. It is a responsive
React/Vite PWA backed by the same Fastify gateway as the resolver console at
`/console`. The goal is not to imitate one existing store, but to combine the
useful capabilities of Komi/GitHub Store, Aurora, Obtainium, Droid-ify/F-Droid,
direct downloads and community registries while keeping their limitations
visible.

## Route map

| Route | Screen | What works |
| --- | --- | --- |
| `/` | Discover | Hero, source-mesh summary, spotlight, featured/trending/fresh shelves, category shortcuts, editor picks, trust and CTA sections. |
| `/explore` | Explore | URL-driven query, platform, category, source, open-source, verified and enabled-source filters; sorting; comparison tray/modal for up to three apps. |
| `/app/:appId` | App detail | Galleries, overview, release history, security evidence, source alternatives, preferred source, disclosed install/update handoff preview, wishlist, tracking, collections, sharing and **Verify live source**. |
| `/updates` | Updates | Pending updates, ignore, auto-update/Wi-Fi policies, live source sampling and update-all queue. |
| `/library` | Library | Installed apps, wishlist, tracking, collections, imported external references, local backup export/import and reset. |
| `/sources` | Sources | Seven compatibility bridges, enable/disable toggles, custom HTTPS source form, live verification, Obtainium/OSP JSON imports and F-Droid/Aurora templates. |
| `/settings` | Settings | Theme, density, motion, install method, signature/checksum/pinning/quarantine policy, prereleases, parallel downloads, network, telemetry, gateway URL and local data controls. |
| `/about` | About | Product story, source decisions, what is real in the preview and what a native shell adds. |
| `/console` | Resolver console | Existing transparent developer console: resolve, inspect diagnostics, releases, artifacts, providers, OSP and settings. |
| `/apps/:appId` | Legacy console deep link | Preserved from the original resolver client. |

## Source mesh

| ID | Mode | Lineage / coverage |
| --- | --- | --- |
| `forge` | Live API | GitHub, GitLab, Codeberg, Forgejo, Gitea. |
| `komi` | Catalog bridge | Komi Store, formerly GitHub Store / OpenHub. Treated as one lineage. |
| `droidify` | Live signed index | Droid-ify and F-Droid repositories; signing information only when upstream publishes it. |
| `obtainium` | Direct tracking | Release pages, artifact URLs and Obtainium export imports. |
| `aurora` | Companion handoff | Aurora/Google Play companion linking; no Play proxying or fabricated session. |
| `community` | Custom registry | Odion/Otherz-style HTTPS OSP/JSON registries with explicit verification status. |
| `direct` | Official artifact | Vendor pages, mirrors and direct installer URLs. |

No public Odion/Otherz API is claimed. Ambiguous community stores are supported
through user-supplied registries instead.

## Data honesty

`apps/web/src/storefront/data/apps.ts` contains 40 curated listings with real
upstream references. Fields prefixed `demo` — versions, sizes, dates, galleries
and screenshots — are explicitly preview data and are labelled as such in the UI.
Live facts come from the gateway:

- `GET /api/health` powers the provider-engine status strip.
- `POST /api/resolve` powers **Verify live source**, custom-source verification and update source sampling.
- `/api/catalog`, `/api/providers`, `/api/library`, `/api/updates/check`, OSP and app routes remain available to `/console` and API clients.

The browser calls only relative `/api` paths. Vite proxies them in development;
the built gateway serves the PWA and API from one origin in production.

## Local state

The storefront persists user choices in `localStorage` under `orbisyn.store.v1`:

- installed records, update queue, wishlist, tracking and ignored updates;
- collections, custom sources, imported external references, source toggles;
- settings, notifications and onboarding state.

Backups are versioned JSON (`format: "orbisyn-store-backup"`, `version: 1`) and
can be exported/imported from Settings or Library. Import accepts both the
versioned backup envelope and a bare persisted-state object. No account and no
telemetry are required.

The web preview does not have a native package-manager adapter. Its queue is a
clearly disclosed handoff preview: it does not verify, download, execute, or mark
an app as installed. After live verification, upstream artifact links can be
opened or downloaded manually; published hashes and signatures are displayed as
upstream evidence, not checked against downloaded bytes. Native installer
backends (system, session, Shizuku/Dhizuku, root, download-only) remain settings
for a future OS shell. First-run libraries, wishlists, tracking, and collections
start empty rather than showing sample data as if it belonged to the user.

## Accessibility and responsiveness

- Skip link, labelled landmark regions, semantic search form, keyboard command palette (`Ctrl/⌘ K`, `/`, `Esc`), focus-visible styles and reduced-motion settings.
- Desktop sidebar, tablet two-column layouts and a mobile bottom navigation with safe-area spacing.
- Drawers, modals, toasts, comparison tray and notification popover are reachable without hover.
- Light, dark and system themes plus comfortable/compact density.

## Verification and tests

Run `npm run verify` for lint, typecheck, all tests and both production builds.
Storefront behaviour tests live in `apps/web/src/storefront/*.test.ts(x)` and
cover:

- navigation, URL filters, command palette and landmark accessibility;
- live resolver evidence and error handling;
- custom-source validation, verification and Obtainium/OSP imports;
- install, update, wishlist, settings and import/export flows;
- reducer persistence, queue completion and backup round-trips;
- gateway health and live verification hooks.

For architecture details of the underlying engine, see
[architecture](../architecture/overview.md), [gateway](../architecture/gateway.md)
and [providers](../providers/README.md).
