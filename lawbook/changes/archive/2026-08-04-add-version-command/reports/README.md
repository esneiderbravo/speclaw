# Reports — add-version-command

Evidence of what was tested for this change, one file per discipline. The
`build` step fills these in with the real commands run and their output,
following the required report structure (header · gates-and-results table ·
tests added · spec-scenario coverage · pre-existing failures · pending manual ·
verdict).

Expected for this change:

- `e2e.md` — the end-to-end results driving the built CLI (`speclaw --version`,
  `-v`, `version`) in a scratch invocation: stdout equals the `package.json`
  version, exit code `0`, no `Unknown command`/HELP dump, and `help` lists
  `--version`. Includes the `npm run check` / `npm run build` / `npm test` gate
  output, and the agent-run manual verification of the built binary.

This report MUST include the spec-scenario coverage table mapping every
`#### Scenario` in `specs/cli/spec.md` to how it was verified. Disciplines not
touched by this change (`backend.md`, `frontend.md`) are omitted — the change is
confined to the CLI command surface and is verified end-to-end.
