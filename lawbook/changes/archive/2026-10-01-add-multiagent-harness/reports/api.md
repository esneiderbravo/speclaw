# API checks — add-multiagent-harness (2026-10-01)

Date · Branch · Environment/cwd: 2026-10-01 · `feat/multiagent-harness` · local CLI + in-process registration (no live store) · Cortex stage `testing` iteration 3

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Canonical catalog | contract / registers suite via `npm test` | ✅ length **9**, includes `cortex` |
| Minimal surface | `budget.test.ts` minimal profile | ✅ 5 tools including `cortex`; under `token-budget.json` minimal ceilings (`tools` 1500 / `total` 16500) |
| Contract / surface tests | `npm test` | ✅ **518/518** pass (registers + tool-surface-benchmark included) |
| CLI status | `node dist/cli/index.js cortex status --change add-multiagent-harness` | ✅ stage `testing`, iteration **3**, `verdicts.review=PASS`, `verdicts.test=FAIL` (stale prior tester verdict; this re-run is PASS) |
| CLI brief | `node dist/cli/index.js cortex brief --change add-multiagent-harness` | ✅ `role=tester`, `agentPath=ai-specs/agents/tester.md`, `skillHints=["test"]`, `nextOps=["advance","rework"]` |
| Scaffold assets | paths under `ai-specs/` + module assets | ✅ cortex skill/command + role agents (scaffold tests PASS) |
| Live Cursor MCP session | tool list for `project-0-speclaw-speclaw` | ⚠️ session catalog still omits `cortex` (stale server). Product registration verified via contract tests + CLI — restart MCP after merge |

## Endpoint / tool contract

- **Tool:** `cortex` (canonical; 9th of nine)
- **Actions:** `status` \| `start` \| `advance` \| `rework` \| `brief`
- **Inputs:** `change`, `action`/`harnessOp`, optional `verdict`, `openQuestions`, `pauseForQuestions`, `note`
- **CLI:** `speclaw cortex <op> --change <name> […]`
- **Auth:** local process only (no network)
- **Isolation:** read-only status/brief against existing `harness.json`; no real-user data stores touched

### Brief response shape (observed this run)

```json
{
  "stage": "testing",
  "iteration": 3,
  "role": "tester",
  "agentPath": "ai-specs/agents/tester.md",
  "skillHints": ["test"],
  "nextOps": ["advance", "rework"],
  "review": "PASS",
  "test": "FAIL"
}
```

(`test: FAIL` is the harness field from the prior iteration; this discipline re-run verdict is **PASS** for the coordinator to `advance` with.)

## Tests added / updated

- `test/unit/budget.test.ts` — minimal count 5 + ceilings
- Contract registers `cortex`; scaffold asserts cortex skill + command paths
- `test/unit/harness.test.ts` — API-adjacent state machine / brief mapping

## Spec-scenario coverage

| Scenario | How verified |
|----------|--------------|
| Start initializes exploring | harness history + unit |
| Illegal advance rejected | unit |
| Brief maps implementing → implementer | unit; live brief maps testing → tester |
| Cortex MCP module / CLI | CLI status+brief PASS; suite registration includes `cortex` |
| Scaffold installs cortex skill/command | `scaffold.test.ts` PASS |
| Cortex dispatcher / budget | ✅ minimal tools/total under raised ceilings |

## Pre-existing / unrelated failures

none

## Pending manual steps

- Restart Cursor speclaw MCP server so live tool list includes `cortex`

## Verdict

PASS
