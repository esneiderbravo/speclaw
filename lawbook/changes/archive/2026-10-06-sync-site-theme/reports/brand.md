# Brand report — sync-site-theme

**Discipline:** brand (SVG sources, rendered PNGs, `scripts/render-brand.mjs`, Chivo fonts) · **Change:** `sync-site-theme` (feature, level 1) · **Date:** 2026-10-06
**Branch:** `feat/sync-site-theme` (HEAD `a68fcff`) · **cwd:** `/Users/esneiderbravo/Projects/speclaw`

## Gates and results

| Check | Command | Result |
| --- | --- | --- |
| Format + lint | `npm run check` | PASS, exit 0. "All matched files use Prettier code style!", ESLint clean. |
| Type-check + compile | `npm run build` | PASS, exit 0 (`tsc` + "copy-assets: copied assets for 3 module(s)"). |
| Full test suite + coverage floor | `npm test` | PASS, exit 0. 637 tests, 637 pass, 0 fail, 0 skipped. All files: 85.56 % lines, 82.10 % branches, 87.78 % functions (floor 80). |
| Brand asset tests | `node --test dist-test/test/unit/brand-assets.test.js` | 9/9 pass. |
| Delta spec validation | `npx speclaw lawbook validate sync-site-theme` | PASS, "sync-site-theme is valid (1 delta spec(s))". 6 advisory `ears/multiple-modals` warnings, non-blocking. |
| Requirement coverage | `npx speclaw coverage --only-defects` | "ok - 29 total", 0 defects. The `brand` capability is not in the canonical specs until sync (task 10.1), so its IDs are not traced yet. |
| PNG render | `npm run brand` | PASS, exit 0. 9 PNGs rendered: speclaw-banner, terminal-init, terminal-quickstart, terminal-cli, terminal-mcp, terminal-tree, terminal-cortex, cortex-loop, diamond. These are all 9 SVGs with a PNG twin. |
| Deterministic render | `shasum brand/*.png` before and after `npm run brand` | Identical. `git status` shows no PNG change, so the committed PNGs are byte-identical to a fresh render. |
| Missing font (runtime) | Renamed `node_modules/@fontsource/chivo-mono/files/chivo-mono-latin-700-normal.woff2` to `.bak`, ran `npm run brand`, then restored the file | Exit 1. stderr: `render-brand: missing font file node_modules/@fontsource/chivo-mono/files/chivo-mono-latin-700-normal.woff2 (from @fontsource/chivo-mono/files/chivo-mono-latin-700-normal.woff2). Install the dev dependencies with \`npm install\` and run again.` No PNG rendered (stdout has only the npm banner). PNG hashes are unchanged. No `speclaw-brand-fonts-*` temp dir was left in `$TMPDIR`. Restoration verified with `shasum -c` (OK). |

## Manual verification (task 7.1)

I opened these PNGs with the image reader: `speclaw-banner`, `terminal-cli`, `terminal-mcp`, `terminal-quickstart`, `terminal-cortex`, `terminal-init`, `terminal-tree`, `cortex-loop`, and `diamond`.

- **Banner.** The wordmark is set in Chivo 800, with "spec" in ink and "law" in signal cyan. The tagline is set in Chivo Mono. The site mark has a document outline, three ink-faint lines, and a signal law line that runs past the page edge with a glow. The ground is ink paper.
- **Terminal captures and cortex-loop.**
  - Chivo Mono is set in 400 and 700, and the bold headings render distinctly.
  - The chrome dots are deny red, amber, and green.
  - Accents use signal `#00e3fd`. Checks are green `#3ecf7a`.
  - The diamond and check glyphs in `terminal-init` and the tree connectors in `terminal-tree` are drawn as shapes. Arrows use ASCII `->` / `<->` / `<=` / `>=`.
- **Text rendering.** No tofu, blank runs, or serif fallback appears in any PNG.
- **Diamond.** It renders as a signal-to-signal-dim (`#00e3fd` → `#0a3f47`) gradient with a cyan aura, as designed.
- **Light assets.** `speclaw-banner-light` and `speclaw-mark-light` have no PNG twin. Their bond tokens are covered by the unit test.

