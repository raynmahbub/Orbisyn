# F-Droid

| | |
| --- | --- |
| Kind | `fdroid` |
| Status | stable |
| API | `https://f-droid.org/api/v1` |
| Web | `https://f-droid.org` |
| Artifacts | `https://f-droid.org/repo` |
| Credential | none |
| References | `https://f-droid.org/packages/org.fdroid.fdroid`, `org.telegram.messenger`, `fdroid:com.termux` |

F-Droid is the strongest source for *verification* in the set: every published
version carries an APK hash and the signing key fingerprint, so an artifact can be
checked rather than trusted.

## What it reads

| Call | Used for |
| --- | --- |
| `GET /api/v1/packages/{packageName}` | Every published version with its version code, name, APK name, hash, signer and publication date |
| `GET /packages/{packageName}` (HTML) | Summary, website, icon and categories, scraped as a documented best-effort fallback |

The JSON index is authoritative; the page scrape only fills presentation fields
and is skipped without failing the resolution when the markup changes. A package
the index does not know is `source-not-found`, with the package name in the
message.

## What it returns

- **Identity**: `fdroid-{package}` — e.g. `fdroid-org-fdroid-fdroid` for
  `org.fdroid.fdroid`; the name comes from the package's own label.
- **Releases**: one per published version, newest `versionCode` first. The version
  label is `versionName` when present, otherwise the numeric `versionCode`.
- **Artifacts**: `https://f-droid.org/repo/{apkName}` with the size, MIME type
  `application/vnd.android.package-archive`, the SHA-256 hash from the index when
  present, and the signer fingerprint as an `apk-v2` signature.
- **Platforms**: always `android`.
- **Telemetry**: archived state, licence and the version history — and nothing
  else. F-Droid publishes no stars, forks or issue counts, so those stay `null`
  and the community component scores the neutral value instead of a guess.

## Notes

- `verifyArtifacts` is `true`: the index carries both a hash and a signature
  fingerprint for every APK, which is exactly what a client needs to verify a
  download.
- A package name looks like a host name (`org.fdroid.fdroid` vs `f-droid.org`).
  The reference detector resolves the ambiguity before the provider is reached —
  three or more segments is a package, and a two-segment string whose tail is a
  known TLD is a host — so `f-droid.org/packages/x` and `org.fdroid.fdroid` both
  arrive here correctly.
- Self-hosted F-Droid repositories are supported by the adapter's options
  (`apiBaseUrl`, `webBaseUrl`, `repoBaseUrl`) so a mirror or an internal
  repository can be registered without touching the mapping.
