# Codeberg and Forgejo

One adapter serves the whole Gitea family: Codeberg is the public instance, and
Forgejo instances are the same API with a different host.

| | Codeberg | Forgejo |
| --- | --- | --- |
| Kind | `codeberg` | `forgejo` |
| Status | stable | beta |
| Hosts | `codeberg.org` | any host configured in `ORBISYN_FORGE_HOSTS` |
| API | `https://codeberg.org/api/v1` | `https://{host}/api/v1` |
| Credential | `ORBISYN_FORGE_TOKENS` (`codeberg.org=token`) | `ORBISYN_FORGE_TOKENS` (`forgejo.example.org=token`) |
| Reference | `https://codeberg.org/forgejo/forgejo` | `https://forgejo.example.org/team/app` |

A self-hosted Gitea instance cannot be recognised by URL shape the way a forge
with a fixed host can, so it is configured rather than guessed: list the host in
`ORBISYN_FORGE_HOSTS` and a `forgejo` provider is registered for it. A reference
to an unconfigured `forgejo.*` or `gitea.*` host fails with
`unsupported-source` and a message saying which variable to set, instead of
silently becoming a direct download.

## What it reads

| Call | Used for |
| --- | --- |
| `GET /repos/{owner}/{repo}` | Name, description, homepage, topics, stars, forks, open issues, archive flag, avatar |
| `GET /repos/{owner}/{repo}/releases?limit=25&page=N` | Releases, tags, notes, assets |
| `GET /repos/{owner}/{repo}/contributors?limit=1` | Contributor count from the pagination header |
| `GET /repos/{owner}/{repo}/commits?limit=1` | Last commit date |
| `GET /repos/{owner}/{repo}/contents/{path}` | Root entries, `.forgejo/workflows`, `.github/workflows` |

Tokens are sent as `Authorization: token <token>`, the scheme Gitea-family APIs
expect.

## What it returns

- **Identity**: repository name, description, topics as tags, avatar as the icon.
- **Licence**: the SPDX id from the repository's licence field, falling back to
  the licence name, then `unknown`.
- **Platforms**: inferred from release assets as in the other forge providers; a
  repository with no attached builds is recorded as `web`.
- **Artifacts**: file name, size and MIME type from the release asset list. Gitea
  exposes asset hashes only through its signed attachment API, so no checksum is
  attached and `verifyArtifacts` is `false`: the client must not offer to verify
  an artifact whose digest nobody published.
- **Telemetry**: stars, forks, open issues, contributors, last commit date,
  releases in the last year, median release interval, and CI/policy flags derived
  from the root entries and the two workflow directories.

## Notes

- Codeberg is registered as its own kind so clients can label it honestly and so
  `/api/providers` reports a stable instance separately from self-hosted ones.
- Adding a second Forgejo host is a configuration change, not a code change:
  `ORBISYN_FORGE_HOSTS=forgejo.example.org,gitea.example.org`.
