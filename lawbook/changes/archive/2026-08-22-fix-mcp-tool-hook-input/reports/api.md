# api — fix-mcp-tool-hook-input

- **Discipline:** api
- **Change:** fix-mcp-tool-hook-input
- **Date:** 2026-08-22
- **Branch:** fix/mcp-tool-hook-input
- **Environment:** local workspace `/Users/esneiderbravo/Projects/speclaw`

## Gates and results

| Check | Command | Result |
|-------|---------|--------|
| Wire format | inspect compiled `SPECLAW_HOOK` | includes `input` for `speclaw_check` |

## Contract

Claude Code `mcp_tool` hooks call MCP tools with only the configured `input`
map (string `${…}` substitution). speclaw now emits:

```json
{
  "type": "mcp_tool",
  "server": "speclaw",
  "tool": "speclaw_check",
  "timeout": 5,
  "input": {
    "projectPath": "${cwd}",
    "event": "${hook_event_name}",
    "toolName": "${tool_name}",
    "payload": {
      "hook_event_name": "${hook_event_name}",
      "tool_name": "${tool_name}",
      "tool_input": { "file_path": "${tool_input.file_path}" }
    }
  }
}
```

Merge identity remains `{type, server}` — `input` is not part of identity.

## Spec-scenario coverage

| Scenario | Verified by |
|----------|-------------|
| Hook generation requires `input` | unit/integration assertions + README note |

## Pre-existing / unrelated failures

none for this surface

## Manual steps not automated

none

## Verdict

API/wire contract matches Claude Code hooks docs; empty-arg `-32602` closed.
