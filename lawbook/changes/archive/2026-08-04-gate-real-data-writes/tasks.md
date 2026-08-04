# Tasks — gate real-data writes during verification

- [x] **Step 0: Create the feature branch (must be first).**
      `feat/gate-real-data-writes` off `main`.

- [x] **1. Add the data-safety gate to the `build` skill, Step 4.**
      Edit `src/modules/lawbook/assets/skills/build/SKILL.md` and mirror the
      exact change into `ai-specs/skills/build/SKILL.md` (keep identical). Step 4
      must state: verification is isolated by construction (temp copy /
      `:memory:` / dedicated test store / rolled-back transaction); it MUST NOT
      create/update/delete real user data or run raw store commands against a
      live store; any real-store write requires stopping and asking first with
      exactly what/where, and a backup is not a substitute for authorization; the
      report records how verification stayed isolated.

- [x] **2. State the rule in the testing standard (manual/e2e section).**
      Edit `src/modules/foundation/assets/docs/standards/testing-standards.template.md`
      and mirror into `docs/standards/testing-standards.md`. Add the isolation
      default + the real-store-write authorization gate to the
      "Manual & end-to-end verification" section.

- [x] **3. Elevate it to a stop condition in base-standards.**
      Edit `src/modules/foundation/assets/docs/standards/base-standards.template.md`
      and mirror into `docs/standards/base-standards.md`: extend the
      "ask before irreversible or outward-facing actions" bullet to name
      "writing to a real data store (DB rows or files holding real user data),
      including for tests".

- [x] **4. Add it to Rule 6 in `CLAUDE.md` and `AGENTS.md`.**
      Edit `src/modules/foundation/assets/CLAUDE.template.md` (Rule 6 stop
      conditions) and `…/AGENTS.template.md` (the "ask before irreversible…"
      item), and mirror into the repo's own `CLAUDE.md` and `AGENTS.md`. Add
      "writing to a real data store (for tests or otherwise)" to the destructive-
      operations list.

- [x] **5. Add the `0.1.14` migration prompt for the personalized files.**
      In `src/cli/commands/update.ts`, add a `MIGRATIONS` entry at `0.1.14` whose
      `agentPrompt` tells the user's agent to add the real-data-write stop
      condition to `CLAUDE.md`, `AGENTS.md`, `docs/standards/base-standards.md`,
      and the testing standard's manual section, preserving project wording. Bump
      `package.json` to `0.1.14`.

- [x] **6. Review and update the affected tests.**
      No unit runner exists yet (see testing standard). Confirm no `node:test`
      coverage governs the standards/skill text; record the decision in the
      report.

- [x] **7. Run the quality gates and verify they pass.**
      `npm run check` (Prettier + ESLint) and `npm run build` (strict `tsc` +
      copy-assets). Both green.

- [x] **8. Perform manual verification — the agent executes this itself.**
      Build, then on a scratch project confirm `speclaw update` refreshes the
      managed `build` skill to the new Step 4, and that a project on `0.1.13`
      receives the `0.1.14` personalized-files prompt. Confirm shipped templates
      and their dogfood copies are byte-identical (`diff`). This verification
      touches only scratch projects — no real data store.

- [x] **9. Produce the discipline reports under `reports/`.**
      Write `reports/backend.md` following the required report structure,
      including the spec-scenario coverage table for this change's scenarios and
      how verification stayed isolated.

- [x] **10. Update the technical documentation touched by the change.**
      Verify `README.md` / any docs describing verification match the new rule;
      cross-references consistent.

- [x] **11. Archive the change within the same PR (`lawbook:archive`).**
      Run `sync` then `archive` after gates are green and reports are present.
