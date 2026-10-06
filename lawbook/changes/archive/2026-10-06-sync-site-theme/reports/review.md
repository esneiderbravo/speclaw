# Review — sync-site-theme

**Discipline:** review · **Change:** `sync-site-theme` (feature, level 1) · **Date:** 2026-10-06
**Branch:** `feat/sync-site-theme` (6ebba1c feat + 53fe9b1 merge of `origin/main` + a68fcff lock refresh)
**cwd:** `/Users/esneiderbravo/Projects/speclaw` · **Reference (read-only):** `/Users/esneiderbravo/Projects/speclaw-site`

## Verdict: PASS

The implementation matches the proposal, tasks, and the `brand` delta spec. Every color, the mark geometry, the font stacks, the renderer, the tests, and the docs check out. The findings below are advisory and do not block the change.

## What was checked

| Check | Method | Result |
| --- | --- | --- |
| Every hex in `brand/*.svg` is a site token or the re-tuned green/amber | Grepped every `#rrggbb` / `rgba(` in `brand/*.svg` and compared each to `app/tokens.css` | PASS. Dark: `#131313 #0d0d0e #1f2022 #303236 #4c5056 #f4f4f3 #babdc1 #999ea3 #00e3fd #0a3f47 #ff5c47 #7c8083` plus `#3ecf7a #f5b73d`. Light: `#f4f4f3 #cdcdc8 #131313 #3e4042 #56595d #00707f`. No named colors. |
| `PALETTE` in `src/cli/lib/ui.ts` | Read | PASS. Matches proposal 1.1. Slot names are kept, the object is frozen and exported, the header comment is rewritten, and `// Covers: req~brand-terminal-palette~1` is present. |
| `renderHtml` in `src/modules/compass/visualize.ts` | Read | PASS. The `:root` vars, panel/legend grounds `rgba(31,32,34,.82)`, the tooltip on `--sh` with a `--cy` border, `KIND_COLORS`, the `#7c8083` fallback, the edges `rgba(0,227,253,.7)` / `rgba(124,128,131,.16)`, the label `#f4f4f3`, the tooltip span `#999ea3`, and the Chivo Mono stack all match the mapping. `// Covers:` is present. |
| Retired palette gone repo-wide | Grepped all 15 retired hexes plus the old RGB `46;230;230`, excluding `lawbook/changes/**`, `test/helpers/brand.ts`, the lockfile, and build output | PASS: no matches |
| Mark geometry vs site | Compared `brand/speclaw-{mark,mark-light,banner,banner-light}.svg` with `components/Mark/Mark.tsx`, and `brand/speclaw-favicon.svg` with `app/icon.svg` | PASS, exact. Inline marks: rect 5/3.5/21/25 at stroke 2.5, lines in ink-faint at 2.5, law `M10 24.5h21` at 3.5. Favicon: rx 44 tile, stroke 2, `#7c8083` lines, law `h18` at stroke 3 (byte-identical to icon.svg apart from C2PA metadata and the 32px size). |
| Contrast claims | Spot-checked with WCAG 2.x by hand, same formula as `test/helpers/brand.ts#contrast` | PASS. `#ff5c47`/`#131313` = 6.08 (claimed 6.1). `#3ecf7a`/`#131313` = 9.21 (9.2). `#00707f`/`#f4f4f3` = 5.26 (5.3). Extra: `#00e3fd` text on `#0a3f47` (cortex-loop CORTEX card) = 7.4. |
| PNG renders | Opened `brand/speclaw-banner.png`, `terminal-init.png`, `terminal-tree.png`, `cortex-loop.png` | PASS. Chivo 800 wordmark and Chivo Mono text render. No tofu and no serif fallback. The drawn diamond, check, and tree connectors render. Colors match the tokens and the mark matches the site. |
| Renderer `scripts/render-brand.mjs` | Read | PASS. `loadSystemFonts: false` is set. Four static woff2 files resolve via `createRequire(import.meta.url).resolve`. `resolveFont` runs before `mkdtempSync`, so a missing font exits 1 and names the path without leaking a temp dir. The temp dir is removed in `finally`. The render list is unchanged (task 2.4). The aliasing regex matches the single-quoted family names every SVG uses, which the test enforces with `^'Chivo`. |
| Dependencies / local-first | `package.json` | PASS. `@fontsource/chivo`, `@fontsource/chivo-mono`, and `wawoff2` are in `devDependencies` only. `files` is still `["dist","ATTRIBUTION.md"]`, and rendering reads only local files. The fonts are OFL-1.1 and are not shipped, so `ATTRIBUTION.md` does not need to change. The local-first justification is in `proposal.md` → Non-goals. Copying it into the PR is task 2.5, which is still open and expected. |
| README / docs | `README.md`, `docs/standards/frontend-standards.md`, `CHANGELOG.md` | PASS. All shields badges use `color=00707f`, `labelColor=131313`. The caption reads "Cyan steps…". `frontend-standards.md` names signal on ink and `app/tokens.css`. The `## [2.0.6]` section sits under an empty `## [Unreleased]`, and `package.json` is at 2.0.6. |
| Tests guard the requirements | `test/unit/ui-palette.test.ts`, `test/unit/visualize-palette.test.ts`, `test/unit/brand-assets.test.ts`, `test/helpers/brand.ts` | PASS. Each scenario has an assertion (see the mapping below). The `// Covers:` tags point at `req~brand-terminal-palette~1` and `req~brand-viewer-palette~1`, and both IDs exist in `specs/brand/spec.md`. `RETIRED_HEXES` matches the spec's retired list one for one. |
| Spec delta quality | `specs/brand/spec.md` | PASS. The new capability is justified, with no near-duplicate. Requirements use EARS forms (ubiquitous / WHEN / IF-THEN) with Given/When/Then scenarios. The retired palette is defined once and reused. The boundary with `cli` is stated. |
| Unrelated changes via the merge | Refs and diff file list | PASS. Local `main` (`cad8da0`) is stale. `origin/main` is `eb8e1d3` (PR #52). `src/modules/foundation/integrity.ts`, `lawbook/specs/law-enforcement/spec.md`, `lawbook/anchors/law-enforcement.json`, and `lawbook/changes/archive/2026-10-06-lock-regenerable-symlink/**` come from PR #52 and are not part of this change. `speclaw.lock` was refreshed for the `frontend-standards.md` edit (a68fcff). |

## Scenario → test mapping

| Scenario | Guard |
| --- | --- |
| Accent, text, and error colors come from the site tokens | `ui-palette.test.ts` "accent, text, secondary, and error slots…" |
| Every palette color is legible on the ink ground | `ui-palette.test.ts` "every palette color holds at least 4.5:1" (iterates over all slots) |
| Forced color emits the new accent | `ui-palette.test.ts` "forced color paints the accent…" (child process, exact escape) |
| Disabled color keeps plain text | `ui-palette.test.ts` "NO_COLOR keeps every slot plain" (see F1) |
| Viewer HTML uses the ink tokens | `visualize-palette.test.ts` "viewer HTML draws on the ink tokens" |
| Viewer HTML carries no retired color | `visualize-palette.test.ts` "viewer HTML carries no retired color" (also checks old rgba values and old fonts) |
| Dark assets sit on the ink ground | `brand-assets.test.ts` "dark assets carry signal and sit on paper" |
| Light assets sit on the bond ground | `brand-assets.test.ts` "light assets use the bond tokens" |
| The mark matches the site geometry | `brand-assets.test.ts` "every mark matches the site geometry" |
| No retired color remains in the brand sources | `brand-assets.test.ts` "no retired palette color remains…" |
| Font stacks name Chivo | `brand-assets.test.ts` "every font stack names Chivo first" |
| Text stays inside the bundled glyph set | `brand-assets.test.ts` "text uses only glyphs…" |
| Rendering uses the bundled fonts only | `brand-assets.test.ts` "the PNG renderer loads only the bundled Chivo fonts" (static check; the runtime check is task 7.1) |
| A missing font stops the render | Static check for `process.exit(1)` in the same test. The runtime check is the tester's job (task 7.1). |

## Findings (advisory, non-blocking)

- **F1. The `NO_COLOR` test passes without testing `NO_COLOR`** (`test/unit/ui-palette.test.ts`, "NO_COLOR keeps every slot plain"). The child's stdout is a pipe and the test deletes `FORCE_COLOR`. That makes `colorOn` false through the TTY check alone, so the test would still pass if the `!process.env.NO_COLOR` clause were removed. To make it guard the scenario, set `FORCE_COLOR: "1"` together with `NO_COLOR: "1"`. This is a low-cost follow-up and can be done during the tester pass or later.
- **F2. Missing-font guarantee only covers the `@fontsource` packages** (`scripts/render-brand.mjs`). If every dev dependency is absent, the top-level ESM `import` of `@resvg/resvg-js` or `wawoff2` fails first with `ERR_MODULE_NOT_FOUND`, which names the package, not a font file. The spec scenario says "the Chivo dev dependencies are not installed", so the requirement still holds as written. The tester should run the 7.1 check by removing or renaming an `@fontsource` package or file, not by uninstalling all dev dependencies.
- **F3. Renderer tests read the source, not the behavior** (`brand-assets.test.ts`, last test). It greps the script for `loadSystemFonts: false`, the file names, and `process.exit(1)`. This is acceptable because the runtime evidence belongs to the tester's manual verification (task 7.1), which must be recorded in `reports/brand.md`.
- **F4. Four brand requirements have no requirement ID** (`specs/brand/spec.md`): assets, typography, PNG rendering, and missing fonts. That is why `brand-assets.test.ts` has no `// Covers:` tag. Unanchored requirements are common in the canonical specs (29 of 194 carry IDs), so this is not a defect. Anchoring them later would let `speclaw coverage` trace them.
- **F5. Padding spaces collapse in the terminal captures** (`brand/terminal-tree.svg`, `terminal-init.svg`). Column padding such as `speclaw.lock␣␣␣␣…` is collapsed by SVG whitespace handling, so the second column is not aligned in the PNG. This was already the case before this change and is excluded by the non-goal "no layout redesign", so it is not for this change.

## Open items owned by later stages (expected at review)

- Task 2.5: put the local-first justification in the PR description.
- Task 6.1: gates. Task 7.1: manual verification, including a real missing-font run and `NO_COLOR` / `FORCE_COLOR` runs of the CLI. Task 8.1: `brand.md`, `cli.md`, and `frontend.md` reports.
- Task 10.1: sync the `brand` capability and archive.

## Rework guidance

None required. F1 is a one-line test improvement that can go in with the tester pass if the coordinator wants it.
