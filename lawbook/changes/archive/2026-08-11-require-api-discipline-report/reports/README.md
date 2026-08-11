# Reports — require-api-discipline-report

`build` fills this folder with the discipline report(s) for this change,
following the required structure (header · gates-and-results table · tests
added/updated · spec-scenario coverage table · pre-existing/unrelated failures ·
pending manual steps · one-line verdict — see the `build` skill, Step 5, and
`docs/standards/testing-standards.md`).

This change edits the library's documentation, rule, skill, and config **assets**
and their TypeScript build — it does not touch a runtime backend, frontend, or
API surface. Expected report:

- **`docs.md`** — the compile-time gates (`npm run check`, `npm run build`) with
  real output, the manual asset-propagation check (new rule + updated
  skill/standard/config land in `dist/` and in a scaffolded project's
  `ai-specs/rules/`), the spec-scenario coverage table, and the verdict. It
  states which runtime test kinds (backend/frontend/api) do not apply to a
  docs/asset change, in place of that evidence.

Archive is blocked until at least one discipline report (not just this README)
exists here.
