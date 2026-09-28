# Security policy

## Supported versions

The project is pre-1.0: fixes land on `main` and are released as tags. Only the
latest release and `main` receive security fixes.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Report it privately
through GitHub's [private vulnerability reporting][report] on this repository, or
email the maintainers if you cannot use it.

Include, as far as you can:

- what the issue is and which component it affects (gateway, provider adapter,
  web client, build);
- the smallest reproduction you have — a reference, a request, a configuration;
- the version or commit you tested;
- any impact you can already demonstrate.

You will get an acknowledgement within a few days. There is no bug bounty; there
is a genuine thank you in the release notes unless you prefer otherwise.

[report]: https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability

## What is in scope

- The gateway's HTTP surface: authentication of outbound credentials, rate
  limiting, request validation, response validation, error envelopes that leak no
  internals.
- The provider engine: server-side request forgery through a crafted reference
  (for example a reference that makes the gateway fetch an internal address),
  unbounded reads, redirect handling that escapes an allowlist.
- Credential handling: tokens reaching logs, error messages, responses or the
  client.
- The web client: cross-site scripting through provider-supplied fields (names,
  descriptions, release notes, artifact names), and anything that would make the
  PWA a vector rather than a viewer.

## What is out of scope

- Findings that require a compromised device, an already-installed malicious
  browser extension, or physical access.
- Missing hardening headers on a deployment that has deliberately disabled them.
- Rate limits on a self-hosted instance where the operator set
  `GATEWAY_RATE_LIMIT_MAX=0`.
- Reports generated solely by a scanner without a demonstration of impact.

## How the project handles credentials

Tokens are read from the environment at boot, held in memory and attached to
outbound requests only. They are never accepted from a client, never written to
disk, redacted from logs at the logger level, and stripped from error messages.
If you believe a token can be extracted by any route, that is a vulnerability and
worth reporting.

## Operational notes for operators

- Run the gateway behind TLS; it trusts `X-Forwarded-*` headers (`trustProxy`) and
  is intended to sit behind a reverse proxy that terminates TLS.
- Keep `GATEWAY_CORS_ORIGINS` as an exact allowlist in production; `*` is for
  local development.
- Set `NODE_ENV=production` so the frame guard is applied.
- Use the container image or run the service as an unprivileged user; the process
  needs no write access to its own filesystem.
