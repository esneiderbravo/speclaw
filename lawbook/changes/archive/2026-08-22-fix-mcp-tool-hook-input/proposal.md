# fix-mcp-tool-hook-input — Claude Code mcp_tool hooks must pass speclaw_check args

## Why

Claude Code's `mcp_tool` hook type does **not** auto-inject tool arguments. It
calls the named MCP tool with only the optional `input` map (with `${…}`
substitution from the hook event). speclaw's compiler emitted
`{type, server, tool, timeout}` with no `input`, so Stop / PreToolUse /
PostToolUse / InstructionsLoaded hooks fail with:

`MCP error -32602: Required at projectPath / event / payload`

Repos that already ran `speclaw init` keep the broken settings until hooks are
recompiled.

## What

- Emit a stable `input` template on every speclaw `mcp_tool` hook:
  `projectPath: ${cwd}`, `event: ${hook_event_name}`, `toolName: ${tool_name}`,
  and a minimal `payload` carrying `hook_event_name`, `tool_name`, and
  `tool_input.file_path` substitutions.
- Keep merge identity `{type:"mcp_tool", server:"speclaw"}` unchanged.
- Ensure `speclaw update` (scaffold refresh + installHooks) rewrites existing
  `.claude/settings.json` hooks to the new shape (sha drift).
- Release **0.3.7** so `npx @esneiderbravo/speclaw@latest` / `speclaw update`
  delivers the fix to every installed project.

## Non-goals

- Changing `speclaw_check` evaluation semantics or enforcement mapping.
- Command-hook fallback changes (`speclaw check --hook-payload -` already works).
- Agents without a `hooks` capability.

## Migrations

Yes — package version bump + update migration entry describing the hook
rewrite (scaffold already refreshes hooks; migration documents the release).
