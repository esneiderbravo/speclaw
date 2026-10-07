# Investigate the bug

- Refresh the index (`compass_index`). Under Claude Code the `SessionStart`
  hook already refreshed an existing index when the session started; refresh
  again when files changed since then or the index is missing.
- Call **`lawbook_investigate`** with `stackTrace` and/or `symptom`.
- **`compass_explore`** the top suspect — read the code yourself.

Next: read `steps/02-hand-off.md` and do only what it says.
