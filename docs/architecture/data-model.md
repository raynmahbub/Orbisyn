# Data model

Everything that crosses a boundary is defined once, in `packages/contracts`, as a
Zod schema. Types are inferred from the schemas, so the validator and the type can
never disagree. `conformance.test.ts` renders every schema to JSON Schema and
round-trips a sample, which catches a schema that is valid but unserialisable.

## `AppRecord`

The canonical record for one application. Every provider maps into this shape and
nothing outside `packages/providers` knows where the data came from.

| Field | Notes |
| --- | --- |
| `id` | The OSP identity, e.g. `bitwarden-android` |
| `ospUri` | `osp://bitwarden-android` |
| `name`, `summary`, `description` | Human-readable metadata |
| `homepage`, `iconUrl`, `screenshots` | Presentation; all URLs |
| `license` | SPDX identifier as a plain string, plus `licenseFile` when the upstream publishes one |
| `categories`, `tags` | Free-form, trimmed, bounded |
| `platforms` | `android`, `ios`, `macos`, `windows`, `linux`, `web` — at least one |
| `source` | The `RepositoryRef` the record was resolved from |
| `alternateSources` | Other repositories shipping the same app, ordered by confidence |
| `latestRelease`, `latestVersion` | The newest release, and the same version normalised to SemVer |
| `health` | Weighted score with per-component rationale (below) |
| `archived` | Reported by the upstream; drives the maintenance component |
| `fetchedAt` | When the upstream data was read |

`AppSummary` is the compact projection used by list endpoints — enough for a card
on a phone, small enough to keep a search payload quick on a slow link.

### Identity

`deriveAppId` builds the id from the canonical name: a lowercase slug
(`Bitwarden Android` → `bitwarden-android`), with an FNV-1a digest suffix only
when two different sources claim the same slug. Collisions are therefore visible
and resolved deterministically instead of silently overwriting a record
(`identity-collision`, HTTP 409).

`normalizeReference` is what makes references comparable: trim, lowercase, drop
the scheme, drop a trailing `/`, drop a trailing `.git`. `https://GitHub.com/FlorisBoard/FlorisBoard.git/`
and `florisboard/florisboard` resolve to the same cache key and the same record.

### Releases and versions

A `Release` carries `version`, `channel`, `publishedAt`, `notes`, and its
artifacts. Versions are compared by a tolerant parser that accepts SemVer and
CalVer (`2026.9.0-bwpm`, `0.118.3`, `v1.4.2`) and **never throws**: an
unparseable version sorts last rather than breaking a page. Channel rank is
`stable < rc < beta < nightly`; a purely numeric prerelease suffix
(`1.2.3-2`) stays on the stable channel, because that is how a stable build is
often published, while a word suffix implies a real prerelease channel.

Artifacts carry `url`, `fileName`, `sizeBytes`, `contentType`, `platform`,
`architecture` and an optional `checksum` and `signature`. A checksum is only
present when the upstream actually published one; it is never invented from a
download.

### Health scoring

Six weighted components, each scored 0–100 with a rationale string:

| Component | Weight | Based on |
| --- | --- | --- |
| `release-cadence` | 0.25 | Releases in the last year and the median interval |
| `maintenance` | 0.25 | Time since the last release, and whether the project is archived |
| `community` | 0.15 | Stars, forks, contributors, open issues |
| `documentation` | 0.10 | README, licence file, security policy, contributing guide |
| `governance` | 0.15 | CI configuration and published policies |
| `licensing` | 0.10 | SPDX identifier present and OSI-approved |

Missing inputs score the neutral value (35) and say so in the rationale instead of
being treated as a failure — a forge that does not publish stars produces "no
data" rather than a bad score. Grades: **A** ≥ 85, **B** ≥ 70, **C** ≥ 55,
**D** ≥ 40, **E** below. An archived project scores 0 on maintenance, which is
what an operator would want to see.

### Diagnostics

Every resolve returns `diagnostics`: which source answered, whether the cache was
`hit`, `miss`, `revalidate` or `bypass`, how long it took, and an ordered list of
steps with `ok` / `failed` / `skipped` status. This is what the client's
"Resolution trace" panel renders, and it is the first thing to look at when a
provider misbehaves.

## Store

`AppStorePort` is the persistence boundary: `saveApp`, `findApp`, `listReleases`,
`search`, `listCollections`, `saveCollection`, and the cursor-based reads used by
sync. The default backend keeps records in the process (see
[persistence](./persistence.md)); collections and records are the same objects
throughout, so swapping the backend does not change any route.
