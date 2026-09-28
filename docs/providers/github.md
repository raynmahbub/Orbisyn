# GitHub

| | |
| --- | --- |
| Kind | `github` |
| Status | stable |
| Hosts | `github.com` (API: `api.github.com`) |
| Credential | `GITHUB_TOKEN` |
| References | `https://github.com/owner/repo`, `github.com/owner/repo`, `owner/repo` |

## What it reads

| Call | Used for |
| --- | --- |
| `GET /repos/{owner}/{repo}` | Name, description, homepage, topics, licence, stars, forks, open issues, archived flag, default branch |
| `GET /repos/{owner}/{repo}/releases?per_page=100&page=N` | Releases, tags, notes, assets, publication dates, prerelease flag |
| `GET /repos/{owner}/{repo}/contributors?per_page=1&anon=1` | Contributor count from the `Link` header's last page |
| `GET /repos/{owner}/{repo}/commits?per_page=1` | Last commit date, for the maintenance component |
| `GET /repos/{owner}/{repo}/contents/{path}` | Presence of `README`, `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md` and `.github/workflows` |

Requests send `Accept: application/vnd.github+json` and
`X-GitHub-Api-Version: 2022-11-28`. With `GITHUB_TOKEN` set, the token is sent as
a bearer credential; the anonymous limit is 60 requests/hour, which a single
resolution of a busy repository can exhaust, so a token is strongly recommended
for anything beyond a demo.

The absence of a file is information: `contents` distinguishes "this directory
does not exist" (404, `[]`) from "we could not tell" (a transport error, `null`).
The health score treats the second case as missing data — neutral, not zero — so
a rate-limited request never looks like a project without a licence.

## What it returns

- **Identity**: project name, description, homepage, icon from the owner avatar,
  topics as tags.
- **Licence**: the SPDX id GitHub reports (`license.spdx_id`), falling back to
  `unknown`; `licenseFile` is the linked licence file when one exists.
- **Platforms**: inferred from the release assets — an `.apk` makes it Android, a
  `.dmg` macOS, an `.AppImage` or `.deb` Linux, an `.ipa` iOS. A repository with
  no attached builds is recorded as `web`: it is still a source of truth, and
  claiming a platform it does not ship would be a guess.
- **Artifacts**: file name, size, content type, download URL, SHA-256 digests when
  GitHub publishes them (the API exposes `sha256:` digests on newer releases) and
  the classification from `classifyArtifact` — platform and architecture where the
  file name supports it.
- **Telemetry**: stars, forks, open issues, contributors, last commit date,
  releases in the last year, the median interval between releases, and the
  policy flags read from `contents`.

## Notes

- Releases with no assets are still releases: they carry the version and notes,
  and the record's `latestVersion` comes from the newest non-draft release.
- Draft releases are ignored; prereleases are kept and marked on the prerelease
  channel, so `1.0.0-rc.2` never outranks `1.0.0`.
- Pagination stops as soon as the requested number of releases is collected
  (100 per page), so asking for 10 releases is one request.
