# Proposal — sync-site-theme

**Level:** 1 (proposed 0, confirmed by human) · **Type:** feature · **Branch:** `feat/sync-site-theme`

## Why

The speclaw site (`../speclaw-site`) now has a finished design system:
`app/tokens.css` defines a dark **ink** theme and a light **bond** theme, the mark
lives in `app/icon.svg` and `components/Mark/Mark.tsx`, and the type is Chivo /
Chivo Mono. This repository still ships the older teal-on-near-black palette
(`#0b0f10`, cream `#f4f1ea`, teal `#2ee6e6`/`#17c1c1`/`#0e8e8e`), an older mark,
and SF Mono / JetBrains Mono font stacks. The README banners, the terminal
captures, the CLI's own colors, and the Compass viewer therefore do not match
the site.

## What changes

1. **Brand assets.** Every SVG under `brand/` is recolored to the ink tokens
   (dark) or bond tokens (light): both banners, both marks, the favicon,
   `diamond.svg`, all `terminal-*.svg`, and `cortex-loop.svg`. They adopt the
   site mark geometry and Chivo / Chivo Mono. The PNGs are regenerated with
   `npm run brand` (`scripts/render-brand.mjs`).
2. **PNG fonts.** `scripts/render-brand.mjs` loads Chivo and Chivo Mono from the
   new dev dependencies `@fontsource/chivo` and `@fontsource/chivo-mono` (static
   per-weight files: sans 400/800, mono 400/700), decodes them from WOFF2 to TTF
   with the dev dependency `wawoff2` in a temp dir, and renders with system
   fonts disabled. A missing font file exits non-zero and names the file.
3. **CLI palette.** `PALETTE` in `src/cli/lib/ui.ts` takes the ink tokens.
   Green and amber stay for success and warning but are re-tuned. The header
   comment that documents the palette is updated.
4. **Compass viewer.** The inline CSS and canvas colors in
   `src/modules/compass/visualize.ts` take the ink tokens.
5. **Docs.** The palette note in `docs/standards/frontend-standards.md` and the
   "Teal steps" caption in `README.md` are updated.

## Decisions (confirmed by the human)

1. Scope is everything listed above: all brand SVGs and PNGs, the CLI palette,
   and the Compass viewer.
2. Status colors: green (success) and amber (warning) stay, re-tuned to sit
   with the new palette at ≥ 4.5:1 on `#131313` (and on the bond ground where
   light assets use them). Error → deny `#ff5c47` (light `#c42b16`). Accent →
   signal `#00e3fd` (light `#00707f`).
3. The SVGs adopt the site mark geometry and Chivo / Chivo Mono. PNG rendering
   loads Chivo from `@fontsource/chivo` and `@fontsource/chivo-mono` (dev
   dependencies, static weights) through `wawoff2`, not system fonts (Q3).
4. **Q1:** `c.cyanDim` → signal `#00e3fd`. **Q2:** the favicon copies
   `app/icon.svg`; every other mark copies `Mark.tsx`. **Q4:** README badges
   are retinted to `color=00707f`, `labelColor=131313`.

## Spec impact

- **New capability `brand`** (deliberate, not a near-duplicate). No canonical
  spec defines colors, the mark, or fonts today. `cli` only says the header is
  "styled in the brand palette", and that wording stays true. The new
  capability holds that definition (`specs/brand/spec.md`).
- **`cli` — no delta.** The header's content, when it prints, the
  `NO_COLOR`/TTY suppression, and the unicode/ASCII fallback do not change.
  Only the RGB values behind the existing slots change.
- **`code-graph` — no delta.** The viewer's behavior and output contract do not
  change. Its colors are governed by `brand`.

## Color mapping (old → new)

Contrast ratios are WCAG 2.x, computed against `#131313` (ink) or `#f4f4f3`
(bond paper). The tester recomputes them in the unit test.

### Dark (ink): CLI, Compass viewer, dark SVGs

