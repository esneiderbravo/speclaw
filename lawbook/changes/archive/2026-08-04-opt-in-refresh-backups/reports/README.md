# Reports — opt-in-refresh-backups

Evidence of what was tested, one file per discipline. `build` fills these in
following the required report structure (header · gates table · tests added ·
spec-scenario coverage · pre-existing failures · pending manual · verdict).

Expected for this change:

- `backend.md` — results for the `install.ts` backup gating, the `scaffold.ts`
  threading + `*.bak` gitignore, and the `update.ts` `--backup` flag and
  divergence messages. Coverage is the compile-time gates (`npm run check`,
  `npm run build`) plus an end-to-end `speclaw update` exercise on a scratch
  project: default refresh writes no `.bak` and reports the overwrite; `--backup`
  writes and reports a `.bak`; `.gitignore` ends up ignoring `*.bak`.

No frontend in this change — `frontend.md` omitted.
