# Proposal — reindex-on-edit

## Why

1. **The Compass index goes stale while an agent edits.** The index is
   refreshed at session start (`speclaw session-start`, 2.0.7), by an explicit
   `compass_index` / `speclaw index`, or by `speclaw watch`. Between those runs,
   every `Write`/`Edit` an agent makes is invisible to `compass_explore`,
   `compass_find`, and impact queries. Later in the same session, the agent
   reads stale source, misses new symbols, and gets a wrong blast radius for
   code it just wrote. That is the moment Compass matters most.
2. **Re-extracting a file leaves dangling destination ids (defect, ships
   today).** When a file is re-extracted, `buildIndex` deletes that file's
   `nodes` rows (`src/modules/compass/indexer.ts:413-414`). Edges owned by
   *other* files keep their `dst_node_id`, which now points at a deleted id
   (`edges.dst_node_id` has no foreign key, `db.ts:88`). Call resolution only
   touches edges whose `dst_node_id` is NULL, so those edges are never repaired.
   The impact/trace recursive CTE prefers the id (`query.ts:581-597`), so after
   any edit to `a.ts` the callers of `a.ts` symbols from `b.ts` drop out of the
   blast radius. Per-file reindexing would trigger this on every keystroke-level
   edit, so it must be fixed first, and fixed in both paths.

## What changes

1. **New command `speclaw reindex-file [paths...]` (code-graph).**
   - **Path mode** (`speclaw reindex-file <path>...`) re-indexes exactly the
     named files in the foreground, using the new Compass entry point
     `indexFiles(projectPath, relPaths)`. It re-extracts a changed file, removes
     a deleted file, and ignores ineligible paths (outside the root, in a skipped
     directory, an unknown language, or over the size cap).
   - **Hook mode** (no arguments) reads the Claude Code `PostToolUse` hook JSON
     from stdin and takes `tool_input.file_path` or `tool_input.notebook_path`.
     It spawns a detached `speclaw reindex-file -- <path>` child and exits 0
     immediately, so the edit is not slowed down.
   - Both modes print nothing, always exit 0, show no header or update notice,
     do not log to `compass-calls.jsonl`, and swallow `SQLITE_BUSY`.
   - A per-file run does **not** recompute PageRank, evict the embedding cache,
     rewrite `docs/compass.md`, or bump `meta.indexed_at`. It sets a
     `meta.post_pending` marker instead. The next full run (session start,
     `index`, `compass_index`, watch) sees that marker, skips its no-op fast
     path, and does the global post-processing.
2. **New `PostToolUse` command hook (law-enforcement).** For hook-capable agents,
   the hook compiler adds a separate `PostToolUse` group with matcher
   `Write|Edit|MultiEdit|NotebookEdit`. Its single hook is a `command` with
   timeout 10. The command runs `speclaw reindex-file` with the same guard and
   resolution chain as the session-start hook: the `.speclaw/index.db` guard,
   then the local binary, then `PATH`, then offline `npx --no-install`. Its
   output is discarded and it always exits 0. One shared builder produces both
   command strings. The merge identity gains the marker `speclaw reindex-file`,
   so re-running `update` never duplicates the hook.
3. **Dangling-id fix (code-graph).** Before a file's nodes are deleted, every
   edge whose `dst_node_id` points at one of them is reset to NULL. The normal
   resolution pass then re-points it at the new node, or leaves it NULL so impact
   falls back to the name. This applies to the full `buildIndex`, to file
   removal, and to `indexFiles`. The regression test is written first and its
   failing output is saved.

## Capabilities

Both capabilities exist and are reused by their exact names. Each delta is a
full-file copy plus this change's edits.

