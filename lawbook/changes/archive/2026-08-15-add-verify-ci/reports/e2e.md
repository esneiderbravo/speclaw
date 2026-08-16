# E2E checks — add-verify-ci (2026-08-15)

Date · Branch · Environment/cwd: 2026-08-15 · `feat/verify-ci` · darwin · `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| :-- | :-- | :-- |
| Lint + format | `npm run check` | ✅ exit 0 |
| Type-check + compile | `npm run build` | ✅ exit 0 |
| Tests + coverage | `npm test` | ✅ 236 passed, including the e2e suite against `dist/cli/index.js` |

## Tests added / updated

`test/e2e/cli.test.ts` (built CLI, throwaway `tmpRepo`):

- `help` lists `verify`
- `verify` emits no branded header under `FORCE_COLOR=1`
- `--fail-on fatal` → exit 2
- `--format xml` → exit 2
- no index → exit 0; `--strict-engines` → exit 4 and mentions `no-index`
- `--json out.json --sarif out.sarif` writes schemaVersion 1 / SARIF 2.1.0
- `--json` (boolean) prints JSON on stdout
- `--ci` on a `git clone --depth=1` → exit 3, mentions `fetch-depth: 0`
- unwritable `--sarif nope/out.sarif` → exit 3
- `$GITHUB_STEP_SUMMARY` receives markdown
- seed graph cycle (`src/a.ts` ↔ `src/b.ts`) → exit 1 naming `law~no-module-cycles~1`

## Spec-scenario coverage

| Scenario | How verified |
| :-- | :-- |
| `help` lists verify | e2e |
| `verify` emits no header | e2e |
| Conforming / violation / skip / shallow / usage exits | e2e + manual throwaway |
| Both transports return the same result | unchanged: CLI `laws verify` and MCP `law_verify` still call `verifyLaws`; new command is an orchestrator over the same core |
| Carried-forward e2e (`help`, `--version`, `check --hook-payload`, `lawbook`, `index`) | existing tests still passing |

## Pre-existing / unrelated failures

none

## Pending manual steps

none. Manual run in `/tmp/speclaw-verify-UlAZRu` (deleted after): `usage_exit=2`, `noindex_soft=0`, `noindex_strict=4`, `clean_ci=0`, `violation_ci=1`, `step_summary=ok`, `workflow_preserved=ok`.

This repository dogfood (seed fallback, `--ci --strict-engines --path src`): exit 0, `1 passed · 0 failed · 0 skipped · 2 unknown` (import-edge `deps` laws unknown until import resolution; graph cycle law passed). Isolated from user data: gitignored index + in-memory seed.

## Verdict

pass
