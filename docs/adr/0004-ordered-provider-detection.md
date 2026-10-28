# 0004 — Provider detection is ordered, not a scoring contest

**Status:** accepted

## Context

A pasted reference is ambiguous. `https://github.com/owner/repo` is a forge
repository; `https://example.org/app-1.4.2.apk` is a file; `org.fdroid.fdroid`
looks exactly like a host name; `forgejo.example.org/team/app` is a self-hosted
forge nobody has heard of.

Scoring candidates by confidence sounds flexible and is not: the failure mode is
silent misclassification, where a repository is resolved as a download, and the
user gets a confident, wrong record.

## Decision

Detection is a fixed, explicit order: **github → gitlab → codeberg → forgejo →
fdroid → direct-url**. Each provider answers `supports(reference)` synchronously,
and the first `true` wins. `direct-url` accepts any absolute URL, so it is last by
construction.

Self-hosted Gitea-family forges cannot be recognised by URL shape, so they are
configured (`ORBISYN_FORGE_HOSTS`) rather than guessed: an unconfigured
`forgejo.*` host fails with an actionable message instead of becoming a download
record.

Ambiguity between a package name and a host name is resolved by explicit rules
(three or more segments is a package; two segments with a familiar TLD is a host;
otherwise the vendor prefix decides) rather than by a maintained suffix list.

## Consequences

- The behaviour is testable and explainable: for any reference there is one
  provider, and the order in the registry is the specification.
- Adding an ecosystem means choosing a position in that order, which forces the
  question "what does this provider take away from the others?".
- A genuinely ambiguous case is resolved in favour of the richer provider, which
  may occasionally be surprising — but it is never silent, because diagnostics
  report which provider answered.
