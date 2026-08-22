# Tasks — add-context-budget

- [x] **Step 0: Create the feature branch (must be first).** `feat/context-budget`.

## Measurement core
- [x] Add `src/shared/tokens.ts` with `estimateTokens` (deterministic, monotone,
      offline) and document the ±8% estimator contract in TSDoc.
- [x] Add `src/shared/budget.ts` with `measureBudget()` covering surfaces A–D;
      tool cost MUST include serialised JSON Schema.
- [x] Add committed `token-budget.json` after the first post-rewrite measurement
      (ceilings for total, per surface, per-tool, dispatcher, map, minimal mode).
- [x] Add `scripts/budget-calibrate.mjs` (optional network; never wired into CI)
      and document it for contributors.

## Registration discipline
- [x] Add `defineTool()` to `src/shared/mcp.ts` (word cap + token cap; **no**
      `defer_loading`).
- [x] Migrate all four `register.ts` modules to `defineTool` and rewrite every
      tool description to ≤25 words; trim redundant Zod `.describe()` text.
- [x] Wire exposure profiles: `full` vs `minimal` omit-set; honor
      `Manifest.minimal` and `SPECLAW_MINIMAL=1` in `buildServer` / registration.

## CLI, doctor, init/update
- [x] Add `src/cli/commands/budget.ts` and dispatch `budget` from `src/cli/index.ts`
      (human table + `--json`; suppress header for `--json`).
- [x] Extend `doctor` with profile + always-on context cost (honest registered
      cost only).
- [x] Add `--minimal` to `init`/`update`; persist `minimal` on `Manifest`;
      `update` without the flag MUST preserve the manifest value.

## JIT skills + compact map
- [x] Restructure each lawbook skill under
      `src/modules/lawbook/assets/skills/*/`: dispatcher `SKILL.md` + `steps/*.md`
      with successor-only links; ensure `copy-assets.mjs` copies new step files.
- [x] Add map markers to `compass.template.md`; generate ≤300-token map in
      `compass_index`; preserve outside-marker edits; skip when markers missing
      or index absent.

## Docs & marketing line
- [x] README: publish budget vs actual next to Spec Kit 18.6k + issue link;
      document estimator honesty and calibration.
- [x] Update `docs/compass.md` / contributor notes as needed; note that
      path-scoped LAWS is out of scope and depends on hooks.

## Mandatory gates
- [x] Review and update the affected tests.
- [x] Add tests: `test/unit/tokens.test.ts`, `test/unit/budget.test.ts` (the
      gate), extend MCP contract tests for `defineTool` caps and description
      length, `test/unit/skill-steps.test.ts`, manifest minimal persistence,
      integration coverage for map markers and doctor/budget CLI.
- [x] Run the quality gates and verify they pass (see
      `docs/standards/testing-standards.md`): `npm run check`, `npm run build`,
      `npm test`.
- [x] Perform manual verification of the behavior — the agent executes this
      itself, never the user: run `speclaw budget` / `budget --json` on this
      repo, confirm `--minimal` omits the omit-set, confirm doctor shows mode
      and cost, confirm map markers regenerate.
- [x] Produce the discipline reports under `reports/` — one per discipline
      touched (`backend.md`, `api.md`, `performance.md`).
- [x] Update the technical documentation touched by the change.
- [x] Archive the change within the same PR (`lawbook:archive`).
