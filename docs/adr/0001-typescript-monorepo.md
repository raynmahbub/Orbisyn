# 0001 — One TypeScript monorepo, no framework at the edges

**Status:** accepted

## Context

The project spans a domain model, a provider engine, a service, a client SDK and a
web app. They share types: an `AppRecord` built by a provider is the same object
the client renders. Versioned, independently published packages would mean
publishing and version-bumping five artefacts before a single feature lands, and
type drift would be caught at integration time rather than at compile time.

Desktop and mobile wrappers are a likely future direction, which argues for the
domain being a library rather than being embedded in the server.

## Decision

One repository, npm workspaces, strict TypeScript everywhere. Workspaces are
grouped by role — `packages/` (libraries), `services/` (processes), `apps/`
(clients), `tooling/` (shared configuration). Cross-package imports resolve to the
sibling's source through the root `tsconfig` paths, so there is no build step
between packages during development and no stale `.d.ts` files to explain.

No framework owns the domain: `packages/core` is plain TypeScript. React lives in
`apps/web`, Fastify in `services/gateway`. Either can be replaced without touching
the model.

## Consequences

- A change to a shared type is a compile error in every consumer, immediately.
- The whole tree is type-checked and tested by one command in one CI job.
- Publishing to npm would need per-package builds; until then, packages declare
  `private: true` and are consumed from source.
- The repository is bigger than a single package would be, and a contributor
  needs to know which workspace a change belongs to. The architecture page states
  the rule: dependencies point inwards.