| Role | Old | New | Token | Contrast on `#131313` |
| --- | --- | --- | --- | --- |
| Page background | `#0b0f10` | `#131313` | paper | — |
| Deepest surface (terminal body, inset) | `#0a0e0f`, `#0c1113` | `#0d0d0e` | paper-sunk | — |
| Raised surface (cards, panels, title bars) | `#1b2225`, `#232a2d` (fill), `#0e1517` (viewer tooltip) | `#1f2022` | sheet | — |
| Hairline / border | `#232a2d` (stroke) | `#303236` | rule | — |
| Strong border / divider | — | `#4c5056` | rule-strong | — |
| Primary text (`c.cream`) | `#f4f1ea` | `#f4f4f3` | ink | 16.9 |
| Secondary text, labels | `#8b989e` | `#babdc1` | ink-muted | 9.9 |
| Tertiary text (`c.muted`) | `#6e7b80` | `#999ea3` | ink-faint | 6.9 |
| Accent / "law" (`c.cyan`) | `#2ee6e6` | `#00e3fd` | signal | 11.9 |
| Secondary accent (`c.cyanDim`) | `#17c1c1` | `#00e3fd` (see Q1) | signal | 11.9 |
| Accent tint fill (glow, badge ground) | `#0e8e8e` used as fill | `#0a3f47` | signal-dim | fill only |
| Accent used as text/stroke | `#0e8e8e` used as text/stroke | `#00e3fd` | signal | 11.9 |
| Error (`c.red`) | `#eb5a5a` | `#ff5c47` | deny | 6.1 |
| Success (`c.green`) | `#3fb950` | `#3ecf7a` | re-tuned | 9.2 |
| Warning (`c.amber`) | `#e3b341` | `#f5b73d` | re-tuned | 10.4 |
| Mark text lines | (old mark) | `#999ea3` | ink-faint | — |
| Viewer kind: function | `#17c1c1` | `#00e3fd` | signal | — |
| Viewer kind: method | `#3fb950` | `#3ecf7a` | success | — |
| Viewer kind: class | `#e3b341` | `#f5b73d` | warning | — |
| Viewer kind: interface/type/enum | `#8b989e` | `#babdc1` | ink-muted | — |
| Viewer kind fallback / graph node | `#6e7b80` | `#7c8083` | mesh-node | — |
| Viewer idle edge | `rgba(110,123,128,.16)` | `rgba(124,128,131,.16)` | mesh-node at 16% | — |
| Viewer active edge | `rgba(23,193,193,.7)` | `rgba(0,227,253,.7)` | signal at 70% | — |
| Viewer panel ground | `rgba(12,17,19,.82)` | `rgba(31,32,34,.82)` | sheet at 82% | — |

### Light (bond): `speclaw-banner-light.svg`, `speclaw-mark-light.svg`

| Role | Old (role) | New | Token | Contrast on `#f4f4f3` |
| --- | --- | --- | --- | --- |
| Page background | light ground | `#f4f4f3` | paper | — |
| Card / raised surface | — | `#ffffff` | sheet | — |
| Hairline | — | `#cdcdc8` | rule | — |
| Primary text / document outline | dark text | `#131313` | ink | 16.9 |
| Secondary text | muted | `#3e4042` | ink-muted | 9.5 |
| Tertiary text, mark lines | muted | `#56595d` | ink-faint | 6.4 |
| Accent / "law" | teal | `#00707f` | signal | 5.3 |
| Error | red | `#c42b16` | deny | 5.1 |
| Success (if used) | green | `#17773f` | re-tuned | 5.1 |
| Warning (if used) | amber | `#8a5a00` | re-tuned | 5.4 |

### Mark geometry (from the site)

- 32-unit frame. Document `rect x=5 y=3.5 w=21 h=25`, no fill, stroked in ink.
- Three text lines in ink-faint: `M10 11h11`, `M10 15.5h11`, `M10 20h7`.
- Law line in signal: `M10 24.5h21` (ends at x 31, past the page edge at x 26).
- Inline marks (banners, `speclaw-mark*.svg`) follow `Mark.tsx`: stroke 2.5,
  law stroke 3.5. The favicon follows `app/icon.svg`: a rounded paper tile
  (`rx` 44 on 192), stroke 2, law `h18`, lines in mesh-node `#7c8083` (see Q2).

