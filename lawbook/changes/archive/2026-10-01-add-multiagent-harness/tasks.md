# Tasks: add-multiagent-harness

- [x] Step 0: Create the feature branch (must be first).
- [x] Add harness state machine (`status`/`start`/`advance`/`rework`) and wire lawbook alias + CLI.
- [x] Gate `specArchivePreconditions` on review/test PASS from `harness.json` (level 0: test only).
- [x] Add role agent templates under `src/modules/lawbook/assets/agents/`; install via `installWorkflow`.
- [x] Split `build` so implementer stops after implementation; hand off to review/test via harness.
- [x] Delete domain pack agents; empty `packs.json`; skip pack prompt when empty; migrate old `agents` pack on update.
- [x] Add `agents` to Cursor/Codex/Windsurf `linkTargets`.
- [x] Scope expansion: move harness to `src/modules/cortex/`; add `brief.ts` + `register.ts` (`cortex` MCP); wire `buildServer` + CLI `speclaw cortex`; catalog MAX=9.
- [x] Rename orchestrate → cortex skill/command (assets + dogfood `ai-specs/`); brand Cortex in docs/templates/agents.
- [x] Update proposal/design/delta specs for Cortex module + MCP/CLI requirements.
- [x] Review and update the affected tests (harness imports, scaffold paths, registers, mcp-surface).
- [x] Rework (review FAIL): add `cortex` row to `docs/compass.md` nine-tool table; confirm no other live nine-without-cortex listing.
- [x] Run the quality gates and verify they pass (see docs/standards/testing-standards.md). — **tester**
- [x] Perform manual verification of the behavior — the tester role executes this itself, never the user.
- [x] Produce the discipline reports under reports/ — one per discipline touched — **tester**
- [x] Update the technical documentation touched by the change. — finalize with tester if needed
- [x] Archive the change within the same PR (lawbook:archive). — **archiver**
