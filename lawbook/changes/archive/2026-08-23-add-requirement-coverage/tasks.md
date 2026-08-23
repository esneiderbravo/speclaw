# Tasks — add-requirement-coverage

- [x] Step 0: Create the feature branch (must be first).
- [x] Add Compass `coverage_links` table + `SCHEMA_VERSION` `"5"`; extend `extract` walk to capture comment nodes and `Covers:` / `@covers` directives with symbol attribution.
- [x] Implement lawbook `spec-items` parser (IDs, Status/Needs/Tags/Depends/Covers, inline `[@test]`).
- [x] Implement `coverageReport` (link statuses, shallow/deep, direct/transitive defects) + TAP/table/JSON renderers.
- [x] Wire CLI `speclaw coverage` and MCP `lawbook_coverage` (defect-first, ≤600 tokens); keep `speclaw trace` / `compass_trace` unchanged.
- [x] Extend `specArchivePreconditions` with the opt-in direct-defect coverage gate.
- [x] Implement `speclaw coverage --adopt` (dry-run default, `--write` + ownership backup, no invented `Needs:`).
- [x] Dogfood: adopt IDs + real `Covers:` for one canonical capability so `speclaw coverage` is green on it.
- [x] Bump package to 0.3.8; add update migration note; refresh README / docs/compass as needed.
- [x] Review and update the affected tests.
- [x] Run the quality gates and verify they pass (see docs/standards/testing-standards.md).
- [x] Perform manual verification of the behavior — the agent executes this itself, never the user.
- [x] Produce the discipline reports under reports/ — one per discipline touched, from an open set (e.g. backend.md, frontend.md, api.md, database.md, infra.md, security.md; api.md is required whenever the change touches an API surface) — with the unit/integration/e2e results for what the feature touched.
- [x] Update the technical documentation touched by the change.
- [x] Archive the change within the same PR (lawbook:archive).
