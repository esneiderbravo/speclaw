# Reports — update-refreshes-managed-files

Evidence of what was tested, one file per discipline. `build` fills these in.

Expected for this change:

- `backend.md` — results for the ownership split, the overwrite-with-baseline
  copy (silent refresh vs `.bak` on local edit), the personalized-file agent
  prompt, and the agent-generic handoff wording. Unit coverage if a `node:test`
  runner is wired; otherwise the compile-time gates plus an executable
  end-to-end exercise on a scratch project.

No frontend in this change — `frontend.md` omitted.