### Typography

- Sans: `'Chivo', 'Helvetica Neue', Arial, sans-serif`. Headings use weight
  800 and tracking −0.032em.
- Mono: `'Chivo Mono', 'SFMono-Regular', Menlo, monospace` (also the Compass
  viewer's stack, since that page bundles no fonts).
- The site's `'Chivo Variable'` names are not used: the PNGs are rendered from
  static per-weight files, and no browser that opens the SVGs has them.
- `SF Mono` and `JetBrains Mono` are removed from every stack.
- The static fontsource files register as **"Chivo Medium"** and **"Chivo Mono
  Medium"** in their name tables, and resvg-js 2.6.2 ignores its
  `monospaceFamily` / `sansSerifFamily` options. The renderer therefore aliases
  the SVG names `'Chivo'` / `'Chivo Mono'` to those registered names before
  rendering; the SVG sources keep the site's names.
- The Chivo latin subset has no `◇ ✓ ├ └ ─ → ↔ ≥`. With system fonts off those
  would render blank, so `terminal-init` draws the step diamond and check as
  paths, `terminal-tree` draws its connectors as lines, and `terminal-cli` uses
  the ASCII `->`, `<->`, `>=` the Cortex captures already use. A unit test
  keeps every SVG's text inside the subset.

## Non-goals

- No rename of the `c.*` helpers (`cyan`, `cyanDim`, `cream`, `muted`, `green`,
  `amber`, `red`). Their call sites in nine CLI files keep working unchanged.
- No change to when the header prints, `NO_COLOR`/TTY detection, or the
  unicode/ASCII fallback.
- No light theme for the CLI or the Compass viewer. Terminals and the viewer
  stay ink.
- No change to the site repository. It is a read-only reference.
- No runtime dependency. `@fontsource/chivo`, `@fontsource/chivo-mono`, and
  `wawoff2` are `devDependencies` used only by `npm run brand`. They are not in
  `dependencies`, the published `files` (`dist`, `ATTRIBUTION.md`) do not
  change, and rendering reads only local files, so the published package and
  offline use are unaffected (law `local-first`). The fonts are OFL-1.1;
  `wawoff2` is MIT.
- No new brand assets beyond the existing set, and no layout redesign of the
  terminal captures beyond color, mark, and font.

## Risks

- **Font format (settled by the Q3 spike).** `@resvg/resvg-js` 2.6.2 cannot
  read WOFF2 and ignores the variable `wght` axis, so the variable packages were
  dropped for static per-weight files decoded with `wawoff2`. Chivo 400 and 800
  render distinctly, and Chivo Mono renders monospaced (advance 0.6 em, the same
  as SF Mono, so terminal line widths did not move).
- **README images.** The README loads PNGs from `raw.githubusercontent.com/.../main`,
  so the new images appear only after merge.

## Answered questions

- **Q1. `c.cyanDim`** → signal `#00e3fd`, so box titles and percentages match
  the accent.
- **Q2. Favicon vs inline mark.** `speclaw-favicon.svg` copies `app/icon.svg`
  (rounded tile, mesh-node `#7c8083` lines, law `h18`, stroke 2); every other
  mark copies `Mark.tsx` (ink-faint lines, law `h21` past the edge, strokes
  2.5 / 3.5).
- **Q3. WOFF2.** Resolved by a spike: static `@fontsource/chivo` and
  `@fontsource/chivo-mono` (not `@fontsource-variable/*`), decoded to TTF with
  `wawoff2` (`decompress`) in an `os.tmpdir()` temp dir, passed as
  `font.fontFiles` with `loadSystemFonts: false`.
- **Q4. README badges.** In scope: `color=00707f`, `labelColor=131313` (white
  badge text on `#00e3fd` would fail contrast).
