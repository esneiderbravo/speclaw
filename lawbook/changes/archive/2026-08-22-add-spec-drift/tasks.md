# Tasks — add-spec-drift

- [x] Step 0: Create the feature branch (must be first).
- [x] Compass: add `hash.ts` (raw + structural normalizer + `NORMALIZER_VERSION`); extend indexer walk to populate `body_hash` / `norm_hash` on definition nodes.
- [x] Compass: bump `SCHEMA_VERSION` `"5"` → `"6"`; add `spec_anchors` projection table; recreate derived schema on mismatch; rehydrate from `lawbook/anchors/*.json`; set needs-reindex when hashes are missing.
- [x] Lawbook: implement `anchors.ts` (extract/resolve with covers-link → backtick → path → casing priority; read/write committed JSON).
- [x] Lawbook: implement `drift.ts` (classify, reverse, report, `--fail-on` exit codes, `--reseal`, `--json` / agent-bounded render).
- [x] Lawbook: seal anchors inside `specArchive`; wire MCP `lawbook_drift`; extend archive result with seal summary.
- [x] CLI: add `speclaw drift` command and help; suppress branded header for `--json` / non-TTY.
- [x] Foundation: doctor drift summary check; `verify --ci` emits semantic/deleted drift into SARIF/report when anchors exist.
- [x] Extend `git-history` only if needed for batch path logs / commit subject for explain output (fail-soft).
- [x] Dogfood: `speclaw drift --reseal` for this repo's capabilities; commit `lawbook/anchors/*.json`; keep `speclaw drift` green.
- [x] Bump package patch version; add `speclaw update` migration note for schema 6 + drift surfaces; refresh README / compass docs as needed.
- [x] Review and update the affected tests.
- [x] Run the quality gates and verify they pass (see docs/standards/testing-standards.md).
- [x] Perform manual verification of the behavior — the agent executes this itself, never the user.
- [x] Produce the discipline reports under reports/ — one per discipline touched, from an open set (e.g. backend.md, frontend.md, api.md, database.md, infra.md, security.md; api.md is required whenever the change touches an API surface) — with the unit/integration/e2e results for what the feature touched.
- [x] Update the technical documentation touched by the change.
- [x] Archive the change within the same PR (lawbook:archive).
