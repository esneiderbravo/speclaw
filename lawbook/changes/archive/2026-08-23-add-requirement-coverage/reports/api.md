# API report — add-requirement-coverage

| Field | Value |
| --- | --- |
| Discipline | api |
| Change | add-requirement-coverage |
| Date | 2026-08-23 |
| Branch | feat/requirement-coverage |
| Environment | `/Users/esneiderbravo/Projects/speclaw` |

## Contract: `lawbook_coverage` (MCP)

| Field | Value |
| --- | --- |
| Tool | `lawbook_coverage` |
| Auth | local MCP stdio (no network auth) |
| Inputs | `projectPath` (string, required); `change` (string, optional); `onlyDefects` (boolean, optional, default true); `json` (boolean, optional) |
| Output | text: defect-first agent summary (≤ ~600 tokens) or JSON report when `json` |
| Status | success → text/JSON body; no HTTP status codes (MCP) |

### How exercised

| Method | Result |
| --- | --- |
| Contract registration test | `lawbook_coverage` present; no lawbook tool named `*trace*` |
| CLI twin | `speclaw coverage --json` returns versioned report |

## CLI surface (related)

| Command | Flags | Exit codes |
| --- | --- | --- |
| `speclaw coverage` | `--json`, `--tap`, `--adopt`, `--write`, `--change` | 0 clean / no ids; 1 gated defects |

`speclaw trace` remains call-path only (unchanged).

## Spec-scenario coverage

| Scenario | How verified |
| --- | --- |
| Tool name does not collide with compass_trace | contract list + naming |
| Default response is defect-first | `renderCoverageAgent(..., onlyDefects=true)` default |
| `coverage --json` machine-only | CLI suppresses branded header for `--json`/`--tap` |

## Pre-existing failures

None.

## Manual steps not automated

Live MCP client round-trip (registration + CLI twin covered).

## Verdict

pass — MCP + CLI coverage surfaces are registered and exercised.
