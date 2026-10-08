# API checks — ship-measures-level (2026-10-08)

2026-10-08 · `fix/ship-measures-level` · `/Users/esneiderbravo/Projects/speclaw`

speclaw's API surface is its MCP server (stdio, `speclaw mcp`) and the hook contract Claude Code
calls. MCP has no HTTP methods or status codes: a call succeeds with a text result, or fails with
`isError: true` (the SDK's `-32602` for an unknown tool or invalid arguments). There is no
authentication: the server runs locally as the user, over stdio, for the project it is given.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| MCP surface (in-memory client) | `node --test dist-test/test/integration/mcp-surface.test.js` | ✅ 5 tests, 5 passed |
| Full suite | `npm test` | ✅ 1039 tests, 1039 passed |
| Live stdio server | `node /tmp/listtools.mjs` (SDK `Client` + `StdioClientTransport` on `dist/cli/index.js mcp`) | ✅ 29 tools full profile; `_meta` on 4; instructions present |

## Contract changes

| Surface | Before (2.0.19) | After (2.0.20) | Compatibility |
|---------|-----------------|----------------|---------------|
| `initialize` → `instructions` | absent | names the tool per job (find/explore, investigate, diff_context, lawbook_change, index, cortex, setup) | additive |
| `tools/list` → `_meta["anthropic/alwaysLoad"]` | absent | `true` on `compass_find`, `compass_explore`, `compass_diff_context`, `lawbook_investigate` | additive; clients that ignore `_meta` see no change |
| Tool descriptions | what the tool does | when to use it (≤ 25 words, budget-tested) | text only |
| Minimal profile | 5 tools; `speclaw_check` and `lawbook_investigate` missing → hooks got `isError` "Tool speclaw_check not found" | 7 tools; hooks answered | fix |
| `speclaw_check` input `payload.tool_input.command` | not sent | sent by the hooks (Bash) | additive; payload is `z.record` |
| `speclaw_check` input `payload.speclaw_hint: "doc"` | — | doc-hint group: no law evaluation, `verdict: "allow"` | additive |
| `speclaw_check` result on `PostToolUse` | `hookSpecificOutput.additionalContext` only for the nudge on Read/Grep/Glob | also for Bash reads and for the documentation hint | additive |
| `compass_explore` result `chain` | absent | `[{ name, file, startLine, depth, source? }]` when `include` has `callees` and `maxDepth > 1`, or with `to` | additive; depth 1 unchanged |
| `lawbook_investigate` default `maxSuspects` | 8 | 5 | behavior change; `maxSuspects` still accepted |
| `lawbook_investigate` ranking | semantic/hotspot matches anywhere | only symbols reachable from the hinted/trace test file (plus non-test frames); test frames never suspects; `test-reachable` and `leaf` reasons | behavior change |
| `lawbook_investigate` `unresolvedFrames` | included runtime frames (`node:` / `node_modules`) | runtime frames omitted | behavior change |

## How the contract was exercised

- In-memory MCP client (`InMemoryTransport`) against `buildServer()`: `listTools()` `_meta`,
  `getInstructions()`, minimal profile tool names, and `speclaw_check` calls on a temporary git
  repository (`tmpRepo`) — the doc-hint group returns `allow` with `additionalContext` naming the
  level, a second call returns none.
- Live stdio server via the SDK client: tool list, `_meta`, `speclaw_check` in a `--minimal`
  fixture (before the fix: `{"isError":true,"content":[{"text":"MCP error -32602: Tool speclaw_check not found"}]}`).
- `lawbook_investigate` and `compass_explore` called on the `deep` benchmark fixture under `/tmp`
  (stack trace from its real `npm test` output): `roundCents` ranks first, result 4287 chars.

Isolation: every call ran against throwaway repositories under the OS temp dir. The first version
of the MCP doc-hint test pointed at the working checkout (review finding B2); it now builds its own
git fixture, and the checkout's `.speclaw/doc-hint.json` it had written was removed.

## Pre-existing / unrelated failures

None.

## Pending manual steps

None.

## Verdict

✅ PASS — additive MCP changes plus two documented `lawbook_investigate` behavior changes, all exercised on isolated fixtures.
