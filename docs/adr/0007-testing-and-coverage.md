# 0007 — Behavioural tests, and coverage as a floor

**Status:** accepted

## Context

The provider engine is entirely I/O: HTTP in, canonical records out. Tests that
mock call sequences pass when the code is wrong and fail when it is refactored.
Coverage numbers are easy to inflate with tests that assert nothing.

## Decision

- Ports are doubled with **fakes** — a clock that does not move, a logger that
  collects lines, an in-memory cache and store, a scripted HTTP double — and tests
  assert on observable behaviour: "this reference produced this record", "the
  second call was served from the cache".
- The gateway is tested through `app.inject`, with no port and no network; tests
  that need a real socket bind port `0`.
- The client is tested behaviourally in jsdom. It is **not** in the coverage gate.
- Coverage covers `packages/*/src` and `services/*/src`, excluding declarative
  schemas, type-only modules, re-exports and the fakes, with thresholds of 80%
  statements, 80% functions, 80% lines and 75% branches.

## Consequences

- Refactoring a provider does not rewrite its tests, and a failing test points at
  behaviour rather than at a call count.
- The thresholds are a floor rather than a target: a change that drops coverage
  fails the build, and a change that raises it is not automatically good.
- Excluded paths are excluded for a stated reason. A file excluded to make a
  number look better is a bug in this policy, not a convenience.
- Some paths (a real TLS failure, a provider outage, browser downloads) are not
  reproducible in CI and are covered by contract-level fakes instead. That gap is
  documented rather than hidden.
