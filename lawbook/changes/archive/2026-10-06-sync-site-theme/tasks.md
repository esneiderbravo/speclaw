# Tasks — sync-site-theme

Source of truth (read-only): `../speclaw-site/app/tokens.css`,
`../speclaw-site/app/icon.svg`, `../speclaw-site/components/Mark/Mark.tsx`.
The colors and geometry to apply are in `proposal.md` → "Color mapping". The
human's answers to Q1–Q4 are recorded there under "Answered questions".

## 0. Branch

- [x] 0.1 Step 0: Create the feature branch (must be first). `feat/sync-site-theme`
  already exists and is checked out. Check it with `git branch --show-current`.

## 1. CLI palette (`src/cli/lib/ui.ts`)

- [x] 1.1 Set `PALETTE` to the dark mapping: `cyan` `#00e3fd`, `cyanDim`
  `#00e3fd` (Q1), `cream` `#f4f4f3`, `muted` `#999ea3`, `green` `#3ecf7a`,
  `amber` `#f5b73d`, `red` `#ff5c47`. Keep each RGB tuple's hex comment and
  keep the slot names (non-goal: no rename). Export `PALETTE` as a readonly
  value so the unit test can read it. Add `// Covers: req~brand-terminal-palette~1`.
- [x] 1.2 Rewrite the file's header comment to name the new palette: signal
  cyan = the "law", ink text, ink-faint secondary, deny red, re-tuned
  green/amber, and the site tokens as the source.
- [x] 1.3 Add `test/unit/ui-palette.test.ts` (`// Covers: req~brand-terminal-palette~1`):
  - the accent, text, secondary, and error slots equal the token hexes;
  - a WCAG 2.x contrast helper in the test shows every slot at ≥ 4.5:1
    against `#131313`;
  - a child `node` process with `FORCE_COLOR=1` and `NO_COLOR` unset paints
    `c.cyan("x")` with `38;2;0;227;253`;
  - a child process with `NO_COLOR=1` returns the plain text.

## 2. Brand fonts and renderer (`scripts/render-brand.mjs`)

- [x] 2.1 Spike first (run by the coordinator; Q3). `@resvg/resvg-js` 2.6.2
  cannot read WOFF2 and ignores the variable `wght` axis, so install the static
  `@fontsource/chivo` and `@fontsource/chivo-mono` plus `wawoff2` as
  devDependencies (update `package-lock.json`). Confirm Chivo 400 and 800
  render distinctly and Chivo Mono renders monospaced.
- [x] 2.2 Make the renderer decode those font files to TTF in an
  `os.tmpdir()` temp dir and pass them as `font.fontFiles`, set
  `loadSystemFonts: false`, and set `defaultFontFamily` to Chivo. Alias the SVG
  names `'Chivo'` / `'Chivo Mono'` to the registered "Chivo Medium" / "Chivo
  Mono Medium". Resolve the paths through
  `node_modules` with `createRequire(import.meta.url).resolve`.
- [x] 2.3 If a font file is missing, make the renderer exit non-zero with a
  message that names the missing path.
- [x] 2.4 Make sure every SVG under `brand/` that has a PNG twin is rendered.
  Keep the existing render list and do not add new outputs.
- [x] 2.5 Note in the PR description why the new dev dependencies are needed
  (law `local-first`). They are dev-only, are used only by `npm run brand`,
  and are not shipped in the package. The justification is in `proposal.md`
  → Non-goals; copy it into the PR description when the PR is opened.

## 3. Brand SVGs (`brand/`)

- [x] 3.1 Recolor `speclaw-banner.svg`, `speclaw-mark.svg`,
  `speclaw-favicon.svg`, and `diamond.svg` to the dark mapping. Replace the old
  mark with the site mark (`Mark.tsx` geometry inline; the favicon follows
  `app/icon.svg`, per Q2).
- [x] 3.2 Recolor `speclaw-banner-light.svg` and `speclaw-mark-light.svg` to the
  bond mapping: paper `#f4f4f3` / sheet `#ffffff`, ink `#131313`, ink-faint
  `#56595d` mark lines, signal `#00707f`. Use the site mark geometry.
- [x] 3.3 Recolor `terminal-cli.svg`, `terminal-cortex.svg`, `terminal-init.svg`,
  `terminal-mcp.svg`, `terminal-quickstart.svg`, `terminal-tree.svg`, and
  `cortex-loop.svg`:
  - backgrounds go to paper / paper-sunk;
  - window chrome and cards go to sheet;
  - strokes go to rule / rule-strong;
  - text goes to ink / ink-muted / ink-faint;
  - accent goes to signal;
  - status colors go to the re-tuned green / amber and deny.

  `#0e8e8e` maps by use: fills → signal-dim, text or strokes → signal.
