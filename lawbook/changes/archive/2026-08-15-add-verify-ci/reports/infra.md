# Infra checks — add-verify-ci (2026-08-15)

Date · Branch · Environment/cwd: 2026-08-15 · `feat/verify-ci` · darwin · `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| :-- | :-- | :-- |
| Lint + format | `npm run check` | ✅ Prettier formatted `action.yml` and both workflow YAML files; check exit 0 |
| Type-check + compile | `npm run build` | ✅ `copy-assets` copies `src/modules/foundation/assets/workflows/` into `dist/` |
| Tests + coverage | `npm test` | ✅ `test/unit/assets-workflows.test.ts` passed |

## Tests added / updated

- Consumer template `src/modules/foundation/assets/workflows/speclaw.yml`: `on: pull_request`, `permissions: {}`, `fetch-depth: 0`, `uses: esneiderbravo/speclaw@v1`.
- `action.yml` at package root: Node **24**, `index` then `verify --ci --sarif --json --strict-engines`.
- Dogfood `.github/workflows/speclaw.yml`: `npm ci && npm run build && node dist/cli/index.js index && verify --ci` (not npx of last release), `--path src`, Node 24.
- `MIGRATIONS` entry `0.3.4` in `src/cli/commands/update.ts` (agent prompt only; file write is `ensureVerifyWorkflow` in scaffold).
- Package version **0.3.4** (`package.json` + lockfile).

## Spec-scenario coverage

| Scenario | How verified |
| :-- | :-- |
| Missing workflow is created | `test/integration/scaffold.test.ts` |
| Existing workflow is left untouched | same |
| A project without the workflow receives it on update | `ensureVerifyWorkflow` is called from `scaffold`, which `update` already invokes |
| A project that already has the workflow keeps it | skip-if-exists |
| Template security defaults | `test/unit/assets-workflows.test.ts` |
| Carried-forward update/migration scenarios | existing update tests + new `0.3.4` entry present in source |

## Pre-existing / unrelated failures

none

## Pending manual steps

none. Publishing the `v1` tag so `uses: esneiderbravo/speclaw@v1` resolves for **consumers** is a release step, out of this slice. This repo’s dogfood workflow does not wait on that tag.

## Verdict

pass
