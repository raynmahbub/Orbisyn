# Providers

A provider is the only part of Orbisyn that knows how one ecosystem's URLs and
APIs look. Everything above it — use cases, routes, clients — works with the
domain types only.

| Provider | Status | Reference examples |
| --- | --- | --- |
| [GitHub](./github.md) | stable | `https://github.com/bitwarden/android`, `florisboard/florisboard` |
| [GitLab](./gitlab.md) | stable | `https://gitlab.com/KDE/kdenlive`, `gitlab.gnome.org/GNOME/loupe` |
| [Codeberg & Forgejo](./gitea.md) | stable / beta | `https://codeberg.org/forgejo/forgejo`, `forgejo.example.org/team/app` |
| [F-Droid](./fdroid.md) | stable | `https://f-droid.org/packages/org.fdroid.fdroid`, `fdroid:com.termux` |
| [Direct download](./direct-url.md) | beta | `https://example.org/releases/app-1.4.2.apk` |

## The contract

```ts
export interface SourceProvider {
  readonly descriptor: ProviderDescriptor;
  /** Cheap, synchronous check: can this provider handle the reference? */
  supports(reference: string): boolean;
  /** Resolves the reference into a canonical record plus its release history. */
  resolve(
    reference: string,
    context: ProviderContext,
    options: ResolveOptions,
  ): Promise<ProviderResolution>;
}
```

`ProviderContext` is injected and contains the HTTP port, clock, logger,
credential store and timeout. A provider never constructs a client, never reads
the environment and never logs directly, which is why the adapter suites run
without a network.

`ProviderResolution` returns the `AppRecord`, the releases, and the raw telemetry
(stars, forks, contributors, CI, policies). The domain turns telemetry into the
health score; a provider does not compute scores, so two providers with the same
facts produce the same score.

## Detection order

`parseRef` classifies a pasted string as a URL, a `host/path` pair, a shorthand
(`owner/repo`), a reverse-DNS package name, an `osp://` URI, or unknown. Ambiguity
between a package name and a host name is resolved without a suffix list:

1. three or more segments is always a package (`org.fdroid.fdroid`);
2. two segments is a host when the tail is a familiar TLD (`f-droid.org`),
   otherwise a package (`com.termux`);
3. failing both, a known vendor prefix decides (`io.github.x` is a package).

The registry then asks providers in a fixed order — **github → gitlab → codeberg
→ forgejo → fdroid → direct-url** — and the first provider whose `supports`
returns `true` handles the request. The order matters: a GitHub URL that also contains a file
name must not fall through to the direct-download provider. Self-hosted
Forgejo/Gitea instances cannot be detected by pattern, so they are configured
(`ORBISYN_FORGE_HOSTS`) and matched by host.

`GET /api/providers` returns each descriptor with its capability set and a
`status` of `stable`, `beta` or `experimental`, so a client can label
experimental support without hardcoding provider names.

## Capabilities

| Provider | resolveApp | listReleases | listArtifacts | verifyArtifacts | repositoryStats | projectGovernance | authenticated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GitHub | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| GitLab | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| Codeberg / Forgejo | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| F-Droid | ✓ | ✓ | ✓ | ✓ | — | ✓ | — |
| Direct download | ✓ | — | ✓ | — | — | — | — |

A capability is a statement about the upstream API, not about effort. F-Droid
publishes no stars, so `repositoryStats` is `false` and the community component
scores the neutral value rather than guessing. GitLab does not publish a detached
checksum for release assets, so `verifyArtifacts` is `false` and the client does
not claim otherwise.

## HTTP behaviour

Every outbound call goes through `createFetchHttpClient`:

- **Timeouts**: 10s per attempt by default (`GATEWAY_HTTP_TIMEOUT_MS`).
- **Retries**: up to 2, on `408, 425, 429, 500, 502, 503, 504`, with exponential
  backoff and full respect for `Retry-After`.
- **User agent**: `Orbisyn/<version> (+https://github.com/raynmahbub/Orbisyn)`.
- **Credentials**: attached per provider from the credential store; never from a
  request.
- **Errors**: a failed request throws a `DomainError` (`source-not-found`,
  `rate-limited`, `unauthorized`, `source-protocol-error`) and token query
  parameters are redacted from the message before it is logged.
- **Cancellation**: an abort signal from the caller stops the request, including
  when the signal was already aborted before the call started.

## Adding a provider

1. Write the adapter in `packages/providers/src/adapters`, mapping upstream JSON
   into `AppRecord`, `Release`, `Artifact` and `RepositoryTelemetry`.
2. Register it in `packages/providers/src/registry.ts` so detection order stays
   explicit — `direct-url` matches every absolute URL and must remain last.
3. Add an adapter suite driven by a scripted HTTP fake: a happy path, a 404, a
   rate-limited response, and a payload that violates the mapper's assumptions.
4. If it is a forge with a documented web layout, add a page to this directory.

Nothing in `packages/core`, `services/gateway` or `apps/web` should need to
change; if it does, the provider is exposing upstream detail that belongs in the
adapter.