- [x] 3.4 Replace every font stack. Sans text uses `'Chivo', 'Helvetica Neue',
  Arial, sans-serif`. Mono text uses `'Chivo Mono', 'SFMono-Regular', Menlo,
  monospace`. Replace glyphs the Chivo latin subset lacks (`◇ ✓ ├ └ → ↔ ≥`)
  with drawn shapes or ASCII so nothing renders blank. Remove `SF Mono` and
  `JetBrains Mono`. If the wider Chivo Mono metrics overflow a terminal
  capture's width, fix it with spacing only and keep the content.
- [x] 3.5 Run `npm run brand` and commit the regenerated PNGs.
- [x] 3.6 Add `test/unit/brand-assets.test.ts`. It reads every `brand/*.svg`
  and asserts:
  - no retired-palette hex appears (case-insensitive);
  - no `SF Mono` / `JetBrains Mono` appears;
  - every `font-family` names Chivo first;
  - the mark's document rect and law line match the site geometry in each SVG
    that draws the mark.

## 4. Compass viewer (`src/modules/compass/visualize.ts`)

- [x] 4.1 In `renderHtml`, apply the dark mapping:
  - `:root` vars (`--cy`, `--cr`, `--mu`, `--bg`);
  - the panel and tooltip grounds and borders, including the `rgba(12,17,19,.82)`
    grounds;
  - `KIND_COLORS` and the `colorOf` fallback;
  - active and idle edge `rgba(...)` strokes;
  - label fill and the tooltip kind span.

  Add `// Covers: req~brand-viewer-palette~1`.
- [x] 4.2 Extend `test/integration/compass.test.ts` (the existing `visualize`
  test) or add a unit test on `renderHtml` (`// Covers: req~brand-viewer-palette~1`).
  Assert that the HTML contains `#131313` and `#00e3fd` and contains no
  retired-palette hex (case-insensitive).

## 5. Review and update the affected tests

- [x] 5.1 Review and update the affected tests. Run
  `speclaw affected-tests --from-diff main` and review each selected file.
  Check especially tests that snapshot CLI output with color forced, or that
  match the old RGB sequences such as `38;2;46;230;230`.

## 6. Quality gates

- [x] 6.1 Run the quality gates and verify they pass (see
  docs/standards/testing-standards.md):
  - `npm run check`;
  - `npm run build`;
  - `npm test` (≥ 80 % coverage floor);
  - `npx speclaw lawbook validate sync-site-theme`;
  - `speclaw coverage --only-defects` for `req~brand-terminal-palette~1` and
    `req~brand-viewer-palette~1`.

## 7. Manual verification (tester executes it, never the user)

- [x] 7.1 Perform manual verification of the behavior — the tester role
  executes this itself, never the user.
  - Run `npm run brand` and open each regenerated PNG. Check the colors, the
    mark, and that text renders in Chivo / Chivo Mono with no fallback serif
    or tofu.
  - Rename the font package dir in a throwaway copy (or point the resolver at a
    missing path) to show that a missing font exits non-zero and names the file.
  - Run `node dist/cli/index.js help` with `FORCE_COLOR=1` on a TTY and look at
    the header colors. Run it again with `NO_COLOR=1` and piped to confirm
    there is no header and no escapes.
  - Run `node dist/cli/index.js visualize` against a scratch repo under
    `os.tmpdir()` and inspect the HTML.

  Never write to the user's real `.speclaw` index.

## 8. Discipline reports

- [x] 8.1 Produce the discipline reports under reports/ — one per discipline
  touched, from an open set (e.g. backend.md, frontend.md, api.md, database.md,
  infra.md, security.md; api.md is required whenever the change touches an API
  surface) — with the unit/integration/e2e results for what the feature
  touched. Expected reports:
  - `brand.md` covers the SVGs, PNGs, renderer, and fonts, with the before and
    after contrast table;
  - `cli.md` covers the terminal palette and header;
  - `frontend.md` covers the Compass viewer HTML.

  No API surface changes, so no `api.md`. Every `#### Scenario` in
  `specs/brand/spec.md` is mapped.

## 9. Documentation and release

- [x] 9.1 Update the technical documentation touched by the change:
  - `docs/standards/frontend-standards.md` line 18 ("teal `#0E8E8E`") becomes
    the site tokens (signal `#00e3fd` on ink `#131313`), with
    `../speclaw-site/app/tokens.css` named as the source;
  - the `README.md` caption "Teal steps, green checks…" becomes cyan;
  - per Q4, retint the README shields badges (`color=00707f`,
    `labelColor=131313`).
- [x] 9.2 Bump `package.json` (and the lockfile's root version) to 2.0.6 (PR
  #52 took 2.0.5) and add a `## [2.0.6]` changelog section under an empty
  `## [Unreleased]`.

## 10. Archive

- [x] 10.1 Archive the change within the same PR (lawbook:archive) after harness
  review/test PASS. Reconcile and `sync` the new `brand` capability, then run
  `lawbook_archive`.
