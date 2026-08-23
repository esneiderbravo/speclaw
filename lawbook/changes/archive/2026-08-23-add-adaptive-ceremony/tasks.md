# Tasks — add-adaptive-ceremony

- [x] Step 0: Create the feature branch (must be first).
- [x] Lawbook: add `levels.ts` (signals, score, cuts, artifact matrix, `explain`); unit table of ≥20 signal combinations including `onlyDocs` and degraded paths.
- [x] Lawbook: `change.json` read/write (propose/set/promote); missing file ⇒ level 3; downgrade requires reason; promotions append-only.
- [x] Lawbook: make `specValidate` / `specArchivePreconditions` level-aware (level 0: `record.md` checklist + reports; no proposal/design/deltas/sync; level 3 = today's rules); reject archive when measured level ≥ recorded+2 without promote/justify.
- [x] Lawbook: scaffold helpers for `speclaw quick` / promote seeding from `record.md`; wire `lawbook_level` MCP; add to `MINIMAL_OMIT`.
- [x] Config: `ceremony:` block in `lawbook/config.yaml` (+ package template) with roadmap defaults; invalid cuts → defaults + doctor warning.
- [x] CLI: `speclaw quick <name>`; draft/list show level; suppress branded header on machine-oriented level/quick `--json` as needed; help text.
- [x] Skills/commands/rules: draft proposes+confirms level before scaffolding; quick skill; archive/validate copy mentions levels.
- [x] Laws: update `LAWS.md` and `docs/standards/lawbook.md` (and agent entry points if they restate the old "always four artifacts" rule).
- [x] Doctor: archived-change level distribution (+ ceremony config validity).
- [x] Update note: `speclaw update` migration bullet for 0.3.12; patch version bump.
- [x] Review and update the affected tests.
- [x] Run the quality gates and verify they pass (see docs/standards/testing-standards.md).
- [x] Perform manual verification of the behavior — the agent executes this itself, never the user.
- [x] Produce the discipline reports under reports/ — one per discipline touched, from an open set (e.g. backend.md, frontend.md, api.md, database.md, infra.md, security.md; api.md is required whenever the change touches an API surface) — with the unit/integration/e2e results for what the feature touched.
- [x] Update the technical documentation touched by the change.
- [x] Archive the change within the same PR (lawbook:archive).
