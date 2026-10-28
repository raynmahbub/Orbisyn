# 0005 — A canonical record, and an identity the project owns

**Status:** accepted

## Context

Six providers describe the same project six ways. If each shape leaked into the
client, every screen would need a per-provider branch, and the database would
become a pile of upstream-specific fields. Meanwhile, a record keyed by a GitHub
path is meaningless the moment a project mirrors to Codeberg or migrates.

## Decision

Everything is mapped into one `AppRecord` (with a compact `AppSummary` for list
endpoints). Providers convert into the model; nothing above them knows what a
provider's JSON looked like.

Identity is ours and the project's at the same time: `osp://<id>`, where the id is
a slug of the canonical name with a short digest suffix when two sources collide.
Collisions are reported (`identity-collision`, HTTP 409) rather than resolved by
overwriting. A publisher can also state their own facts in an `orbisyn.json`
document, which the verifier cross-checks against the independently resolved
record.

## Consequences

- Screens and endpoints are provider-agnostic, and a new provider adds no UI code.
- Searching and comparing projects requires the mapping to be lossy on purpose:
  fields that only one provider has are not modelled, and the capability set is how
  the absence is declared (`repositoryStats: false` for F-Droid).
- A project that migrates keeps its identity, and `replaces` in a presence
  document records the old one.
- The OSP document is optional. Most repositories will never have one, and
  resolution must not depend on it — absence is a normal, silent outcome.
