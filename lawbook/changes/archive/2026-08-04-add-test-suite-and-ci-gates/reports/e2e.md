# E2E checks — add-test-suite-and-ci-gates (2026-08-04)

Date: 2026-08-04 · Branch: `feat/add-test-suite-and-ci-gates` · Environment:
Node v24.17.0, macOS (darwin 25.5.0), cwd `/Users/esneiderbravo/Projects/speclaw`.
The e2e suite drives the built `dist/cli/index.js` (so `npm run build` runs
first) in `mkdtemp` scratch repos.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Build the CLI | `npm run build` | ✅ `tsc` + copy-assets clean |
| E2E suite | `node --test 'dist-test/test/e2e/**/*.test.js'` | ✅ **6 tests, 6 pass, 0 fail** |
| CI workflow YAML | parsed `.github/workflows/ci.yml` | ✅ valid YAML; `build` + `test` jobs present |
| Branch-protection payload | parsed `.github/branch-protection.json` | ✅ valid JSON; required checks `build`,`test`, `strict`, linear history, no force-push/deletion |
| Apply-script dry run | `gh repo view --json nameWithOwner` | ✅ resolves `esneiderbravo/speclaw`; **no settings mutated** |

E2E cases (each asserts exit code + output):

- `help` → exit 0, prints `Usage: speclaw`.
- unknown command → exit 1, `Unknown command`.
- `doctor` on an unconfigured repo → exit 1, reports the `ai-specs` check.
- `lawbook init` then `lawbook list` → exit 0, workspace created and listed.
- `index` then `explore alpha` / `search beta` on a seeded repo → exit 0,
  `explore` prints `function alpha` source; `search` finds `beta`.
- `explore` with no index → exit 1, `No index` guidance.

## Tests added / updated

- `test/e2e/cli.test.ts` — the six cases above, guarded to skip with a clear
  message when `dist/` is not built.
- `test/helpers/cli.ts` — `runCli()` (spawns the built CLI with `NO_COLOR` and
  `SPECLAW_NO_UPDATE_NOTIFIER`) and `cliBuilt()`.
- CI: `.github/workflows/ci.yml` gains the `test` job (Node 24, `npm ci` →
  `npm run build` → `npm test`).
- Protection: `.github/branch-protection.json` + `scripts/apply-branch-protection.sh`.

## Spec-scenario coverage

| Scenario (specs/quality-gates/spec.md) | Verified by |
|----------------------------------------|-------------|
| Every module is exercised (CLI surface) | e2e drives `help`, `doctor`, `lawbook init/list`, `index`, `explore`, `search` against the built CLI |
| The interactive CLI is verified by end-to-end tests | the 6 e2e cases spawn `dist/cli/index.js` as a child process and assert exit code + output, standing in for in-process coverage of the CLI surface |
| CI runs the test suite on a pull request | `ci.yml` `test` job triggers on `pull_request`; runs `npm test` (validated: valid YAML, job present) |
| A failing test blocks the CI check | `npm test` non-zero exit (proven in backend report) surfaces as the `test` status check |
| Protection configuration is committed and reproducible | `.github/branch-protection.json` + `scripts/apply-branch-protection.sh` committed; JSON validated |
| A pull request with failing checks cannot merge | payload sets `required_status_checks:{strict:true, contexts:[build,test]}` and requires a PR — applied by the maintainer |
| Direct pushes and force-pushes to main are refused | payload sets `allow_force_pushes:false`, `allow_deletions:false`, `required_linear_history:true`, `enforce_admins:true` |

## Pre-existing / unrelated failures

None.

## Pending manual steps

- **Apply branch protection** (`scripts/apply-branch-protection.sh`) — requires
  repo admin (Rule 6); run it after the `test` check has reported at least once
  (a status check can only be *required* after GitHub has seen it). The agent did
  not run it; only the read-only slug resolution was exercised.

## Verdict

✅ The built CLI behaves correctly across the exercised commands (6/6 e2e), and
the CI `test` job + committed branch protection are in place to gate merges once
applied.
