# Reports — reuse-canonical-capabilities

Discipline reports for this change. `build` fills these with real results before
the change can be archived (the scaffold alone does not satisfy the archive gate).

Expected report:

- **backend.md** — the engine, CLI, and register changes (validate warnings,
  sync/archive created-vs-updated), plus the skill-asset edits. Records the gates
  run (`npm run check`, `npm run build`), the `node:test` unit tests added for
  `specValidate` warnings and `specSync` status, and the manual verification of
  the warnings and promotion report in an isolated temp workspace.

Each report follows the required structure: header · gates-and-results table ·
tests added · spec-scenario coverage table · pre-existing failures · pending
manual · verdict (see the `build` skill, Step 5).

No frontend surface is touched, so no `frontend.md` is expected.
