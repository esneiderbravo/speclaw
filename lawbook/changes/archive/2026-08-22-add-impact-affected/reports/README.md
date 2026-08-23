# Reports — add-impact-affected

Discipline reports this change will produce during `build`:

- `backend.md` — CTE impact rewrite, affected-test selection, config load, indexer `is_test`/`module`
- `api.md` — MCP `compass_impact` reshape + `compass_affected_tests`; CLI `query impact` / `affected-tests`
- `database.md` — schema `"7"`, `files.is_test`, `files.module`, forced reindex

Required report structure (filled by `build`): header · gates table · tests
added · spec-scenario coverage · pre-existing failures · pending manual ·
verdict.
