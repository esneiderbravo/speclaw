# API checks — add-verify-ci (2026-08-15)

Date · Branch · Environment/cwd: 2026-08-15 · `feat/verify-ci` · darwin · `/Users/esneiderbravo/Projects/speclaw`

`speclaw verify` is a new CLI contract (not an HTTP API and not a new MCP tool). `law_verify` / `speclaw laws verify` / `speclaw check` are unchanged.

## Gates & results

| Check | Command | Result |
| :-- | :-- | :-- |
| Lint + format | `npm run check` | ✅ Prettier `--check` + ESLint exit 0 |
| Type-check + compile | `npm run build` | ✅ `tsc` + `copy-assets: copied assets for 3 module(s)` |
| Tests + coverage | `npm test` | ✅ 236 passed, 0 failed |

## Contract

| Surface | Contract |
| :-- | :-- |
| Command | `speclaw verify` |
| Auth / permissions | none (local process; `--ci` sets `NO_COLOR`) |
| Inputs | `--ci`, `--fail-on error\|warn\|info` (default `error`), `--strict-engines`, `--format text\|json\|sarif\|markdown`, `--sarif <file>`, `--json` / `--json <file>`, `--engine`, `--path`, `--law` |
| stdout | text summary, or JSON/SARIF/markdown when requested; no branded header |
| `$GITHUB_STEP_SUMMARY` | markdown report appended when the env var is set |
| Exit 0 | no finding at or above `--fail-on` |
| Exit 1 | at least one such finding |
| Exit 2 | usage (`--fail-on` / `--format` invalid) |
| Exit 3 | environment (shallow clone under `--ci`, unwritable `--sarif`/`--json`) |
| Exit 4 | `skipped.length > 0` and `--strict-engines` |
| MCP | no new tool; `law_verify` still the batch twin |

How exercised: `test/e2e/cli.test.ts` (built `dist/cli/index.js` in throwaway repos) and manual `node dist/cli/index.js verify …` in `/tmp/speclaw-verify-*`.

## Tests added / updated

- e2e: help lists `verify`; no header; exit 2/3/4/1/0; `--json` / `--sarif` files; `$GITHUB_STEP_SUMMARY`.
- contract tests unchanged: foundation tool list still has `law_verify`, not a `verify` MCP tool (`test/contract/registers.test.ts`).

## Spec-scenario coverage

| Scenario | How verified |
| :-- | :-- |
| `help` lists verify | e2e `help lists the verify command` |
| `verify` emits no header | e2e `verify emits no header even when forced interactive` |
| Conforming project exits zero | e2e soft verify; manual indexed clean tree `clean_ci=0` |
| New violation exits one | e2e seed graph cycle |
| Incomplete verification → 4 | e2e `--strict-engines` |
| Shallow clone → 3 | e2e `--depth=1` clone |
| Unknown flag → 2 | e2e `--fail-on fatal` |
| SARIF / markdown contracts | unit sarif + markdown-report; e2e file writes |
| Carried-forward CLI header scenarios | existing e2e header tests |

## Pre-existing / unrelated failures

none

## Pending manual steps

none

## Verdict

pass
