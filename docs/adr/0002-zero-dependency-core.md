# 0002 — The domain package has no runtime dependencies

**Status:** accepted

## Context

Metadata services accumulate dependencies quickly: an HTTP client, a validator, a
date library, a logger, a cache. Each one is a supply-chain risk, a bundle-size
cost for a client that will run the same logic, and a reason a domain test needs a
fake.

## Decision

`packages/core` declares no runtime dependencies and imports no other workspace
package — not even `@orbisyn/contracts`. Everything it needs arrives through a
port: `ClockPort`, `LoggerPort`, `HttpPort`, `CachePort`, `AppStorePort`,
`CredentialStorePort`, `SourceProvider`. Adaptations live in the packages that own
the technology.

Ports are interfaces with no default implementation. The gateway composes the
adapters; tests compose fakes.

## Consequences

- The domain can be reasoned about and tested with no I/O whatsoever: the use case
  suites run in milliseconds and cannot flake.
- Time, randomness and network are explicit in every signature, which is why the
  repository can state "no invented statistics" and mean it — every number in a
  record is traceable to a provider response.
- Ports are defined by the consumer, so a new capability means a new interface
  plus at least one adapter, which is more ceremony than calling a library
  directly. The boundary is worth it where the data must be verifiable.
- A useful side effect: the client can import domain logic (version comparison,
  health scoring) without pulling a single dependency into the browser bundle.
