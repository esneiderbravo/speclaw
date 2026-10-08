# Design — doc-hint-background

## Approach

- **Background, not faster.** The measurement (blast radius + affected tests) is inherently
  seconds on large diffs; making the hook wait is the bug. The hook spawns the CLI entry beside
  the module (`dist/cli/index.js measure-diff`, resolved from `import.meta.url` so it works from
  the MCP server and from tests) detached, like `reindex-file`.
- **Cache keyed by file set.** `sha256` of the sorted changed files; content edits within the
  same set do not re-measure (same trade-off the hint already made).
- **State.** `.speclaw/doc-hint.json` keeps `quick` (the `git status` fingerprint), `key`,
  `pending {key, at}` and `told {change, level}`. A pending measurement is re-started after
  2 minutes if the cache never arrived.
- **Pending fast path.** Same `quick` and the cache not written since `pending.at` → return
  without listing files.

## Rejected

- Raising the hook timeout: the agent would still wait the full measurement on every new file set.
- A cheaper measurement in the hook: the level would disagree with ship's at the stop.
