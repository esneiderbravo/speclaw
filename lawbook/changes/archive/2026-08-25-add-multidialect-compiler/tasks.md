# Tasks — add-multidialect-compiler

- [x] Step 0: Create the feature branch `feat/multidialect-compiler` (must be first).
- [x] Extend `Law` with optional `status: "active" | "draft"` (default active); Zod + seed unchanged for existing entries.
- [x] `laws-parse.ts`: parse `docs/standards/*.md` into `Law[]` (stable ids, scope, prose, source line); reject duplicate ids loudly.
- [x] `compile-laws.ts`: merge seed + parsed + manifest; validate scopes via existing `globError`; produce compile report (`written` / `unchanged` / `failed`).
- [x] Dialects: Claude `paths:` + Cursor `globs:`/`alwaysApply` under `ai-specs/rules/`; ensure Claude rules symlink.
- [x] Dialects: AGENTS.md delimited degrade (scope→prose); nested AGENTS when prefix has ≥3 laws and package.json; CLAUDE.md delimited `@AGENTS.md` + appendix without duplicating scoped bodies.
- [x] Dialects: Copilot `.github/instructions/*.instructions.md` (`applyTo`); never emit the same scoped law to both Copilot instructions and AGENTS body.
- [x] Dialect: CodeRabbit `.coderabbit.yaml` merge of `path_instructions` with `[speclaw:law~…]` markers; preserve foreign keys; best-effort.
- [x] Wire compile into `init`/`update` after `ensureLawManifest`; CLI `speclaw laws compile` (+ optional setup action). No new MCP tools.
- [x] `speclaw laws import --from rulesync` → draft semantic laws; verify does not gate on `status: draft`.
- [x] Doctor: `alwaysOnTokens` estimate; warn naming top-3 empty-scope laws when >2000.
- [x] Review and update the affected tests.
- [x] Run the quality gates and verify they pass (see docs/standards/testing-standards.md).
- [x] Perform manual verification of the behavior — the agent executes this itself, never the user.
- [x] Produce the discipline reports under reports/ — one per discipline touched, from an open set (e.g. backend.md, frontend.md, api.md, database.md, infra.md, security.md; api.md is required whenever the change touches an API surface) — with the unit/integration/e2e results for what the feature touched.
- [x] Update the technical documentation touched by the change.
- [x] Archive the change within the same PR (lawbook:archive).