## Contrast, before and after (WCAG 2.x, recomputed with `test/helpers/brand.ts#contrast`)

| Role | Old | On old ground `#0b0f10` | New | On ink `#131313` |
| --- | --- | --- | --- | --- |
| Accent / law | `#2ee6e6` | 12.46 | `#00e3fd` | 11.86 |
| Accent dim (`cyanDim`) | `#17c1c1` | 8.66 | `#00e3fd` | 11.86 |
| Primary text | `#f4f1ea` | 17.08 | `#f4f4f3` | 16.88 |
| Secondary / labels | `#8b989e` | 6.50 | `#babdc1` | 9.85 |
| Tertiary (`muted`) | `#6e7b80` | **4.41** (below 4.5) | `#999ea3` | 6.88 |
| Success | `#3fb950` | 7.58 | `#3ecf7a` | 9.21 |
| Warning | `#e3b341` | 9.90 | `#f5b73d` | 10.37 |
| Error | `#eb5a5a` | 5.64 | `#ff5c47` | 6.08 |
| Mark text lines | `#6e7b80` | 4.41 | `#7c8083` | 4.66 |

Light (bond paper `#f4f4f3`): ink `#131313` 16.88, signal `#00707f` 5.27, mark lines `#56595d` 6.40, ink-muted `#3e4042` 9.46. On the cortex-loop CORTEX card, `#00e3fd` on `#0a3f47` is 7.39.

## Tests added / updated

- `test/unit/brand-assets.test.ts` (added by the implementer, reviewed and run here): 9 tests, 9 pass.
- `test/helpers/brand.ts` (contrast helper and retired-palette list): used by the tests above.
- No brand test was changed in this pass.

## Spec-scenario coverage (`specs/brand/spec.md`, brand-asset requirements)

| Scenario | Verified by |
| --- | --- |
| Dark assets sit on the ink ground | `brand-assets.test.ts` "dark assets carry signal and sit on paper" (pass). Visual check of all 9 PNGs. |
| Light assets sit on the bond ground | `brand-assets.test.ts` "light assets use the bond tokens" (pass) |
| The mark matches the site geometry | `brand-assets.test.ts` "every mark matches the site geometry" (pass). Visual check of the banner mark. |
| No retired color remains in the brand sources | `brand-assets.test.ts` "no retired palette color remains in any brand SVG" (pass) |
| Font stacks name Chivo | `brand-assets.test.ts` "every font stack names Chivo first" and "no brand SVG names SF Mono or JetBrains Mono" (pass) |
| Text stays inside the bundled glyph set | `brand-assets.test.ts` "text uses only glyphs the bundled Chivo latin subset can draw" (pass). The PNGs show no tofu. |
| Rendering uses the bundled fonts only | Static: `brand-assets.test.ts` "the PNG renderer loads only the bundled Chivo fonts" (pass). Runtime: `npm run brand` regenerated all 9 PNGs in Chivo / Chivo Mono with system fonts disabled, and the output is byte-identical to the committed files. |
| A missing font stops the render | Runtime: renaming one `@fontsource` woff2 gave exit 1, named the file on stderr, and left no PNG written and no temp dir. Per review F2, this was exercised by renaming one font file, not by uninstalling every dev dependency. |

## Pre-existing / unrelated failures

None blocking. Review F5 is pre-existing. Column padding spaces collapse in `terminal-tree` / `terminal-init` because of SVG whitespace handling, so the second column is not aligned. This was already the case before this change, and the non-goal "no layout redesign" excludes it.

## Pending manual steps

None for testing. Task 2.5 (the local-first note in the PR description) and task 10.1 (sync + archive) belong to later stages.

## Verdict

PASS. The brand SVGs, PNGs, renderer, and fonts meet every brand-asset, typography, rendering, and missing-font scenario.
