# Tasks — reconcile-specs-on-sync

- [x] **Step 0: Create the feature branch (must be first).** Branch
      `feat/reconcile-specs-on-sync` off `main`.

- [x] **Add the reconciliation phase to the `sync` skill.** In both
      `ai-specs/skills/sync/SKILL.md` and the template
      `src/modules/lawbook/assets/skills/sync/SKILL.md`, add a step before
      `lawbook_sync`: reconstruct what was built (branch diff since draft +
      `compass_explore`/`compass_impact`), diff against the delta specs, write
      built-but-unspecified behavior into the delta specs, then promote.

- [x] **Add the recommend-sync gate to the `archive` skill.** In both
      `ai-specs/skills/archive/SKILL.md` and the template
      `src/modules/lawbook/assets/skills/archive/SKILL.md`, add a review before
      archiving: on detected drift, recommend a sync (marked recommended) with
      short insights (what was built outside the contract + why), and archive
      only after reconciliation or explicit acceptance of the drift.

- [x] **Reinforce the `build` skill Step 5.** In both
      `ai-specs/skills/build/SKILL.md` and the template
      `src/modules/lawbook/assets/skills/build/SKILL.md`, note that
      reconciliation is formalized at `sync`.

- [x] **Update the lawbook standard.** In both `docs/standards/lawbook.md` and
      the template
      `src/modules/foundation/assets/docs/standards/lawbook.template.md`,
      describe reconciliation in "The loop" (sync) and "Archiving discipline".

- [x] **Point the commands at the new step.** Update
      `ai-specs/commands/lawbook/{sync,archive}.md` and templates
      `src/modules/lawbook/assets/commands/{sync,archive}.md` to mention the
      reconciliation review.

- [x] **Review and update the affected tests.** No unit-test runner exists;
      confirmed no fixtures/snapshots reference the changed skill text. The CLI
      help strings (`src/cli/index.ts:33-34`) describe the deterministic engine
      layer, which intentionally does not reconcile — left unchanged. The
      compile-time gates below are the applicable coverage.

- [ ] **Run the quality gates and verify they pass** (see
      `docs/standards/testing-standards.md`): `npm run check` (Prettier +
      ESLint) and `npm run build` (strict `tsc` + asset copy). Report real
      output.

- [x] **Perform manual verification of the behavior — the agent executes this
      itself.** Dogfood: ran the `sync` reconciliation on this change —
      reconstructed what was built (`git diff main...HEAD`) and compared it to
      the `lawbook-workflow` delta spec. The spec matches the implementation, so
      no reconciling edits were needed (the "no drift" path). The review also
      correctly separated this change's files from unrelated uncommitted
      Compass-first edits sitting in the working tree — demonstrating drift
      detection distinguishes what belongs to the capability.

- [x] **Update the technical documentation touched by the change.** Updated
      `docs/standards/lawbook.md` (+ foundation template) and the `README.md`
      workflow table. `AGENTS.md` references the workflow only at a high level
      ("follow the lawbook workflow") — no step detail to change.

- [x] **Archive the change within the same PR** (`lawbook:archive`).
