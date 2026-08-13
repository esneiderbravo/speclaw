# API checks — check-dispatcher (2026-08-13)

Date · 2026-08-13 · Branch `feat/check-dispatcher` · Environment: local macOS, Node ≥22, cwd `/Users/esneiderbravo/Projects/speclaw`

This change adds two surfaces: the MCP tool `speclaw_check` and the CLI command `speclaw check` (both delegating to the same `checkAction()` core — two transports, one implementation).

## Gates & results

| Check | Command | Result |
| :-- | :-- | :-- |
| Contract test | `npm test` (`test/contract/registers.test.ts`) | ✅ `speclaw_check` declared; schema rejects bad event, accepts valid; handler returns MCP text with `verdict` |
| Manual CLI exercise | `node dist/cli/index.js check …` in a throwaway repo | ✅ see runs below |

## MCP tool — `speclaw_check`

- **Input schema** (Zod): `projectPath: string` (required), `event: enum("PreToolUse","PostToolUse","Stop","InstructionsLoaded")` (required), `toolName?: string`, `payload: record(unknown)` (required).
- **Description**: ≤12 words — "Invoked by speclaw's hooks to enforce laws — do not call directly." (No `defer_loading`: not author-settable from an MCP server; short description is the only lever.)
- **Output**: MCP text block wrapping a `CheckResult` — `{ verdict: "allow"|"warn"|"deny"|"escalate", evaluated: [...], reason?, elapsedMs, diagnostic? }`.
- **Contract guarantees**: fails open (missing/corrupt manifest or exception → `allow` + `diagnostic`); a `deny` `reason` always cites law id + literal prose + source path. This is tool **#20** in the registry (record for token-budget; the 17 in the roadmap predated the `tools` module).

## CLI command — `speclaw check`

Exercised against a scaffolded throwaway project:

- `check` (no flags) → summary of declared laws (id · enforcement · backend · scope). Exit 0.
- `check --dry-run --path config/.env` → `verdict: would BLOCK`, cites `law~no-secrets-in-repo~1`. Exit 0 (preview never blocks).
- `check --dry-run --path src/app.ts` → `No law applies to this path`. Exit 0.
- `check --hook-payload -` with `{"hook_event_name":"PreToolUse","tool_input":{"file_path":".env"}}` on stdin →
  `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Blocked by law~no-secrets-in-repo~1 …"}}` · **exit code 2** (the documented command-hook block signal).
- `check --hook-payload -` with an allow payload → `permissionDecision:"allow"` · **exit 0**.
- `check --hook-payload -` with unparseable stdin → `permissionDecision:"allow"` · exit 0 (fails open).

The exit-code contract is now also covered automatically by `test/e2e/cli.test.ts` ("check --hook-payload denies a .env edit with exit code 2"), driving the built CLI with a stdin payload.

## Status codes / signals

| Surface | Signal | Meaning |
| :-- | :-- | :-- |
| MCP `speclaw_check` | `verdict` field | `deny` = action blocked; `allow`/`warn` = permitted (message enters context) |
| CLI `--hook-payload -` | exit `2` | block (command-hook contract) |
| CLI `--hook-payload -` | exit `0` | allow (including all fail-open paths) |
| CLI `--dry-run` | exit `0` | always (preview only) |

## Wire-format mapping (ACS → Claude Code)

ACS verdicts `allow/warn/deny/escalate` map to Claude Code's `hookSpecificOutput.permissionDecision`. PreToolUse has no `warn` → rendered as `allow` with the message in the output (still enters context). Legacy `{"decision":"block"}` avoided. All wire-format knowledge is isolated in `hooks.ts` / the CLI hook-payload path.

## Pre-existing / unrelated failures

None.

## Pending manual steps

None — the tool and command were exercised end-to-end by the agent against an isolated temp project (removed after).

## Verdict

✅ Pass — tool contract validated by the contract test; CLI contract (payloads, JSON shape, exit codes) verified by recorded manual runs, all isolated from real data.
