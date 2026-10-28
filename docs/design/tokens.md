# Design tokens

Every value the interface uses is a custom property declared in
`apps/web/src/styles/tokens.css`. Components never hard-code a colour, radius or
duration, so retheming is a one-file diff and the light theme cannot drift.

## Colour

| Token | Dark | Light | Used for |
| --- | --- | --- | --- |
| `--color-primary` | `#2563eb` | same | Primary actions, links, the orbit ring |
| `--color-primary-strong` | `#1d4ed8` | same | Hover state of primary |
| `--color-primary-soft` | `#1e3a8a` | same | Subtle brand fills |
| `--color-accent` | `#22d3ee` | same | Focus rings, progress gradients, the satellite |
| `--color-success` | `#10b981` | same | Healthy status, verified artifacts |
| `--color-warning` | `#f59e0b` | same | Degraded providers, stale data |
| `--color-error` | `#ef4444` | same | Failures and destructive actions |
| `--color-background` | `#0b1220` | `#f6f8fc` | Page background |
| `--color-surface` | `#111827` | `#ffffff` | Cards, inputs, list rows |
| `--color-surface-raised` | `#16203a` | `#f1f5fb` | Nested panels, chips |
| `--color-surface-overlay` | `rgba(11,18,32,.86)` | `rgba(246,248,252,.9)` | Top bar and bottom navigation |
| `--color-border` / `--color-border-strong` | `#223049` / `#31405f` | `#dde5f2` / `#c3cfe3` | Dividers, control outlines |
| `--color-text` / `--color-text-muted` / `--color-text-subtle` | `#eef2ff` / `#94a3b8` / `#64748b` | `#0f172a` / `#52617a` / `#7c8aa5` | Body, secondary, hints |

The three mark colours (`#2563eb`, `#60a5fa`, `#7dd3fc`) are identical in both
themes — see [design/brand](../../design/brand/README.md).

Theming is a `data-theme` attribute on `<html>` (`dark` or `light`) plus a
`prefers-color-scheme` default, which is also what the PWA `theme-color` meta
pair follows.

## Spacing, radii and elevation

| Group | Tokens |
| --- | --- |
| Space | `--space-1` 4px … `--space-8` 64px, 4px based |
| Radii | `--radius-sm` 8px, `--radius-md` 12px, `--radius-lg` 20px, `--radius-xl` 28px, `--radius-pill` 999px |
| Elevation | `--shadow-sm`, `--shadow-md`, `--shadow-lg` — dark theme uses heavier shadows, light theme softer ones |
| Layout | `--sidebar-width` 248px, `--bottom-nav-height` 60px, `--content-max` 1180px |

## Typography

The interface stack is Inter, then the platform UI font; code and versions use
the platform mono stack. Sizes are `--text-xs` 12px through `--text-3xl` 36px on a
15px base, with `--leading-tight` 1.2 for headings and `--leading-normal` 1.55 for
body text. Headings are weight 650 with `-0.01em` tracking.

## Motion

`--duration-fast` 120ms for state changes, `--duration-base` 220ms for layout and
entrances, both on `--ease-standard` (a gentle ease) with `--ease-spring` reserved
for the few elements that should feel physical. Under
`prefers-reduced-motion: reduce` both durations become `0ms` — the transitions stay
declared, so nothing shifts position, but nothing animates either.

## Platform behaviour

These are the rules that make the client feel native on a phone, and they are all
in CSS rather than in JavaScript:

- **Safe areas**: `.topbar` and `.bottom-nav` own the `env(safe-area-inset-*)`
  padding, so content never sits under a notch, a status bar or the home
  indicator. The viewport is declared with `viewport-fit=cover`.
- **Viewport height**: `100vh` is written first as a fallback with `100dvh`
  immediately after, so the layout is correct in browsers without dynamic
  viewport units and does not jump when the mobile URL bar hides.
- **Touch targets**: `@media (pointer: coarse)` raises buttons and navigation
  items to a 44px minimum.
- **Input zoom**: text inputs are `max(16px, var(--text-base))` — below 16px iOS
  zooms the page when a field is focused.
- **Focus**: a visible `:focus-visible` ring in `--color-accent` at 2px offset,
  never removed.
