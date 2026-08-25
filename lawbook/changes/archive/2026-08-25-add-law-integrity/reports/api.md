# API checks — add-law-integrity (2026-08-25)

Date · Branch `feat/law-integrity` · CLI surface only (no new MCP tool)

## Surface

| Entry | Behavior |
| --- | --- |
| `speclaw verify` | Runs `verifyLaws` then `verifyIntegrity`; folds findings into SARIF/exit codes |
| `speclaw laws lock` | Writes/refreshes root `speclaw.lock` |
| `speclaw laws scan` | Injection scan only (`--json` ok) |
| `speclaw laws accept <path>` | Interactive TTY digest accept |
| `speclaw laws verify` | Unchanged deps/graph twin (no integrity fold — keeps MCP `law_verify` parity) |
| MCP catalog | Still eight canonical tools; no integrity mutator |

## Gates & results

| Check | Result |
| --- | --- |
| Help lists lock/accept/scan | ✅ `src/cli/index.ts` usage text |
| Verify exit 0 with matching lock | ✅ manual `verify --ci --path src` |
| Accept non-TTY | ✅ exit ≠ 0 |
| Tool-surface assertion | ✅ unit accept |

## Spec-scenario coverage

| Scenario | Verified by |
| --- | --- |
| Help lists lock accept scan | code + help text |
| Verify includes integrity without new MCP tool | verify wiring + tool catalog test |
| Scaffold / compile refresh lock | scaffold + compileLaws call `refreshLockfile` |

## Verdict

pass — CLI integrity surface shipped without expanding the MCP catalog.
