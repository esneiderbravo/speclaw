# Discipline reports — add-verify-ci

`build` fills these in, one per discipline this change touches, each following the
required report structure (header · gates table · tests added · spec-scenario
coverage · pre-existing failures · pending manual · verdict).

- **backend.md** — `verifyLaws` seed fallback, `mergeSeedLaws`, git helpers,
  `ci.ts` / `sarif.ts` / `report-md.ts`, the `speclaw verify` CLI, scaffold
  workflow-if-missing; unit + integration results.
- **api.md** — required: `speclaw verify` is a new CLI contract (exit codes,
  `--sarif`/`--json` shapes). No new MCP tool.
- **security.md** — workflow template has no `pull_request_target`, empty
  workflow-level `permissions`, `fetch-depth: 0`, least-privilege job
  permissions.
- **e2e.md** — built CLI exit codes and `--json`/`--sarif` from `dist/cli`.
- **infra.md** — `action.yml` and `.github/workflows/speclaw.yml` (dogfood).
