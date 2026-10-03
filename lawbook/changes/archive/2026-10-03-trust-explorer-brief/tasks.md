# Tasks — trust-explorer-brief

- [x] Step 0: Create the feature branch (must be first).
- [x] Teach the explore summarize step to emit a complete brief.
- [x] Teach the cortex dispatch loop to paste that brief into the planner prompt.
- [x] Teach the draft understand step to reuse a complete brief and locate code only when the brief is absent or names a gap.
- [x] Tell the planner agent that a complete brief is not re-investigated.
- [x] Lock the wording with a unit test on the packaged assets.
- [x] Bump the package to 2.0.2 and note it in the changelog.
- [x] Review and update the affected tests.
- [x] Run the quality gates and verify they pass (see docs/standards/testing-standards.md).
- [x] Perform manual verification of the behavior — the tester role executes this itself, never the user.
- [x] Produce the discipline reports under reports/ — one per discipline touched, from an open set (e.g. backend.md, frontend.md, api.md, database.md, infra.md, security.md; api.md is required whenever the change touches an API surface) — with the unit/integration/e2e results for what the feature touched.
- [x] Update the technical documentation touched by the change.
- [x] Archive the change within the same PR (lawbook:archive) after harness review/test PASS.
