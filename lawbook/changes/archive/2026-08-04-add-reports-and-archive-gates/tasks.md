# Tasks — add-reports-and-archive-gates

- [x] **Step 0: Create the feature branch (must be first).** Branch
      `feat/add-reports-and-archive-gates` off `feat/reconcile-specs-on-sync`
      (this change stacks on that one — it edits the same archive/build/sync
      skills and the lawbook standard).

- [x] **Engine: add the archive gate.** In `src/modules/lawbook/engine.ts`, add
      `specArchivePreconditions(projectPath, change)` returning the blockers —
      (1) any unchecked `- [ ]` in `tasks.md`, (2) missing/empty `reports/`
      (README.md scaffold aside), (3) any delta spec not byte-identical to its
      canonical counterpart — and call it from `specArchive` so it refuses
      (with reasons) when non-empty. Reuses `deltaSpecFiles`/`specRoot`.

- [x] **Mandatory steps: add the reports step.** Added "Produce the discipline
      reports under `reports/`" to `lawbook/config.yaml`, to its generator
      (`CONFIG_YAML` in engine.ts), and to the `spec-tasks-mandatory-steps` rule
      (template + `ai-specs/` copy).

- [x] **`draft` skill: scaffold `reports/`.** Added the `reports/` artifact (with
      a `reports/README.md`) to `ai-specs/skills/draft/SKILL.md` and its template.

- [x] **`build` skill: populate the reports.** Added Step 5 "Write the discipline
      reports" to `ai-specs/skills/build/SKILL.md` and its template.

- [x] **`archive` skill: describe the hard gate.** Rewrote the archive skill
      (both copies) around the engine gate and the reconcile → sync → archive
      order.

- [x] **Docs.** Updated `docs/standards/lawbook.md` (+ foundation template),
      `docs/standards/testing-standards.md` (reports section), and the
      `README.md` workflow section.

- [x] **Produce the discipline reports under `reports/` (this change).** Wrote
      `reports/backend.md` with the gate results and commands run. (New mandatory
      step, dogfooded on this change.)

- [x] **Review and update the affected tests.** No `node:test` runner is wired in
      speclaw yet; per `docs/standards/testing-standards.md` the behavior is
      covered by the compile-time gates plus an executable end-to-end exercise of
      the built engine (recorded in `reports/backend.md`). Wiring `node:test` + a
      `test` script is deferred to its own change.

- [x] **Run the quality gates and verify they pass.** `npm run check` → pass;
      `npm run build` → pass. Real output in `reports/backend.md`.

- [x] **Perform manual verification of the behavior — the agent executes this
      itself.** Drove `specArchivePreconditions`/`specArchive` against a scratch
      workspace: unchecked task, missing reports (README-only too), and unsynced
      specs each refused with their reason; archive threw while blocked; a clean
      change archived. Recorded in `reports/backend.md`.

- [x] **Update the technical documentation touched by the change.** Lawbook
      standard, testing standard, and README describe reports + the archive gate
      consistently.

- [x] **Archive the change within the same PR** (`lawbook:archive`).
