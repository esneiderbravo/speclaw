# CLI report — sync-site-theme

**Discipline:** cli (truecolor palette in `src/cli/lib/ui.ts`, branded header and status lines) · **Change:** `sync-site-theme` (feature, level 1) · **Date:** 2026-10-06
**Branch:** `feat/sync-site-theme` (HEAD `a68fcff`, plus the uncommitted F1 test fix) · **cwd:** `/Users/esneiderbravo/Projects/speclaw`

## Gates and results

| Check | Command | Result |
| --- | --- | --- |
| Format + lint | `npm run check` | PASS, exit 0 |
| Type-check + compile | `npm run build` | PASS, exit 0 |
| Full test suite + coverage floor | `npm test` | PASS, exit 0. 637/637 pass, 0 fail. All files: 85.56 % lines, 82.10 % branches, 87.78 % functions. |
| Palette tests | `node --test dist-test/test/unit/ui-palette.test.js` | 5/5 pass |
| Existing header test | `npm test` → "help shows the branded header once, ahead of the usage text" | pass |
| F1 negative control | Scratch copy of the compiled test (`dist-test/test/unit/scratch-f1.test.js`, deleted afterwards) with `NO_COLOR: "1"` removed so only `FORCE_COLOR: "1"` remains | **Fails as intended:** 4 pass, 1 fail, `AssertionError: cyan emits no escape under NO_COLOR`. The real test therefore guards the `NO_COLOR` clause. |
| Coverage | `npx speclaw coverage --only-defects` | "ok - 29 total". `req~brand-terminal-palette~1` is traced after the `brand` capability is synced (10.1). The `// Covers:` tags are in `ui.ts` and `ui-palette.test.ts`. |

## Manual verification (task 7.1)

All CLI runs used the built `dist/cli/index.js`. Commands that need a project ran in the throwaway git repo `/tmp/sst-cli-q5ZG`. Before and after file lists of that repo show `doctor` wrote nothing; the only new file was my own redirected `out.txt`. Nothing ran `init`, and nothing wrote into this repository.

- **`FORCE_COLOR=1 node dist/cli/index.js help`** (raw, via `cat -v`). Header:
  `^[[38;2;0;227;253m◈^[[0m ^[[1m^[[38;2;244;244;243mspeclaw^[[0m^[[0m  ^[[38;2;153;158;163mv2.0.6^[[0m ^[[38;2;153;158;163m· where specs become law^[[0m`.
  Unique triples: `0;227;253` ×1, `244;244;243` ×1, `153;158;163` ×2.
- **`FORCE_COLOR=1 … doctor`** (scratch repo, exit 0). It covers the heading, ok, and warn lines. Triples: `62;207;122` ×27 (green ✓), `244;244;243` ×30, `245;183;61` ×2 (amber `!` on "rule lockfile"), `0;227;253` ×2, `153;158;163` ×2.
- **`FORCE_COLOR=1 … lawbook validate nope`** and **`… cortex status --change nope`** (scratch repo, exit 1). These print `38;2;255;92;71m✗`, the deny red error mark.
- **No retired sequence.** `46;230;230` and the other old triples are not in any captured output.
- **`NO_COLOR=1`** on `help`, `doctor`, and `lawbook validate nope`: 0 ESC bytes. The header is not printed; the first line is `speclaw — spec-driven, agent-ready projects …`.
- **`NO_COLOR=1 FORCE_COLOR=1`** on the same three commands: 0 ESC bytes. `NO_COLOR` wins.
- **Piped, `FORCE_COLOR` unset** (`help`): 0 ESC bytes and no header.

## Tests added / updated

- `test/unit/ui-palette.test.ts`, updated in this pass (review F1). The "NO_COLOR keeps every slot plain" child env is now `{ ...process.env, FORCE_COLOR: "1", NO_COLOR: "1" }` instead of deleting `FORCE_COLOR`. A comment explains that `FORCE_COLOR` alone would paint, so only the `NO_COLOR` clause keeps the output plain. The negative control above proves that this test now fails without `NO_COLOR`.

## Spec-scenario coverage (`specs/brand/spec.md`, `req~brand-terminal-palette~1`)

| Scenario | Verified by |
| --- | --- |
| Accent, text, and error colors come from the site tokens | `ui-palette.test.ts` "accent, text, secondary, and error slots come from the site tokens" (pass). Live triples `0;227;253`, `244;244;243`, `153;158;163`, and `255;92;71` appear in the CLI output. |
| Every palette color is legible on the ink ground | `ui-palette.test.ts` "every palette color holds at least 4.5:1 on the ink paper" (pass). Ratios: 11.86 / 16.88 / 6.88 / 9.21 / 10.37 / 6.08, see `brand.md`. |
| Forced color emits the new accent | `ui-palette.test.ts` "forced color paints the accent as signal truecolor" (pass). Live `FORCE_COLOR=1 help` output contains `38;2;0;227;253`. |
| Disabled color keeps plain text | `ui-palette.test.ts` "NO_COLOR keeps every slot plain" (pass, now a real guard per F1). Live `NO_COLOR=1` and `NO_COLOR=1 FORCE_COLOR=1` runs had 0 escapes. |

## Pre-existing / unrelated failures

None. Known papercut, unrelated and not exercised: `init --help` executes `init`.

## Pending manual steps

None.

## Verdict

PASS. The CLI palette emits the ink-theme truecolor triples, all at ≥ 4.5:1, and `NO_COLOR` reliably produces plain output.
