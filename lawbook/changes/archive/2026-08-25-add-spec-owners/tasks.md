# Tasks — add-spec-owners

- [x] Step 0: Create the feature branch `feat/spec-owners` (must be first).
- [x] Add `src/modules/team/owners.ts`: parse `team.owners` from `lawbook/config.yaml`, render the marked block, merge non-destructively at the **end** of `.github/CODEOWNERS`, validate owner token syntax (`@user`, `@org/team`, email).
- [x] Add CLI `speclaw owners --write` (and a check/diff mode that does not write); help lists `owners`; **no new MCP tool**.
- [x] Wire doctor: error if content after `# <<< speclaw:owners`; warn on invalid owner syntax; warn that CODEOWNERS without *Require review from Code Owners* is decorative; skip when `team.owners` absent.
- [x] Init/update refresh the managed block when `team.owners` is present; migration note for this release; dogfood speclaw's `config.yaml` + CODEOWNERS.
- [x] Unit + integration tests for merge-at-end, preserve-outside-markers, syntax validation, absent-config no-op; assert MCP catalog does not gain an owners tool.
- [x] Review and update the affected tests.
- [x] Run the quality gates and verify they pass (see docs/standards/testing-standards.md).
- [x] Perform manual verification of the behavior — the agent executes this itself, never the user.
- [x] Produce the discipline reports under reports/ — one per discipline touched, from an open set (e.g. backend.md, frontend.md, api.md, database.md, infra.md, security.md; api.md is required whenever the change touches an API surface) — with the unit/integration/e2e results for what the feature touched.
- [x] Update the technical documentation touched by the change.
- [x] Archive the change within the same PR (lawbook:archive).
