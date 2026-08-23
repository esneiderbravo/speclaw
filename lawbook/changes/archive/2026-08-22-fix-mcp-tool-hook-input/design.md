# Design — mcp_tool hook input

## Approach

Extend `SPECLAW_HOOK` in `hooks.ts` with an `input` object whose string fields
use Claude Code's documented `${path}` substitution from the hook event JSON
(`cwd`, `hook_event_name`, `tool_name`, `tool_input.file_path`). Nested strings
are substituted the same way.

`update` already calls `scaffold(..., { refreshManaged: true })`, which calls
`installHooks`. Because the written settings JSON changes, the baseline sha
differs and settings are rewritten — no special migration `run()` is required
beyond documenting 0.3.7.

## Alternatives

| Option | Why not |
|--------|---------|
| Make `speclaw_check` args optional with cwd defaults | Hides misconfiguration; still misses `event`/`payload` for path matching |
| Switch to `command` hooks + `speclaw check --hook-payload -` | Works, but slower (spawn) and abandons the mcp_tool design |
| Manual user edits per repo | Does not scale; update must fix installs |

## Trade-offs

- On `Stop` / `InstructionsLoaded`, `${tool_name}` / `${tool_input.file_path}`
  may resolve empty or remain unsubstituted; `checkAction` already fails open
  when there is no target path — acceptable for gate/audit events.
- Token cost of a slightly larger settings JSON is negligible.
