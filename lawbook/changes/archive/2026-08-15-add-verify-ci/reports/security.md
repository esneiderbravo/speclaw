# Security checks — add-verify-ci (2026-08-15)

Date · Branch · Environment/cwd: 2026-08-15 · `feat/verify-ci` · darwin · `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| :-- | :-- | :-- |
| Lint + format | `npm run check` | ✅ exit 0 |
| Type-check + compile | `npm run build` | ✅ exit 0 |
| Tests + coverage | `npm test` | ✅ 236 passed |
| Asset inspection | `test/unit/assets-workflows.test.ts` | ✅ consumer template, `action.yml`, dogfood workflow |

## Tests added / updated

- `test/unit/assets-workflows.test.ts` — consumer YAML has no `pull_request_target`, workflow-level `permissions: {}`, `fetch-depth: 0`, job `contents: read` + `security-events: write`, `uses: esneiderbravo/speclaw@v1`.
- `test/integration/scaffold.test.ts` — existing workflow is never overwritten (user edit preserved).
- Dogfood workflow asserts local `dist/cli` (not `npx` of a published release) and the same trigger/permission constraints.

## Spec-scenario coverage

| Scenario | How verified |
| :-- | :-- |
| Template does not use `pull_request_target` | `assets-workflows.test.ts` + scaffold integration (string absent from the written file) |
| Permissions are denied by default | `permissions: {}` at workflow level; verify job only `contents: read` and `security-events: write` |
| Existing workflow is left untouched | scaffold second run keeps `# locally edited` |
| Missing workflow is created | scaffold first run writes `.github/workflows/speclaw.yml` |
| A project without the workflow receives it on update | same `ensureVerifyWorkflow` path (`scaffold` is what `update` calls) |
| A project that already has the workflow keeps it | same skip-if-exists path |

## Pre-existing / unrelated failures

none

## Pending manual steps

none. The verify job is given no secrets. Composite Action runs `npx` of the published package (consumers) or this repo’s `dist/` (dogfood); neither step is granted `pull-requests: write`.

## Verdict

pass
