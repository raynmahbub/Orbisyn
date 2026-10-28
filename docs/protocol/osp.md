# OSP — Open Source Presence

OSP gives a project a stable identity and a place to state its own facts, so a
client can resolve it without crawling, and without trusting Orbisyn's database.

Two parts, both versioned:

- an **identity scheme**: `osp://<id>`
- a **presence document**: `orbisyn.json`, spec version `1.0`, at the root of a
  repository

## Identity

```
osp://bitwarden-android
```

The id is the canonical, lowercase, DNS-safe slug of the project name, with a
short FNV-1a digest suffix only when two different sources claim the same name
(`note-app-3f9a1c`). That rule lives in `packages/core`, so every consumer
canonicalises to exactly the same URI:

| Input | Canonical URI |
| --- | --- |
| `osp://Bitwarden-Android` | `osp://bitwarden-android` |
| `osp:bitwarden-android` | `osp://bitwarden-android` |
| `https://github.com/bitwarden/android` | resolved first, then `osp://bitwarden-android` |

`GET /api/osp/:id` accepts either form and answers with the stored record:

```json
{
  "uri": "osp://bitwarden-android",
  "document": null,
  "app": { "...": "AppRecord" },
  "repository": { "kind": "github", "path": "bitwarden/android" }
}
```

## Presence document

A publisher adds one file to the root of their repository:

```json
{
  "spec": "1.0",
  "id": "example-app",
  "name": "Example App",
  "summary": "What it does, in one sentence.",
  "license": "GPL-3.0-or-later",
  "platforms": ["android", "linux"],
  "categories": ["security"],
  "sources": [
    { "kind": "github", "url": "https://github.com/example/app", "primary": true },
    { "kind": "codeberg", "url": "https://codeberg.org/example/app" }
  ],
  "mirrors": ["https://mirror.example.org/app/"],
  "artifacts": [
    {
      "url": "https://example.org/app-1.4.2.apk",
      "platform": "android",
      "architecture": "arm64",
      "checksum": { "algorithm": "sha256", "value": "…" }
    }
  ],
  "replaces": ["old-example-app"],
  "maintainers": [{ "name": "Example Collective", "url": "https://example.org" }],
  "updatedAt": "2026-04-02T09:30:00Z"
}
```

`spec` accepts `1.0` and any `major.minor` string, so a document written against a
later minor version still parses. Everything else is validated with the same
schemas the API uses: an invalid document is rejected as a whole rather than
partially believed.

### Discovery

`candidateDocumentUrls` tries the documented raw-content location for the
provider family, most likely first, and follows the default branch (`HEAD` where
the forge supports it, otherwise `main`, then `master`). Absence is normal and
silent: most repositories have no document, and they resolve exactly the same way
without one.

Raw fetches are deliberately constrained: 6 seconds, 64 KiB, plain text, and a
pre-aborted request returns nothing rather than starting one. A presence document
is a convenience, never a reason for a resolution to fail.

### Verification

`verifyDocumentAgainstApp` cross-checks a published document against an
independently resolved record and reports:

- **confirmed** — identity, licence and platform overlap that agree;
- **mismatches** — a different id, a contradicting SPDX identifier, or no
  overlapping platform.

This is what lets a client show "publisher-declared" versus "independently
resolved" side by side. Where the two disagree, the document is the claim and the
provider is the evidence; Orbisyn never silently rewrites one with the other.

## Compatibility

- Ids are permanent. A rename is a new id plus `replaces`.
- Unknown fields are ignored, so a document can carry publisher extensions.
- `mirrors` exist for rate-limit fallback; a client may use them for downloads but
  treats the primary source as authoritative.
