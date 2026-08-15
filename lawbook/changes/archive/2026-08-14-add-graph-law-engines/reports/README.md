# Discipline reports — add-graph-law-engines

`build` fills these in, one per discipline this change touches, each following the
required report structure (header · gates table · tests added · spec-scenario
coverage · pre-existing failures · pending manual · verdict).

- **backend.md** — the model extension (`laws.ts`), the two engines (`deps.ts`,
  `graph.ts`), the batch verifier (`verify.ts`), the `doctor` additions, and the
  `speclaw laws verify` CLI twin; unit + integration results for what they touch.
- **api.md** — required: this change adds the `law_verify` MCP tool (an API
  surface). Covers its input schema, the `VerifyReport` contract, and the
  registry contract test.
