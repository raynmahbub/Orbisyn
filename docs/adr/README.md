# Decision records

Each record states the context, the decision and the consequences, including the
ones we do not like. They are written once and amended rather than rewritten: a
superseded decision gets a new record that says so.

| # | Decision | Status |
| --- | --- | --- |
| [0001](./0001-typescript-monorepo.md) | One TypeScript monorepo, no framework at the edges | accepted |
| [0002](./0002-zero-dependency-core.md) | The domain package has no runtime dependencies | accepted |
| [0003](./0003-one-origin-gateway.md) | The gateway serves the client and the API from one origin | accepted |
| [0004](./0004-ordered-provider-detection.md) | Provider detection is ordered, not a scoring contest | accepted |
| [0005](./0005-canonical-model-and-osp.md) | A canonical record, and an identity the project owns | accepted |
| [0006](./0006-validation-at-the-boundaries.md) | Validate inbound *and* outbound payloads | accepted |
| [0007](./0007-testing-and-coverage.md) | Behavioural tests, and coverage as a floor | accepted |

## Format

A record answers four questions: what forced a decision, what we chose, what
follows from it, and what we gave up. If a record cannot name a real alternative
it considered, it is documentation, not a decision, and belongs in the
architecture pages instead.
