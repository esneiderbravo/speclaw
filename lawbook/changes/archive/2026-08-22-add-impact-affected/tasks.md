# Tasks — add-impact-affected

- [x] Step 0: Create the feature branch (must be first).
- [x] Compass: bump `SCHEMA_VERSION` `"6"` → `"7"`; add `files.is_test` and `files.module`; recreate derived schema on mismatch; force reindex marker.
- [x] Compass: populate `is_test` / `module` at index time from embedded (and optional `.speclaw/affected.json`) test globs / path heuristics.
- [x] Compass: rewrite `impact()` as id-first recursive CTE (`call`+`import` by default; `exact`/`by-name`; hard limit + `truncated`); add `impactGrouped` default shape and `format: "flat"` escape hatch.
- [x] Compass: implement `affected-config.ts` (defaults + load/validate `.speclaw/affected.json`) and `affected.ts` (static selection, global → `mode: "all"`, command from `package.json#scripts.test` or `node --test`).
- [x] MCP: reshape `compass_impact` (grouped default; document breaking change); register `compass_affected_tests`.
- [x] CLI: wire `speclaw query impact` human/JSON to the new shape; add `speclaw query affected-tests` (+ `--from-diff` via `changedFiles`); suppress branded header; update help.
- [x] Dogfood: reindex this repo; run `impact` on a hub symbol and a name-collision fixture; run `affected-tests --from-diff`; exercise a global-file case.
- [x] Bump package patch version; add `speclaw update` migration note for schema 7 + impact/affected surfaces; refresh README / compass docs as needed.
- [x] Review and update the affected tests.
- [x] Run the quality gates and verify they pass (see docs/standards/testing-standards.md).
- [x] Perform manual verification of the behavior — the agent executes this itself, never the user.
- [x] Produce the discipline reports under reports/ — one per discipline touched, from an open set (e.g. backend.md, frontend.md, api.md, database.md, infra.md, security.md; api.md is required whenever the change touches an API surface) — with the unit/integration/e2e results for what the feature touched.
- [x] Update the technical documentation touched by the change.
- [x] Archive the change within the same PR (lawbook:archive).
