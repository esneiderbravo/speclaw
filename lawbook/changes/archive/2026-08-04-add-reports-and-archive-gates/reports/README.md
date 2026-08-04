# Reports — add-reports-and-archive-gates

Evidence of what was tested for this change, one file per discipline. The
`build` step fills these in with the real commands run and their output.

Expected for this change:

- `backend.md` — results for the engine gate (`specArchivePreconditions` +
  `specArchive`): unit coverage if a runner is wired, plus the CLI / MCP manual
  verification of each block condition and the clean-archive path, and the
  `npm run check` / `npm run build` gate output.

Disciplines not touched by this change (e.g. `frontend.md`) are omitted — the
gate requires the folder to be non-empty and relevant reports present, not a
fixed list.
