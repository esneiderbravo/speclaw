# Backend checks — add-hybrid-retrieval (2026-08-25)

Date · Branch `feat/hybrid-retrieval` · Environment: local Node v24.17.0 · cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Format + lint | `npm run check` | ✅ Prettier clean · ESLint clean |
| Build | `npm run build` | ✅ `tsc` + copy-assets |
| Tests + coverage | `npm run test` | ✅ **421 pass** · lines ~84.6% · branches ~80.5% · functions ~84.3% |

## Tests added / updated

| Test | Asserts |
| --- | --- |
| `test/unit/rank.test.ts` | RRF, routeWeights, nameBoost, FTS escape, structural hops |
| `test/unit/pagerank.test.ts` | Convergence, focus personalization, meaningful idents |
| `test/unit/budget-fit.test.ts` | fitToBudget / TreeContext / defaultBudget |
| `test/unit/fts.test.ts` | BM25 ASC order, migrate9to10, schema 10 stamp |
| `test/integration/retrieval.test.ts` | ≥40 golden pairs, MRR@10 vs LIKE, docstring index, latency soft budget |
| `test/unit/metrics.test.ts` | SCHEMA_VERSION `"10"` |
| `test/unit/doctor-report.test.ts` | Frozen ids `env.fts5`, `env.embedder` |

## Spec-scenario coverage (code-graph hybrid requirements)

| Scenario | Verified by |
| --- | --- |
| Docstring text is searchable | retrieval + fts fixtures; manual `search "idempotent"` → `verifySessionToken` |
| Subtokens camelCase | covered via FTS subtokens + name list in hybrid (fixture names) |
| BM25 ordering not inverted | `test/unit/fts.test.ts` ORDER BY score ASC |
| Missing FTS5 degrades | soft path in `ensureFts` / `degraded: fts5-unavailable` (unit probe exists) |
| Fusion uses ranks only | `rank.test.ts` rrfFuse |
| Exact name boosted | `rank.test.ts` nameBoost |
| Query shape routes weights | `rank.test.ts` routeWeights |
| Focus changes ordering | `pagerank.test.ts` focus personalization |
| Focus defaults to worktree | `resolveFocus` + `worktreeChangedFiles` (manual: empty focus in smoke) |
| Empty focus global PR | hybrid empty-query / pagerank table path |
| Generic names penalized | `edgeWeightMul` defCount > 5 |
| Output respects budget | `budget-fit.test.ts` |
| Oversized truncated | `budget-fit.test.ts` |
| Golden MRR | `retrieval.test.ts` |
| Default install no downloads | LexicalEmbedder only; no new deps in package.json |
| Lexical remains default | doctor `env.embedder` = `lexical-hash-v1+in2` |
| Find always hybrid | `findSymbols` → `hybridSearch`; MCP `compass_find` |
| Schema 9→10 | `fts.test.ts` migrate9to10 |

## Pre-existing / unrelated failures

none

## Pending manual steps

none (archive + sync at PR time)

## Verdict

✅ Backend hybrid pipeline implemented and gated.
