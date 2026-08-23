# Tasks — add-hotspots-coupling

- [x] Step 0: Create the feature branch (must be first). Ensure local `main` includes impact-affected (0.3.10 / schema 7) before branching.
- [x] Compass: bump `SCHEMA_VERSION` `"7"` → `"8"`; add `node_metrics`; recreate derived schema on mismatch; force reindex marker.
- [x] Compass: language nesting/branching sets in `languages.ts`; compute metrics in `extract.ts`; persist from `indexer.ts`.
- [x] Git-history: richer file activity (commits/lines/authors) without breaking existing `churn` commit-count callers; co-change `maxFilesPerCommit` + Jaccard strength helpers; keep fail-soft + shallow marker; extend HEAD cache payloads.
- [x] Compass: implement `hotspots.ts` (`hotspots` + `coupling`) joining activity × `node_metrics`, default window 90d, diagnostics, honest warnings.
- [x] MCP + exposure: register `compass_hotspots` and `compass_coupling` (≤25-word honest descriptions); add both to `MINIMAL_OMIT`.
- [x] CLI: `speclaw hotspots` / `speclaw coupling <file>` (+ `--json` / window / sortBy); suppress branded header; update help.
- [x] Dogfood: reindex this repo; run hotspots and coupling on a real hub file; confirm shallow/giant-commit diagnostics paths in fixtures.
- [x] Bump package patch version; `speclaw update` migration note for schema 8 + new surfaces; refresh README / compass docs.
- [x] Review and update the affected tests.
- [x] Run the quality gates and verify they pass (see docs/standards/testing-standards.md).
- [x] Perform manual verification of the behavior — the agent executes this itself, never the user.
- [x] Produce the discipline reports under reports/ — one per discipline touched, from an open set (e.g. backend.md, frontend.md, api.md, database.md, infra.md, security.md; api.md is required whenever the change touches an API surface) — with the unit/integration/e2e results for what the feature touched.
- [x] Update the technical documentation touched by the change.
- [x] Archive the change within the same PR (lawbook:archive).
