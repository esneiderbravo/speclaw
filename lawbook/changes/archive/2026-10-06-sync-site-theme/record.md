# sync-site-theme

**Level:** 1 (proposed: 0, confirmed by: human)
**Why:** This repo's brand assets, CLI palette, and Compass viewer still use
the old teal-on-near-black palette, the old mark, and SF Mono / JetBrains Mono.
The speclaw site now defines the identity (`app/tokens.css`, the mark in
`app/icon.svg` / `Mark.tsx`, Chivo / Chivo Mono). Level 1 was confirmed: a
visual re-theme across ~16 files with no behavior or API change.

## What changes

All `brand/*.svg` (and their PNGs, via `npm run brand`), `PALETTE` in
`src/cli/lib/ui.ts`, and the inline colors in
`src/modules/compass/visualize.ts` move to the site's ink tokens (bond for the
light assets). The SVGs adopt the site mark and Chivo / Chivo Mono. PNG
rendering loads Chivo from the static `@fontsource/chivo` and
`@fontsource/chivo-mono` dev dependencies, decoded from WOFF2 by `wawoff2`. The
decisions, the old → new color mapping, the non-goals, and the answered questions (Q1–Q4)
are in `proposal.md`. The delta is a new `brand` capability. `cli` needs no
delta because the header behavior does not change.

## Steps

Checklist for the level-1 record. Ordered work lives in `tasks.md`.
