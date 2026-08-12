# Discipline reports — add-git-history-layer

`build` fills one report per discipline this change touches, each following the
required structure (header · gates table · tests added · spec-scenario coverage ·
pre-existing failures · pending manual · verdict).

This change is backend-and-persistence only — no API surface, no frontend, no
new MCP tool or CLI command — so it needs:

- **`backend.md`** — the pure engine `src/shared/git-history.ts` (log / churn /
  co-change / last-touch / shallow) and the compass caching wrapper
  `src/modules/compass/git-history-cache.ts`.
- **`database.md`** — the `git_history_cache` table added to
  `src/modules/compass/db.ts`, the `SCHEMA_VERSION` bump, and the drop-on-reset
  behavior.

No `api.md`: this layer adds no API surface (no MCP tool, no CLI command). If
that changes during `build`, add `api.md`.
