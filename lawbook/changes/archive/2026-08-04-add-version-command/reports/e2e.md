# E2E checks — add-version-command (2026-08-04)

Date: 2026-08-04 · Branch: `feat/add-version-command` · Environment: local,
cwd `/Users/esneiderbravo/Projects/speclaw`, Node v24.17.0 via `npm`, package
version `0.1.14`.

The change is confined to the interactive CLI command surface
(`src/cli/commands/version.ts`, `src/cli/index.ts`, `src/cli/lib/update-check.ts`,
`src/cli/lib/ui.ts`) — which the `quality-gates` law verifies behaviorally and
excludes from the in-process coverage denominator — so this is the only
discipline report; `backend.md`/`frontend.md` are omitted.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Lint + format | `npm run check` | ✅ Prettier: "All matched files use Prettier code style!"; ESLint: clean |
| Type-check + compile | `npm run build` | ✅ `tsc` clean; `copy-assets: copied assets for 3 module(s)` |
| Tests + coverage floor (80%) | `npm test` (after `rm -rf dist-test` to drop stale compiled tests) | ✅ `tests 116 · pass 116 · fail 0 · skipped 0`; coverage 97.80% lines / 91.80% branches / 98.04% functions (all ≥ 80) |

Test count 112 → 116: the three version aliases (`--version`, `-v`, `version`)
plus the help-lists-`--version` case. The CLI-surface modules
(`ui.js`/`update-check.js`) do **not** appear in the coverage report — no
in-process test imports them, keeping them e2e-verified per the law.

Note: `pretest` runs `tsc -p tsconfig.test.json` but does not prune outputs for
deleted test sources; a `rm -rf dist-test` was needed once after removing a
scratch unit test so the count reflected reality. Pre-existing tooling quirk,
not introduced here.

## Tests added / updated

In `test/e2e/cli.test.ts` (drives the built `dist/cli/index.js`):

- **`\`${alias}\` prints the package version and exits zero`** — parameterized
  over `--version`, `-v`, `version`. Asserts `code === 0`, `stdout.trim()`
  equals the `version` read from the repo `package.json`, and that neither
  stdout nor stderr matches `Unknown command|Usage: speclaw`. `runCli` sets
  `SPECLAW_NO_UPDATE_NOTIFIER=1`, so the network check is skipped and the suite
  stays hermetic — exactly the opted-out path the spec requires.
- **`help lists the --version command`** — asserts `speclaw help` exits `0` and
  its stdout matches `/--version/`.

TDD evidence: before the source edit, `speclaw --version` hit the `default:`
branch (exit `1`, `Unknown command`); the new `code === 0` assertions fail
against that and pass after wiring `runVersion`.

No in-process unit test was added for `upgradeNotice`/`link`: importing them
would drag the CLI-surface modules into the coverage denominator (observed:
totals fell to 93.84%/86.02% and `ui.js`/`update-check.js` appeared in the
report), contradicting the law's behavioral-verification model. They are
verified by the isolated demo below instead.

## Spec-scenario coverage

Delta spec: `specs/cli/spec.md`.

**Requirement: Report the installed version**

| Scenario | Verified by |
|----------|-------------|
| `--version` prints the installed version and exits zero | e2e alias test + manual `node dist/cli/index.js --version` → `0.1.14`, exit `0` |
| The version aliases are equivalent | e2e parameterized test over all three; manual run of `--version`/`-v`/`version` → identical `0.1.14`, exit `0` |
| The version command is not treated as unknown | e2e `doesNotMatch(/Unknown command\|Usage: speclaw/)`; regression: `frobnicate` still exits `1` |
| The command is documented in help | e2e `help lists the --version command`; manual `help` grep shows the `--version` line |

**Requirement: Suggest an upgrade when a newer version is published**

| Scenario | Verified by |
|----------|-------------|
| A newer published version is offered with a clickable upgrade link | Isolated demo: `upgradeNotice("0.1.14","0.2.0")` with `FORCE_COLOR=1` emitted the OSC 8 sequence `ESC]8;;https://www.npmjs.com/package/@esneiderbravo/speclaw ESC\ 0.2.0 ESC]8;;ESC\` wrapping the new version, plus the `speclaw update` line — a clickable link to the npm page |
| stdout stays a clean version string for scripts | Manual: `out=$(node dist/cli/index.js --version 2>/tmp/v.err)` → `stdout=[0.1.14]`, 1 line, `stderr=[]` |
| No suggestion in non-interactive or opted-out runs | Manual: piped (non-TTY) run emitted only the bare version, no network; e2e runs with `SPECLAW_NO_UPDATE_NOTIFIER=1` print bare version only |
| A registry failure never breaks the command | By construction: the lookup is wrapped in `try { … } catch { /* swallow */ }`, so the version is already on stdout and the process exits `0` regardless. (npm latest is currently `0.1.14` = installed, so no live suggestion fired.) |

## Pre-existing / unrelated failures

None. All 116 tests pass; coverage is 97.80% / 91.80% / 98.04%, unchanged from
before this change (the touched CLI-surface files stay outside the denominator).

## Pending manual steps

None automatable beyond the above. The live upgrade suggestion could not fire
end-to-end because npm's latest equals the installed version (`0.1.14`); its
rendering was proven with the isolated demo in both color modes, and the print/
skip/scriptability paths were exercised against the built binary.

## Verdict

✅ Green. `speclaw --version`/`-v`/`version` print the locally installed version
to stdout and exit `0`; interactively they offer a clickable npm upgrade link on
stderr when a newer version exists; scripts and CI get a clean bare value. All
gates pass above the 80% coverage floor.
