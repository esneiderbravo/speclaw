# Backend checks — add-verify-ci (2026-08-15)

Date · Branch · Environment/cwd: 2026-08-15 · `feat/verify-ci` · darwin · `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| :-- | :-- | :-- |
| Lint + format | `npm run check` | ✅ `Checking formatting... All matched files use Prettier code style!` then ESLint exit 0 |
| Type-check + compile | `npm run build` | ✅ `tsc && node scripts/copy-assets.mjs` → `copy-assets: copied assets for 3 module(s)` |
| Tests + coverage | `npm test` | ✅ `tests 236` · `pass 236` · `fail 0` · line **98.24%** · branch **89.79%** · funcs **97.23%** (floor 80%) |

## Tests added / updated

- `test/unit/ci-verdict.test.ts` — `parseFailOn`, fingerprint `lawId:file:line`, exit codes 0/1/4 and findings beating skips.
- `test/unit/sarif.test.ts` — SARIF 2.1.0, one rule per law, relative URIs, skip notifications, 5000-cap truncation by severity.
- `test/unit/markdown-report.test.ts` — findings table; skipped details; no coverage claims.
- `test/unit/git-diff.test.ts` — `mergeBase` / `changedFiles` on throwaway repos.
- `test/unit/laws.test.ts` — seed is no longer path-only; `mergeSeedLaws` appends by id; `loadManifestForVerify` seed fallback; seed `deps` laws use `edgeKinds: ["import"]`.
- `test/integration/verify.test.ts` — missing manifest + no index → seed batch laws skipped with `no-index`, not an empty pass.
- `test/integration/scaffold.test.ts` — workflow written iff missing; merge-by-id on a curated manifest.
- `test/integration/hooks.test.ts` — refresh keeps a mutated seed entry and appends missing ids (replaces the old “empty array stays empty” assertion).

## Spec-scenario coverage

| Scenario | How verified |
| :-- | :-- |
| Missing manifest falls back to the shipped seed | `test/integration/verify.test.ts` “no manifest falls back…” + `loadManifestForVerify` unit |
| Seed architecture deps laws consider import edges only | `test/unit/laws.test.ts` asserts seed `edgeKinds: ["import"]` |
| A curated manifest is preserved on update | `test/integration/hooks.test.ts` + `scaffold.test.ts` merge-by-id |
| The manifest is seeded on init | existing scaffold/hooks tests (still assert `law~no-secrets-in-repo~1`) |
| A law with an unimplemented backend is inert | existing `test/integration/verify.test.ts` |
| Passed, failed, and unknown in one run | existing integration verify fixture |
| Missing index does not silently pass | existing + updated no-manifest case |
| Engine filter restricts what runs | existing |
| Forbidden dependency / group matching / unresolved unknown | existing `test/unit/deps.test.ts` |
| Minimal cycle / intra-file / deep chain | existing `test/unit/graph.test.ts` |
| Deps payload / legacy path / malformed regex | existing `test/unit/laws.test.ts` |
| Conforming project exits zero | e2e `verify` without index (soft) + manual throwaway indexed clean tree (`clean_ci=0`) |
| New violation exits one | e2e cycle against seed graph law |
| Incomplete verification → exit 4 | e2e `--strict-engines` without index |
| Shallow clone under `--ci` exits 3 | e2e shallow clone |
| Unwritable SARIF path exits three | e2e `verify cannot write SARIF to a missing directory` |
| Unknown flag combination exits 2 | e2e `--fail-on fatal` / `--format xml` |
| SARIF one rule per law / relative locations / skip notifications | `test/unit/sarif.test.ts` |
| Coverage claims require traceability data | `test/unit/markdown-report.test.ts` |
| Carried-forward hook/check/doctor scenarios | existing `test/unit/check.test.ts`, `test/integration/hooks.test.ts`, `test/e2e/cli.test.ts` |

## Pre-existing / unrelated failures

none

## Pending manual steps

none — throwaway `/tmp/speclaw-verify-*` exercised scaffold, exit 0/1/2/4, SARIF/JSON artifacts, `$GITHUB_STEP_SUMMARY`, and workflow-if-missing. Isolated: OS temp dir, removed after the run.

## Verdict

pass
