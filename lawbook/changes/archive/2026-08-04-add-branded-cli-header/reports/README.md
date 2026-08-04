# Reports — add-branded-cli-header

Evidence of what was tested for this change, one file per discipline. The
`build` step fills these in with the real commands run and their output,
following the required report structure (header · gates-and-results table ·
tests added · spec-scenario coverage · pre-existing failures · pending manual ·
verdict).

Expected for this change:

- `e2e.md` — the end-to-end results driving the built CLI: `help` shows the
  branded header ahead of the usage text under a forced TTY; `--version` stdout
  stays the bare `package.json` version with no header; a Compass query
  command's stdout carries no header; piped (non-TTY) output omits the header.
  Includes the `npm run check` / `npm run build` / `npm test` gate output, the
  agent-run manual verification of the built binary, and the isolated glyph
  demo (unicode vs. ASCII fallback by platform/env).

This report MUST include the spec-scenario coverage table mapping every
`#### Scenario` in `specs/cli/spec.md` to how it was verified. Disciplines not
touched by this change (`backend.md`, `frontend.md`) are omitted — the change is
confined to the CLI command surface (`src/cli/lib/ui.ts`, `src/cli/index.ts`)
and is verified end-to-end.
