# Proposal — harden-update-lock-and-cli

## Why

Four problems surfaced while dogfooding the 2.0.x line. Item 1 is a feature
gap. Items 2, 3, and 4 are defects that ship today.

1. **`speclaw update` migrates with a stale binary.** Since 2.0.1, `update`
   only prints an advisory when npm has a newer version
   (`binaryUpgradeHint`). A user who runs a global or cached `speclaw update`
   therefore applies the *old* release's migrations and managed files. The
   agent MCP entry is also unpinned (`npx -y @esneiderbravo/speclaw mcp`), so
   the MCP server version depends on whatever npx has cached and can differ
   from the CLI that scaffolded the project.
2. **The lock refresh launders tampering (security defect).**
   `refreshLockfile` rebuilds every digest from disk. When `init`, `update`,
   `laws compile`, or `laws lock` runs after someone edited a strict file
   (`CLAUDE.md`, `AGENTS.md`, compiled rules), the edit is silently
   re-baselined. `speclaw verify` then passes. This defeats
   `req~integrity-verify~1` and bypasses the human-only `laws accept`
   (`req~laws-accept-human~1`).
3. **Archived changes leave the harness stuck in `archiving` (defect).**
   `specArchive` moves the change directory, and the skill then tells the
   coordinator to `advance` to `done`. By then `requireChangeDir` throws,
   because the change no longer exists under `lawbook/changes/<name>/`. Five
   archived changes from 2026-10-06 are stuck in `archiving`.
4. **`--help` is ignored by most commands (defect).** Only a first-argument
   `help` and `speclaw index --help` are handled. `speclaw init --help` runs
   `init`, which writes files. `speclaw mcp --help` starts a server. The `cli`
   spec already promises per-command help in ten scenarios.

## What changes

1. **Self-update (project-update).** `speclaw update` re-executes itself as
   `npx -y @esneiderbravo/speclaw@<latest> update <flags>` when the registry
   reports a newer version during this run. It inherits stdio, sets the loop
   guard `SPECLAW_SELF_UPDATED=<latest>`, and exits with the child's code.
   Opt out with `--no-self-update` or `SPECLAW_NO_SELF_UPDATE=1`. The
   re-execution also happens in CI and on a non-TTY. It falls back to
   in-process migration only when `npx` cannot be spawned, when the registry
   was unreachable (an offline, cache-only `latest`), or when no `latest` is
   known. `init` keeps its advisory and does not re-execute. A **2.0.9
   MIGRATIONS entry** notes the change. The shipped 2.0.1 entry is not edited.
2. **Pinned MCP entry (project-update).** `init`, `agent add`, and `update`
   write `args: ["-y", "@esneiderbravo/speclaw@<pkgVersion>", "mcp"]`.
   `update` rewrites an existing speclaw entry that has the stock npx shape.
   Any other shape is left untouched.
3. **Lock refresh preserves drift (law-enforcement, project-update, cli).**
   Before any rule artifact is written, speclaw computes which strict paths
   have drifted from the lock. After the writes, it keeps the old digest for
   those paths and warns `run speclaw laws accept <path>`. It refreshes clean
   strict paths, adds new strict paths, and refreshes advisory paths freely.
   It also prunes stale or superseded `accepted[]` entries. `speclaw laws lock`
   with an existing lock follows the same rule. Drifted strict paths are
   re-baselined only by `laws lock --force` on an interactive TTY.
4. **Archive completes the harness (lawbook-workflow).** `specArchive` moves
   the harness from `archiving` to `done`, with a history entry, before it
   moves the directory. It restores the old bytes if the move fails. The
   Cortex resolver falls back to the newest `archive/<date>-<name>`, so
   `status` and `brief` work after an archive. The cortex skill and the
   archiver agent stop telling the coordinator to `advance` after an archive.
   The five stuck archived `harness.json` files are repaired to `done`, with a
   history entry each.
5. **Per-command help (cli).** One help registry and one command list,
   `src/cli/lib/help.ts`, are shared with the dispatcher. `--help` / `-h` on
   any command prints usage to stdout and exits 0. It writes nothing, contacts
   no registry, starts no server or watcher, and prints no notifier or header.
   `INDEX_HELP` folds into the registry.

## Capabilities

All four capabilities exist and are reused by their exact names. Each delta
is a full-file copy of the current canonical spec plus this change's edits.

| Capability | Added | Amended |
|------------|-------|---------|
| `project-update` | `req~update-self-update~1`, `req~mcp-entry-pinned~1` | `req~lock-refresh-update~1` (drift exception) |
| `law-enforcement` | `req~lock-preserves-drift~1` | `req~laws-accept-human~1` (`laws lock --force` is the second human path) |
| `lawbook-workflow` | `req~harness-archive-completes~1` | none |
| `cli` | `req~per-command-help~1` | `req~laws-integrity-cli~1` (`lock --force`) |

No requirement is removed. The amended requirements keep their ids, because
existing `// Covers:` tags still describe them.

**Sync order (binding).** The `lawbook-workflow` delta is built on the
full-copy delta of the active sibling change `coordinator-status-updates`. It
carries that change's three `cortex-status-*` requirements. The sibling must
sync and archive **first**. Otherwise its later sync would overwrite the
canonical spec and drop `req~harness-archive-completes~1`. If the sibling's
delta changes before it syncs, re-apply those edits here before this change
syncs. No other active change touches `project-update`, `law-enforcement`, or
`cli`.

## API surface

`api.md` is owed:

- The `cortex` MCP tool's `status` and `brief` actions now return state for an
  archived change instead of an error.
- The `lawbook_change` action `archive` result gains `harnessCompleted`.

The pinned `.mcp.json` launcher entry is per-developer agent wiring, not an MCP
tool contract. `api.md` records it as context, and `cli.md` covers it. The MCP
input schemas do not change, and the tool count stays at nine.

## Out of scope

- Re-executing `init` (it stays advisory).
- Detecting deleted strict files during a refresh. Today's behavior is kept:
  a missing path drops out of the snapshot, and `verify` reports `missing`
  before the refresh runs.
- Help text for second-level subcommands beyond the command's own usage. For
  example, `lawbook draft --help` prints the `lawbook` usage.
- Editing `CLAUDE.md` / `AGENTS.md` in this repo. They are strict lock paths.
  Changing them would need a human `laws accept`.

## Release

Ships in **2.0.9** on the shared branch `feat/coordinator-status-updates`,
after `coordinator-status-updates` (2.0.8); one version per change. The coordinator owns the version
bump and the CHANGELOG entry.
