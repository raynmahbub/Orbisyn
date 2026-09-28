# Direct download

| | |
| --- | --- |
| Kind | `direct-url` |
| Status | beta |
| References | `https://example.org/releases/app-1.4.2.apk`, `https://mirror.example.org/tool-2.0.AppImage` |
| Credential | none |

The fallback for projects that distribute outside a forge: a vendor download page,
a mirror, a release server. It matches any absolute `http(s)` URL and is therefore
always last in the detection order — anything earlier in the chain has a richer
API and can say more about the same URL.

## How a URL becomes a record

1. **Probe.** `HEAD` first, then a ranged `GET` (`Range: bytes=0-0`) when the
   server answers `405`/`501` to `HEAD`. Size, content type and `Last-Modified`
   come from whichever answer arrives; a URL that cannot be reached is
   `source-not-found`. A `206 Partial Content` answer deliberately reports no
   size — that `Content-Length` is the length of the range, not of the file.
2. **Version.** Parsed out of the file name: `app-1.4.2-arm64-v8a.apk` → `1.4.2`,
   `tool_v2.0.AppImage` → `2.0`, `build-2.1.0-rc3.apk` → `2.1.0-rc3`. A name with
   no version becomes `unknown`, which is recorded as such rather than invented.
3. **Identity.** The file name without its version, slugified, plus the
   extension: `example-app-2.4.1-arm64-v8a.apk` →
   `example-app-arm64-v8a-apk`. The extension — and any architecture token in the
   name — stays part of the id, so two different files on the same host cannot
   collapse into one record.
4. **Classification.** `classifyArtifact` decides platform and architecture from
   the file name and MIME type: `.apk` → Android (with `arm64`, `armv7`, `x86`,
   `x86_64` detected from the name), `.dmg`/`.pkg` → macOS, `.deb`/`.rpm`/
   `.AppImage` → Linux, `.ipa` → iOS, `.exe`/`.msi` → Windows, archives → the
   default for the URL.

## What it returns

A single release with a single artifact, the HTTP metadata the server published,
and `tags: ['direct-download']`. Licence is `unknown` — a download URL carries no
licensing information, and claiming otherwise would be a fabrication.

Telemetry is empty by design: no stars, forks, issues, contributors or policies
are attributable to a file. The health score records those inputs as missing
rather than bad, which is why a direct download can still score well on release
cadence and maintenance when the server sends `Last-Modified`.

## Notes

- `listReleases` is `false`: a URL is one version. History has to come from a
  forge, or from `alternateSources` when the same project also resolves there.
- Redirects are followed by the HTTP client; the probed URL is the one recorded as
  the artifact so a mirror link stays reproducible.
- `verifyArtifacts` is `false` — a checksum is only reported when the server
  publishes one, and a direct download generally does not.
