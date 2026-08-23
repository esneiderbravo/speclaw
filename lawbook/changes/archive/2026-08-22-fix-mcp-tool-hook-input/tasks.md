# Tasks — fix-mcp-tool-hook-input

- [x] Step 0: Create the feature branch (must be first).
- [x] Emit `input` on `SPECLAW_HOOK` / `SpeclawHook` and update unit + integration tests.
- [x] Assert `speclaw update` / scaffold refresh rewrites hooks that lacked `input`.
- [x] Bump package to 0.3.7; add update migration + CHANGELOG.
- [x] Review and update the affected tests.
- [x] Run the quality gates and verify they pass (see docs/standards/testing-standards.md).
- [x] Perform manual verification of the behavior — the agent executes this itself, never the user.
- [x] Produce the discipline reports under reports/ — one per discipline touched, from an open set (e.g. backend.md, frontend.md, api.md, database.md, infra.md, security.md; api.md is required whenever the change touches an API surface) — with the unit/integration/e2e results for what the feature touched.
- [x] Update the technical documentation touched by the change.
- [x] Archive the change within the same PR (lawbook:archive).
