# Testing

```bash
npm test                 # everything, once
npm run test:watch       # watch mode
npm run test:coverage    # with thresholds enforced
npx vitest run --project providers   # one workspace
```

Each workspace is a Vitest project with its own environment — `node` for the
domain and service packages, `jsdom` for the web client — so `npm test` at the
root runs the whole monorepo with the right runtime per package and no
cross-package leakage.

## What each layer tests

| Workspace | Focus |
| --- | --- |
| `contracts` | Conformance: every schema serialises to JSON Schema and round-trips a sample |
| `core` | Version comparison and channels, health scoring, identity derivation, use cases against fakes |
| `providers` | One adapter suite per provider against a scripted HTTP fake, plus the reference detector and the seed catalogue |
| `osp` | Manifest parsing and `osp://` round-trips |
| `sdk` | Request building, response validation, error mapping, abort handling |
| `gateway` | Route behaviour through `app.inject`, error mapping, store semantics, config, logger, process lifecycle |
| `web` | Console screens and components in jsdom, plus storefront route, state, hook, accessibility, live-verification and import/export behaviour with React Testing Library |

## Fakes over mocks

`packages/core/src/testing/fakes.ts` and `packages/providers/src/testing` provide
working implementations of the ports: a clock that does not move, a logger that
collects lines, an in-memory cache and store, and an HTTP double. Tests assert on
behaviour — "this reference produced this record", "the second call was served
from cache" — rather than on call sequences, so refactoring a provider does not
rewrite its tests.

Two rules learned the hard way and worth keeping:

- A fake that honours cancellation must check `signal.aborted` **at call time**,
  not when it is constructed; otherwise the cancellation test passes for the
  wrong reason.
- Assert the *shape* of upstream messages (an issue prefix, a count), never an
  exact string from a dependency. Zod rewords messages between releases.

## HTTP-level tests

`services/gateway/src/testing/harness.ts` builds a gateway with a fake clock,
fake HTTP and an in-memory store, then drives it with `app.inject` — no port, no
network, no database. Static client serving is opt-in (`registerStatic: true`),
so the API tests never depend on a built client being present. Tests that need a
real socket bind port `0` and read the assigned address.

## Storefront behaviour tests

`apps/web/src/routes.tsx` exports the production route tree separately from the
browser router instance, so `apps/web/src/storefront/storefront.test.tsx` can
mount the same routes through `createMemoryRouter`. Gateway calls are stubbed at
the `fetch` boundary; local state is reset through `localStorage` between tests.

These tests are intentionally behavioural: navigate between screens, drive
URL-backed filters, open the command palette from the keyboard, verify a listing
against a simulated `/api/resolve`, add and verify a custom HTTPS source, import
an Obtainium export, queue installs and updates, toggle settings and confirm
backup round-trips. Reducer and hook suites cover the same contracts at a lower
level. Progress timers are awaited rather than advanced with fake timers so the
queue's real interval behaviour is exercised.

## Coverage

`packages/*/src` and `services/*/src` are measured; the thresholds are **80%
statements, 80% functions, 80% lines, 75% branches**. Excluded on purpose:

- `packages/contracts/src/**` — declarative schemas, exercised by conformance;
- `packages/core/src/{model,ports}.ts` — types with no runtime body;
- `**/index.ts` — re-exports;
- `**/testing/**` — the fakes themselves.

The client (`apps/web`) is tested behaviourally in jsdom and is not part of the
coverage gate: measuring a React tree by line count rewards tests that assert
nothing. Untestable-in-CI paths — a real TLS handshake, a provider outage, browser
downloads — are covered by contract-level fakes instead, and the coverage number
is a floor rather than a goal.

## Reproducing CI locally

```bash
npm ci
npm run verify          # lint → typecheck → test → build
```
