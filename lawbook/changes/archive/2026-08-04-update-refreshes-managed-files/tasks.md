# Tasks — update-refreshes-managed-files

- [x] **Step 0: Create the feature branch (must be first).** Branch
      `feat/update-refreshes-managed-files` off `main`.

- [x] **Define file ownership.** Added `src/modules/foundation/ownership.ts` with
      `MANAGED_TREES`, `PERSONALIZED`, and `isManaged`.

- [x] **Manifest baselines.** Extended `Manifest` with `baselines` and updated
      read/write to preserve and merge them.

- [x] **Overwrite-with-baseline copy.** `copyRendered` gained a `CopyOpts` mode:
      writes if missing; overwrites silently when the current content matches the
      baseline; backs up to `<file>.bak` + overwrites + reports when it diverged.
      Added `sha256` and a `backedUp` report field.

- [x] **Record baselines at scaffold.** `scaffold` passes a managed `CopyOpts`
      (overwrite gated by `refreshManaged`) to `installWorkflow`/`installPack`,
      records baselines, and writes them to the manifest. Foundation stays additive.

- [x] **Update refreshes managed + prompts personalized.** `applyProjectMigrations`
      calls `scaffold(..., { refreshManaged: true })`, reports refreshed + backed-up
      files, and prints an agent-generic prompt built from `MIGRATIONS[].agentPrompt`
      for crossed versions. Added the 0.1.11 entry (Compass-first rule + reports step).

- [x] **Agent-generic language.** `init` handoff now says "the agent you're using";
      the update prompt uses the same phrasing.

- [x] **Docs.** Rewrote the README "Staying up to date" section around the
      managed/personalized split.

- [x] **Produce the discipline reports under `reports/`.** Wrote `reports/backend.md`
      with the end-to-end results.

- [x] **Review and update the affected tests.** No `node:test` runner is wired yet
      (per the testing standard); behavior is covered by the compile-time gates plus
      an end-to-end CLI exercise on a scratch project (recorded in the report).
      Wiring `node:test` is deferred to its own change.

- [x] **Run the quality gates and verify they pass.** `npm run check` → pass;
      `npm run build` → pass. Output in `reports/backend.md`.

- [x] **Perform manual verification of the behavior — the agent executes this
      itself.** Ran init → local edit → downgrade manifest → `update --migrate-only`
      on a scratch project: managed refresh, `.bak` on the edited file, no spurious
      `.bak` on untouched ones, personalized `CLAUDE.md` untouched, agent-generic
      prompt printed. All assertions passed (see report).

- [x] **Update the technical documentation touched by the change.** README update
      section rewritten; behavior documented.

- [x] **Archive the change within the same PR** (`lawbook:archive`).
