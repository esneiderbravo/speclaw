# Tasks — add-bugfix-specs

- [x] Step 0: Create the feature branch (must be first).
- [x] Lawbook: add `stack-parse.ts` (V8 anonymous/class, Python order, node_modules external, dist→src map); unit fixtures from real traces.
- [x] Lawbook: add `investigate.ts` (score pipeline, degrade flags, archive recurrence scan, guidance); wire `lawbook_investigate` MCP; add to `MINIMAL_OMIT`.
- [x] Lawbook: add `bugfix.ts` (scaffold `bugfix.md`, section validators, optional pre-seed from investigate); extend `levels.ts` with `changeType` and bug artifact matrix.
- [x] Lawbook: extend `engine.ts` — `specValidate` / `specArchivePreconditions` for `changeType: "bug"` (repro, regression/instrumentation, prevention, resolution, missing-delta when prevention requires it).
- [x] CLI: `speclaw lawbook draft --bug <name>`; `speclaw lawbook investigate` (mirror MCP args, `--json`); suppress header on machine output.
- [x] Skills/commands/rules: new `investigate` command + skill (§3.4 script); draft skill `--bug` branch; spec-reports discipline for failing-test-before-fix evidence.
- [x] Doctor: archived change feature vs bug distribution (informational).
- [x] Laws/docs: update `LAWS.md` and `docs/standards/lawbook.md` for bug change type; README competitive table (§2 roadmap).
- [x] Update note: `speclaw update` migration bullet for 0.3.13; patch version bump.
- [x] Review and update the affected tests.
- [x] Run the quality gates and verify they pass (see docs/standards/testing-standards.md).
- [x] Perform manual verification of the behavior — the agent executes this itself, never the user.
- [x] Produce the discipline reports under reports/ — one per discipline touched, from an open set (e.g. backend.md, frontend.md, api.md, database.md, infra.md, security.md; api.md is required whenever the change touches an API surface) — with the unit/integration/e2e results for what the feature touched.
- [x] Update the technical documentation touched by the change.
- [x] Archive the change within the same PR (lawbook:archive).
