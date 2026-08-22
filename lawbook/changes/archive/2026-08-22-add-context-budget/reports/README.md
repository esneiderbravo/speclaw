# Discipline reports — add-context-budget

`build` fills one report per discipline this change touches, following the
required structure (header · gates table · tests added · spec-scenario coverage ·
pre-existing failures · pending manual · verdict).

Expected reports:

- **backend.md** — `estimateTokens` / `measureBudget`, `defineTool` caps,
  exposure profiles + `Manifest.minimal`, JIT skill assets, compact map
  generation in the indexer, doctor context-cost section.
- **api.md** — required: public surfaces change — `speclaw budget` CLI contract
  (`--json` schema), MCP tool description/registration contract via
  `defineTool`, and the omit-set for minimal mode (which tools are absent).
- **performance.md** — context-budget is a performance/cost gate: the suite
  budget test result, per-surface measured numbers committed in
  `token-budget.json`, and confirmation the gate stays offline.
