# API checks — add-hybrid-retrieval (2026-08-25)

Date · Branch `feat/hybrid-retrieval` · Environment: local Node v24.17.0 · cwd throwaway `/tmp/hybrid-smoke` + repo

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| MCP surface | `npm run test` (mcp-surface, mcp-budget, tool-surface) | ✅ 8 canonical tools; `compass_find` ≤25 words |
| CLI hybrid search | `node dist/cli/index.js search "idempotent" --explain --json` (cwd `/tmp/hybrid-smoke`) | ✅ hit `verifySessionToken` bm25Rank=1; signals present |
| Doctor FTS/Node | `speclaw doctor --json` | ✅ `env.fts5=ok`, `env.embedder=lexical-hash-v1+in2`, `env.node=v24.17.0` |

## Contract exercised

| Surface | Change |
| --- | --- |
| MCP `compass_find` | Always hybrid; inputs `focus?`, `maxTokens?`; `mode` = weights only |
| Aliases `compass_search` / `compass_recall` | Still delegate via `findSymbols` |
| CLI `search` / `recall` | `--focus`, `--max-tokens`, `--explain`, `--json` |
| Doctor environment | `env.fts5`, `env.embedder`; engines floor `>=22.16` |
| package.json engines | `>=22.16` |

## Spec-scenario coverage (cli deltas)

| Scenario | Verified by |
| --- | --- |
| Help lists hybrid controls | HELP text in `src/cli/index.ts` updated |
| Explain includes signals | manual `--explain --json` shows bm25/knn/pr/hops/score |
| Doctor JSON includes FTS | manual doctor --json |

## Pre-existing / unrelated failures

none

## Pending manual steps

none

## Verdict

✅ MCP/CLI/doctor contracts match the hybrid retrieval change.
