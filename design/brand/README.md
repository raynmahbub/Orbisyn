# Brand

Three files, all of them vector, no rasters to keep in sync:

| File | Use |
| --- | --- |
| `mark.svg` | The orbit mark on its own — favicons, empty states, loading screens |
| `icon.svg` | The app icon: mark over the dark surface gradient, 512×512 |
| `wordmark.svg` | Mark plus the name, for headers and documentation |

The tab icon and the installable app icons are generated from the same geometry
by `scripts/generate-icons.mjs`; `mark.svg` is the vector twin of that code.

## Colour

| Token | Hex | Where it appears |
| --- | --- | --- |
| Primary | `#2563eb` | The orbit ring, primary buttons, links |
| Core | `#60a5fa` | The centre of the mark, focus rings on dark surfaces |
| Satellite | `#7dd3fc` | The satellite, accents, progress fills |
| Surface top | `#0b1220` | App icon background, dark theme background |
| Surface bottom | `#111b30` | App icon gradient end, raised surfaces |

Light theme swaps only surfaces and text; the three mark colours are unchanged,
so a screenshot of the app is recognisable in either theme.

## Rules

- Keep clear space of at least half the ring radius around the mark.
- Never place the mark on a mid-tone photograph or a busy gradient; use a flat
  surface or the app-icon background.
- Do not recolour the mark, rotate the orbit, add a second satellite or apply
  shadows beyond the ones defined in the design tokens.
- Minimum sizes: 16px for the mark with the thicker ring (`favicon.svg`), 24px
  for `mark.svg`, 32px tall for the wordmark. The wordmark ships in ink
  (`#0f172a`) for light backgrounds; when inlining it, set `fill` to
  `currentColor` so it inherits the surrounding text colour.

## Licence

The marks are part of the project and are covered by the repository licence
(AGPL-3.0-or-later). Reuse in forks is fine; do not present a modified build as
an official Orbisyn release.
