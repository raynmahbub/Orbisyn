# GitLab

| | |
| --- | --- |
| Kind | `gitlab` |
| Status | stable |
| Hosts | `gitlab.com`, and any self-managed instance whose host starts with `gitlab.` — `gitlab.gnome.org`, `gitlab.freedesktop.org`, … |
| Credential | `GITLAB_TOKEN` |
| References | `https://gitlab.com/KDE/kdenlive`, `gitlab.gnome.org/GNOME/loupe` |

GitLab is not one host: desktop projects and distributions commonly self-manage.
A reference therefore names its own instance, and requests go to that instance —
`gitlab.gnome.org/GNOME/loupe` is read from `https://gitlab.gnome.org/api/v4`,
never from gitlab.com. A provider constructed with an explicit base URL (tests, or
a deployment pinned to one instance) uses that base instead.

## What it reads

| Call | Used for |
| --- | --- |
| `GET /api/v4/projects/{url-encoded path}` | Name, description, topics, licence, stars, forks, open issues, archive flag, avatar, web URL |
| `GET /api/v4/projects/{id}/releases?order_by=released_at` | Releases with their asset links and archive sources |
| `GET /api/v4/projects/{id}/repository/contributors` | Contributor count (`X-Total` header) |
| `GET /api/v4/projects/{id}/repository/commits?per_page=1` | Last commit date |
| `GET /api/v4/projects/{id}/repository/files/{path}?ref=HEAD` | Presence of `.gitlab-ci.yml`, `SECURITY.md`, `.gitlab/security-policies`, `CONTRIBUTING.md`, `docs/CONTRIBUTING.md` |

The project path (`GNOME/loupe`) is percent-encoded into a single segment, which
is what the API expects, so subgroup projects (`team/sub/app`) resolve without a
second lookup. `GITLAB_TOKEN` is sent as `PRIVATE-TOKEN`.

## What it returns

- **Identity**: project name, description, topics, avatar, `homepage` from the
  project's own web URL, and `source.host` set to the instance that answered.
- **Licence**: the SPDX identifier from `license.spdx_identifier`, then the licence
  name when the instance reports no identifier, then `unknown`.
- **Releases**: newest first by `released_at`; upcoming releases (GitLab's
  `upcoming_release` flag) are skipped, since they have no published date. Archive
  sources (`tar.gz`, `zip`) are kept as artifacts next to the release links, so a
  project that distributes through its own download server still shows those
  builds.
- **Artifacts**: file name, size and content type where GitLab provides them.
  GitLab publishes no digest for release assets, so `verifyArtifacts` is `false`
  and artifacts carry no checksum rather than an invented one.
- **Telemetry**: stars, forks, open issues, contributors, last commit date,
  releases in the last year, median release interval, and the policy flags read
  from the repository file endpoints.

## Notes

- Detection matches `gitlab.com` references and any host beginning with `gitlab.`;
  other self-managed hosts that do not follow that naming convention are not
  guessed at. An anonymous request to an instance that requires authentication
  returns 404, which surfaces as `source-not-found` naming the host.