| Capability | Added | Amended |
|------------|-------|---------|
| `code-graph` | `req~reindex-on-edit~1`, `req~edge-ids-survive-reindex~1` | `req~index-noop-fast-path~1` (`post_pending` disables the fast path); "Per-file fragment independence" (re-pointing another file's `dst_node_id` is the one allowed write) |
| `law-enforcement` | `req~edit-reindex-hook~1` | "Idempotent hook merge" (new marker); capability header |

No requirement is removed. Amended requirements keep their ids.

**Sync order (binding).**
- `law-enforcement`: this delta is built on the full-copy delta of the active
  change `harden-update-lock-and-cli`
  (`lawbook/changes/harden-update-lock-and-cli/specs/law-enforcement/spec.md`).
  It carries that change's `req~lock-preserves-drift~1` and the amended
  `req~laws-accept-human~1`. `harden-update-lock-and-cli` must sync and archive
  **first**. If its delta changes before it syncs, re-apply those edits here
  before this change syncs.
- `code-graph`: the bug change `fix-explore-tests-and-callees` (level 3) lands
  **before** this one, and its `code-graph` delta is the base. That change adds
  a hidden file-owner node, full multi-line import text, tsconfig path aliases,
  schema **11** (`edges.is_member`, with no global by-name binding of member
  calls), and a shared `resolveEdges(db, fileIds?)` helper. This delta was
  drafted on the current canonical `lawbook/specs/code-graph/spec.md`, because
  fix-explore's delta did not exist yet. It **must be re-based** onto
  fix-explore's delta once that delta exists (task R0.1), and certainly before
  this change syncs. Sync order for `code-graph`:
  `fix-explore-tests-and-callees` → `reindex-on-edit`.
- Overall sync order: `harden-update-lock-and-cli` →
  `fix-explore-tests-and-callees` → `reindex-on-edit`.

**Implementation order.** Implementation starts after both
`harden-update-lock-and-cli` and `fix-explore-tests-and-callees` are archived,
or at least reach test PASS with no rework pending.
- `harden-update-lock-and-cli` shares `src/cli/index.ts`,
  `src/cli/lib/help.ts`, and `test/helpers/cli.ts`.
- `fix-explore-tests-and-callees` shares `src/modules/compass/indexer.ts`.
  `indexFiles` reuses its `resolveEdges(db, fileIds)`.

**Ownership of the dangling-id fix.** This change owns it. It is built on
fix-explore's `resolveEdges`: detach first, then call `resolveEdges`. If
fix-explore ends up fixing it anyway, the rebase in R0.1 drops the duplicate
requirement from this delta and keeps one owner.

**R0.1 outcome.** fix-explore landed a post-hoc reset in `resolveEdges` (edges
whose `dst_node_id` names an id absent from `nodes` are set to NULL) and the
"Per-file fragment independence" clarification. That covers ids that no longer
exist, but not a freed rowid that SQLite hands to a node inserted later in the
same run: the edge then silently points at an unrelated symbol (reproduced
red: `bar → foo` became `bar → added`). `req~edge-ids-survive-reindex~1` is kept,
narrowed to "detach before delete, and bind to the current id when the symbol
still exists"; the removed-file "no dangling id" scenario moved to the
canonical behavior plus `req~reindex-on-edit~1`'s deleted-file scenario.

**Schema.** This change bumps no schema. Schema 11 belongs to fix-explore.
`meta.post_pending` is a key in the existing `meta` table.

## API surface

`api.md` is **not** owed. No MCP tool is added or removed, the tool count stays
at nine, and no input schema or result shape changes. The dangling-id fix makes
`compass_impact` / `compass_explore` honor the contract they already promise
(id-first reverse reachability). `backend.md` carries that evidence. The new
`PostToolUse` entry in `.claude/settings.json` is agent hook wiring, and
`hooks.md` covers it. The new CLI command is covered by `cli.md`.

## Out of scope

- Files created, renamed, or deleted by `Bash` (e.g. `git mv`, `sed -i`), edits
  made outside Claude Code, and agents without a `hooks` capability. The
  session-start refresh, `compass_index`, and `speclaw watch` still cover them.
  This is documented.
- Per-edit PageRank recomputation (deferred to the next full run by design),
  debouncing, and moving `speclaw watch` onto `indexFiles`.
- Editing `CLAUDE.md` / `AGENTS.md` in this repo. They are strict lock paths and
  need a human TTY `laws accept`. The docs change lands in `docs/compass.md`,
  the shipped template, and `README.md`. See design D12.

## Release

Ships in **2.0.11** on `feat/reindex-on-edit` (stacked on
`fix/explore-tests-and-callees`, release 2.0.10). The coordinator owns the
version bump and the CHANGELOG entry. `speclaw update` carries a 2.0.11
migration note (the new hook makes the settings file `refreshedDiverged` once).
