# Reports — gate-real-data-writes

Evidence of what was tested, one file per discipline. `build` fills these in
following the required report structure (header · gates table · tests added ·
spec-scenario coverage · pre-existing failures · pending manual · verdict) —
and, per this very change, records how verification stayed isolated from any
real data store.

Expected for this change:

- `backend.md` — results for the `build` skill Step 4 edit, the testing/base
  standards and `CLAUDE.md`/`AGENTS.md` Rule 6 edits, the `0.1.14` migration
  prompt, and the version bump. Coverage is the compile-time gates
  (`npm run check`, `npm run build`) plus an end-to-end `speclaw update` exercise
  on a scratch project (managed `build` skill refreshes; `0.1.13 → 0.1.14` prints
  the prompt; shipped templates byte-identical to dogfood copies). No real data
  store is touched — the exercise runs only on throwaway scratch projects.

No frontend in this change — `frontend.md` omitted.
