# Reports — add-test-suite-and-ci-gates

Evidence of what was tested for this change, one file per discipline. The
`build` step fills these in with the real commands run and their output,
following the required report structure (header · gates-and-results table ·
tests added · spec-scenario coverage · pre-existing failures · pending manual ·
verdict).

Expected for this change:

- `backend.md` — the test toolchain (`tsconfig.test.json` + `npm test`) and the
  unit / integration / contract results across all modules, plus the
  `npm run check` / `npm run build` / `npm test` gate output and proof the 80%
  coverage floor is enforced (a below-floor run fails).
- `e2e.md` — the end-to-end results driving the built CLI (`init`, `index`,
  `explore`, `doctor`, `lawbook`) in scratch repos, and the verification of the
  CI `test` job and the branch-protection apply script (dry-run, no settings
  mutated).

Both reports MUST include the spec-scenario coverage table mapping every
`#### Scenario` in `specs/quality-gates/spec.md` to how it was verified.
Disciplines not touched by this change (e.g. `frontend.md`) are omitted.
