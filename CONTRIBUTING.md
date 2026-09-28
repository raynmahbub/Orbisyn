# Contributing

Thanks for taking the time. This document is short on purpose: it covers the
things that will otherwise cost you a review cycle.

## Getting a checkout running

```bash
git clone https://github.com/raynmahbub/Orbisyn.git
cd Orbisyn
npm ci
npm run verify
```

`npm run verify` is exactly what CI runs: lint, typecheck, tests, build. If it
passes locally, the pipeline will pass. Requires Node 22 or newer (`.nvmrc`).

## Where a change belongs

| Change | Package |
| --- | --- |
| A rule about projects, versions, health or identity | `packages/core` |
| A field on the wire, a request or response shape | `packages/contracts` |
| How a forge is read, or a new source | `packages/providers` |
| A route, an error mapping, configuration | `services/gateway` |
| A screen, a component, styling | `apps/web` |

Dependencies point inwards: `core` imports nothing, `providers` imports `core`,
the gateway imports everything, the client talks to the gateway through
`packages/sdk`. If your change needs an arrow in the other direction, it is a sign
the rule belongs somewhere else.

## Standards

- **TypeScript strict.** No `any`, no non-null assertions on values that can be
  absent, no `@ts-ignore`. If a type is genuinely unknowable, model it — a
  discriminated union beats a cast.
- **Tests come with the change.** Behaviour over call sequences: assert what the
  code produced, not the order in which it called a mock.
- **Comments explain why.** The code says what it does. A comment earns its place
  by recording a constraint, a trade-off or a decision the reader could otherwise
  reverse by accident.
- **Formatting is not a discussion.** `npm run lint:fix` and move on (Biome).
- **Commits** are small and describe the change in the imperative mood
  (`add F-Droid signature fingerprints to artifacts`).

## Adding a provider

The [provider contract](docs/providers/README.md) documents the interface and the
detection order. In short: implement `SourceProvider` in
`packages/providers/src/adapters`, register it in `registry.ts` at the position
its breadth justifies — `direct-url` matches every URL and must stay last — and
add an adapter suite driven by the scripted HTTP fake: a happy path, a 404, a
rate-limited response, and a payload that breaks your mapper's assumptions.

Nothing outside the adapter should need to change. If a screen or a route needs a
provider-shaped branch, the upstream detail has leaked and the mapping is where to
fix it.

## Documentation

Behaviour that a user or an operator can observe belongs in `docs/`. A decision
that could reasonably have gone the other way belongs in `docs/adr/` — state the
alternatives you considered, not just the conclusion.

## Pull requests

- Keep them focused; one idea per pull request reviews in minutes.
- Say what you verified and how (`npm run verify`, a live resolution, a device).
- New user-visible behaviour needs a note in the description at minimum, and a
  `CHANGELOG.md` entry if it changes an existing contract.

## Reporting bugs

Use the issue templates — the source reference, the expected record and the
diagnostics block from the client's resolution trace make a report reproducible in
minutes. Never paste an API token; redact it.

## Code of conduct

Participation is covered by the [Contributor Covenant](CODE_OF_CONDUCT.md). Report
unacceptable behaviour privately to the maintainers listed in the repository
profile.
