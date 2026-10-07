# Reports — fix-compass-query-output

Bug reports MUST include the regression test **failing before the fix**
(`reports/.red-before-fix.txt`, copied into each report that owns a test).

Expected discipline reports (each follows the required structure: header,
gates-and-results table, tests added/updated, spec-scenario coverage table,
pre-existing failures, pending manual steps, verdict):

- `api.md` — **required**: the MCP tool contract changes. `compass_find` (and
  the `compass_search`/`compass_recall` aliases) response shape and token cap;
  `compass_explore` callers `via` and `mode: "full"` ceiling;
  `compass_diff_context` `mode: "full"` ceiling; `cortex` `advance` with
  `pauseForQuestions` outside `planning` (error, no write); `lawbook_change`
  `draft` (bug, no level) and `level` `set`/`promote` stored proposal. Exercised
  through the contract stub and a stdio MCP session against a `mkdtemp` fixture.
- `backend.md` — extraction/resolution of `ref` edges, focus filtering, exact
  mode, harness and ceremony logic; unit and integration results.
- `database.md` — Compass index schema 11 → 12 (and 10 → 12) migration,
  rollback, embedding-cache reuse, edge counts before/after a reindex.
- `cli.md` — `speclaw explore` callers `via`; `speclaw cortex advance
  --pause-questions` exit code outside `planning`; `speclaw lawbook draft --bug`
  output; `speclaw search|recall --json` unchanged.
