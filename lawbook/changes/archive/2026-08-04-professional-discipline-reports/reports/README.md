# Reports — professional-discipline-reports

Evidence of what was tested, one file per discipline. `build` fills these in
following the **required report structure** this change introduces (header ·
gates table · tests added · spec-scenario coverage · pre-existing failures ·
pending manual · verdict). This change should dogfood that structure.

Expected for this change:

- `backend.md` — results for the `build`/`draft` skill edits, the strengthened
  testing standard, the `0.1.13` migration prompt, and the version bump.
  Coverage is the compile-time gates (`npm run check`, `npm run build`) plus an
  end-to-end `speclaw update` exercise on a scratch project (managed skills
  refresh; `0.1.12 → 0.1.13` prints the standard prompt; shipped template and
  dogfood copy are byte-identical).

No frontend in this change — `frontend.md` omitted.
