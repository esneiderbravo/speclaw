# Tasks — professional discipline reports

- [x] **Step 0: Create the feature branch (must be first).**
      `feat/professional-discipline-reports` off `main`.

- [x] **1. Rewrite Step 5 of the `build` skill with the required skeleton.**
      Edit `src/modules/lawbook/assets/skills/build/SKILL.md` and mirror the
      exact change into `ai-specs/skills/build/SKILL.md` (keep them identical).
      Prescribe: header (date · branch · env/cwd), `Check | Command | Result`
      table with exact counts, tests-added section, spec-scenario coverage
      table, pre-existing-failures honesty rule, pending-manual section, verdict.
      Preserve the "test kind does not yet apply" escape hatch.

- [x] **2. Point the `draft` skill's `reports/README.md` guidance at the skeleton.**
      Edit `src/modules/lawbook/assets/skills/draft/SKILL.md` and mirror into
      `ai-specs/skills/draft/SKILL.md`. The scaffolded README should name the
      expected discipline reports and reference the required structure.

- [x] **3. Strengthen the Reports section of the testing standard.**
      Edit `src/modules/foundation/assets/docs/standards/testing-standards.template.md`
      and mirror the same normative change into `docs/standards/testing-standards.md`.
      Make the required structure and honesty rules law (short form).

- [x] **4. Add the `0.1.13` migration prompt for the personalized standard.**
      In `src/cli/commands/update.ts`, add a `MIGRATIONS` entry at `0.1.13` whose
      `agentPrompt` tells the user's agent to apply the strengthened Reports
      section to `docs/standards/testing-standards.md`, preserving project
      wording. Bump `package.json` to `0.1.13`.

- [x] **5. Review and update the affected tests.**
      No unit runner exists yet (see testing standard). Confirm no `node:test`
      coverage governs the skill/standard text; if a report-related test exists,
      update it. Record the decision in the report.

- [x] **6. Run the quality gates and verify they pass.**
      `npm run check` (Prettier + ESLint) and `npm run build` (strict `tsc` +
      copy-assets). Both must be green (see docs/standards/testing-standards.md).

- [x] **7. Perform manual verification — the agent executes this itself.**
      Build, then on a scratch project confirm `speclaw update` refreshes the
      managed `build`/`draft` skills to the new text, and that a project on
      `0.1.12` receives the `0.1.13` personalized-standard prompt. Confirm the
      shipped template and dogfood copy are byte-identical (`diff`).

- [x] **8. Produce the discipline reports under `reports/`.**
      Write `reports/backend.md` following the very skeleton this change
      introduces (dogfood it), including the spec-scenario coverage table for
      this change's scenarios.

- [x] **9. Update the technical documentation touched by the change.**
      Ensure `README.md` / any docs that describe the reports workflow match the
      new structure. Update `docs/standards/testing-standards.md` (task 3 covers
      the normative text; verify cross-references).

- [x] **10. Archive the change within the same PR (`lawbook:archive`).**
      Run `sync` then `archive` after gates are green and reports are present.
