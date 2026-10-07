# Design — reindex-on-edit

Level 3, feature change. It includes one defect (dangling `edges.dst_node_id`),
which follows the bug-grade red-before-green rule: write the regression test
first, save its failing output under `reports/`, then fix.

Line references are into the working tree at drafting time (explorer brief).
`fix-explore-tests-and-callees` lands first and moves code in `indexer.ts`.
Re-locate every `indexer.ts` reference after it lands. The shapes described
here (detach, then `resolveEdges`) do not depend on line numbers.

## Implementation notes (after R0)

- `resolveEdges(db, fileIds?)` (fix-explore, `indexer.ts`) already resets ids
  absent from `nodes` and, when scoped, re-tries NULL edges owned by `fileIds`,
  by importing files whose import just resolved, and whose `dst_name` names a
  symbol defined in `fileIds`. D16's third set is therefore covered by the
  scope itself; `indexFiles` passes the re-indexed files plus the owners of the
  edges `detachFileNodes` reset.
- Scoped passes never re-rank an edge that is already bound (fix-explore review
  F4). Documented on `indexFiles` and in `docs/compass.md`.
- `pagerank.node_id` cascades on node delete, so a per-file run drops the
  PageRank rows of the file's replaced nodes. The delta scenario now says "no
  row inserted or updated; none outside the re-indexed file deleted".
- `openDb` migrates or wipes a stale schema, which is a write. `indexFiles` uses
  a new `openCurrentDb` (read-only probe; `null` when absent, stale, or
  `needs_reindex`) so a stale index is never written.
- There is no compass barrel module; `indexFiles` / `classifyIndexPath` are
  exported from `indexer.ts`. `realPathOf` lives in `src/shared/paths.ts` so the
  hook-mode parent compares paths without loading Compass (D20).
- `parseFlags` reads `-- <path>` as a flag value, so `reindex-file` parses its
  raw argv (`reindexPathArgs`).
- Per-file runs do not refresh `embedding_cache.last_seen_at` on cache hits
  ("not touch"); they insert misses only.

## Rework 1 notes

- `buildIndex` now opens its transaction with `BEGIN IMMEDIATE` before reading
  `files`, `dir_hashes` root, and `needs_reindex` (A1). Before, it held the
  write lock only from its first write until commit, so a no-op run took it just
  for the final `meta` write. Now every run, a no-op included, holds it through
  its stat pass (about 230 ms on this repo in the bench). That is well inside
  the 5 s busy timeout, so a per-file child waits briefly and then commits; it
  no longer has a window to commit under the full run (Rework 2, B3).
- `isCurrentIndex(db)` is the single currency check; `indexFiles` re-runs it
  under the lock (A6).
- `removeFileRows` deletes `coverage_links` by path (A4).
- `detachFileNodes` collects owners only on per-file runs (A8).

## Rework 2 notes

- The walk still runs before the lock (it is the slow, lock-free part). A row
  the full run did not walk is dropped only when `classifyIndexPath` says its
  file is no longer eligible (gone, now ignored, or over the size cap). A file
  that is still eligible was created after the walk passed its directory and
  indexed by a per-file child, so the full run indexes it in the same run
  instead of removing it (B1).
- `buildIndex` runs `BEGIN IMMEDIATE` inside its `try`/`finally`, so
  `SQLITE_BUSY` on the lock still closes the connection. Its `ROLLBACK` is
  guarded by `db.isTransaction`, as in `indexFiles`, so it cannot mask the
  original error (B2).
- `BuildIndexOptions.hooks` (`onOpen`, `afterWalk`) are test seams, not part of
  the public contract.

## Rework 3 notes

- "Still eligible" was not enough (R2-1). `classifyIndexPath` asks only whether
  some file stats at the path, and the JS `realpathSync` keeps the spelling it
  was given. On a case-insensitive volume a case-only rename left the old row
  eligible, and a directory replaced by an in-root symlink resolved to its
  target, so both rows survived every full run, `--force` included.
- A full run now keeps an unwalked row only when `walkWouldYield` holds: each
  segment appears in its parent's `readdirSync` listing with exactly that
  spelling (case-sensitive string compare), no segment is a symlink (`lstat`:
  directories are real directories, the leaf a regular file, as the walk's
  `Dirent` checks require), no directory segment is skipped, and
  `classifyIndexPath` is eligible with the same `rel`. Every other unwalked
  row is removed. Listings are cached per run, so a mass delete in one large
  directory reads it once.
- The per-file path applies the same rule. `classifyIndexPath` takes the
  on-disk spelling from `fs.realpathSync.native` (macOS, Windows). A
  case-insensitive filesystem on Linux (vfat, ext4 casefold) may not report
  it, so `indexFiles` also refuses (`ignored`) any path `walkWouldYield`
  rejects. The check costs one `readdirSync` per path segment.
  A deleted file named in a different case from its row is not removed per
  file; the next full run removes it.

## Decisions

| # | Decision | Source |
|---|----------|--------|
| D1 | A per-file run does not recompute PageRank. That waits for the next full run (session start, `index`, `compass_index`, watch). Until then, ranking uses the previous PageRank, so a symbol added by an edit has no PageRank row and ranks on its other signals. | human |
| D2 | The dangling `dst_node_id` defect is fixed in this change, in `buildIndex`, in full-run file removal, and in `indexFiles`. The regression test comes first, with its failing output saved. | human |
| D3 | Ceremony level 3. | human |
| D4 | The command is a new top-level `speclaw reindex-file [paths...]`. A ≤2.0.7 binary prints `Unknown command` and exits 1 before it opens a database (`src/cli/index.ts:70-74`), so an old binary reached by the hook does nothing. `session-start --file` is rejected, because 2.0.7 ignores flags and would run a full `buildIndex` on every edit. | coordinator |
| D5 | With no arguments, the command reads the hook JSON from stdin (`tool_input.file_path`, else `tool_input.notebook_path`, plus `cwd`). It spawns a detached child after stdin is fully read, then exits 0, so the edit is not slowed. | coordinator |
| D6 | Hook timeout is 10 seconds. No hook key outside the agent's schema (`type`, `command`, `timeout`) is written. In particular there is no `async` key. | coordinator |
| D7 | Per-file runs do not update `meta.indexed_at`. | coordinator |
| D8 | Files created or renamed by `Bash`, and edits by non-Claude agents, are not covered. The session-start refresh, `compass_index`, and `speclaw watch` cover them. This is documented. | coordinator |
| D9 | No debounce. Runs are idempotent (content-hash equality is a no-op) and SQLite serializes them: per-file runs and full runs both take the write lock (`BEGIN IMMEDIATE`) before reading the stored file set (Rework 1, A1). `SQLITE_BUSY` is swallowed. | coordinator |
| D10 | The command is silent and always exits 0. It shows no update notifier and no branded header, and it is never logged to `.speclaw/compass-calls.jsonl`. | coordinator |
| D11 | One builder produces both the SessionStart and the reindex hook commands. They differ only in the subcommand. | coordinator |
| D12 | `CLAUDE.md` / `AGENTS.md` are **not** edited. They are strict lock paths, and an edit needs the human's TTY `speclaw laws accept`. The user-facing docs land in `docs/compass.md`, the shipped template, and `README.md`. **Flag for the human:** if you want `CLAUDE.md:143` / `AGENTS.md:130` to mention reindex-on-edit, edit them yourself and run `speclaw laws accept CLAUDE.md AGENTS.md` on a TTY. | coordinator |
| D13 | The project root is the process working directory, as in `session-start`. That is where the hook guard found `.speclaw/index.db`. The payload `cwd` is used only to resolve a relative `file_path`. A hook payload therefore cannot redirect writes into another project's database. | planner |
| D14 | `indexFiles` reads and hashes each file **after** taking the write lock (`BEGIN IMMEDIATE`). Two overlapping runs for the same file then cannot commit stale content last: the last transaction to begin read the file after the last edit. | planner |
| D15 | A per-file run that writes anything sets `meta.post_pending = '1'`. While it is set, the no-op fast path (`req~index-noop-fast-path~1`) does not apply, so the next full run does the global post-processing and the compact map write, then deletes the marker. Without it, the per-file `dir_hashes` update would make the next full run a no-op, and PageRank and `docs/compass.md` would stay stale indefinitely. | planner |
| D16 | Per-file resolution reuses `resolveEdges(db, fileIds)` from `fix-explore-tests-and-callees`, so that change's member-call rule (`edges.is_member`, no global by-name binding) and its alias resolution apply unchanged. `fileIds` is the union of three sets: the re-indexed file, the owner files of the edges whose `dst_node_id` was just reset (D17), and the owner files of NULL edges whose `dst_name` equals a symbol name the file now defines. NULL edges in other files (external calls such as `console.log`) are not re-tried per edit. | planner, coordinator |
| D17 | Dangling fix (owned by **this** change): before deleting a file's nodes, including fix-explore's hidden file-owner node, run `UPDATE edges SET dst_node_id = NULL WHERE dst_node_id IN (SELECT id FROM nodes WHERE file_id = ?)`. Afterwards, `resolveEdges` re-points those edges. One helper (`detachFileNodes(db, fileId)`) serves `buildIndex` re-extraction, full-run file removal, and `indexFiles`. This also stops a reused rowid from silently re-pointing an old edge at an unrelated new node. | planner, coordinator |
| D26 | Dependency and sync order: `harden-update-lock-and-cli` → `fix-explore-tests-and-callees` → `reindex-on-edit`. The `code-graph` delta is re-based onto fix-explore's delta once it exists (R0.1), and its schema text then reads 11. This change adds no schema version. `meta.post_pending` is a row in the existing `meta` table. | coordinator |
| D18 | "Per-file fragment independence" is amended. Re-indexing a file still never inserts or deletes another file's rows. The only allowed write to another file's edge is its `dst_node_id` (D16/D17). The old wording contradicted D2. | planner |
| D19 | Path mode (arguments given) runs in the foreground and synchronously. It is used by the detached child, by tests, by the bench, and for manual use. It is silent and exits 0, like hook mode. | planner |
| D20 | The hook-mode parent neither opens the database nor loads Compass or tree-sitter. `reindex-file.ts` dynamically imports the Compass indexer only on the path-mode branch. This keeps the per-edit hook cost close to bare Node startup. | planner |
| D21 | The child is `spawn(process.execPath, [process.argv[1], "reindex-file", "--", absPath], { cwd: root, detached: true, stdio: "ignore", windowsHide: true })` followed by `unref()`. `detached` puts it in its own process group, so neither the hook timeout nor the agent's cleanup of the hook's group kills it. `--` keeps a path that starts with `-` from being read as a flag. | planner |
| D22 | File eligibility comes from one exported Compass predicate shared with the full walk: a path segment in `SKIP_DIRS` (`indexer.ts:15-34`, `:214`), `langForPath` (`languages.ts:134`), `MAX_FILE_BYTES` (`:36`), and any other filter the walk applies. Per-file and full runs therefore agree on the file set, and the Merkle rule ("same file set") holds. | planner |
| D23 | `api.md` is not owed (see the proposal, "API surface"). | planner |
| D24 | `speclaw watch` keeps its debounced full `buildIndex` (`watcher.ts:28-40`). Moving it onto `indexFiles` is out of scope. | planner |
| D25 | With no arguments and stdin on a TTY (a human typing the command), the command prints its usage to stdout and exits 0, so it does not block waiting for stdin. | planner |

## 1. Dangling destination ids (`req~edge-ids-survive-reindex~1`) — defect

### 1.1 Regression first

Test file: `test/integration/edge-ids.test.ts` (new). Tag it
`// Covers: req~edge-ids-survive-reindex~1`.

1. Fixture in a temp dir: `a.ts` exports `foo()`, and `b.ts` imports it and
   calls `foo()` from `bar()`. `buildIndex`.
2. Edit `a.ts` so it re-extracts (insert a function above `foo`). `buildIndex`
   again.
3. Expect the following:
   - `impact` for `foo` (by `nodeId` of the new `foo`) lists `bar` with
     resolution `exact`.
   - `SELECT COUNT(*) FROM edges WHERE dst_node_id IS NOT NULL AND dst_node_id
     NOT IN (SELECT id FROM nodes)` is 0.
4. Run the test and save the failing output to `reports/.red-dangling.txt`. It
   fails today: either the count is >0, or the caller is missing or `by-name`.

### 1.2 Fix

- Add `detachFileNodes(db, fileId)` in `indexer.ts`. It resets
  `dst_node_id` to NULL for edges pointing at the file's nodes, then the caller
  deletes the nodes and edges as today.
- Call it before the delete at `:413-414` and before a removed file's rows are
  deleted in the full walk.
- The full run's `resolveEdges(db)` (from fix-explore, with no `fileIds`, so it
  resolves every NULL edge and replaces the inline SQL at `:533-541` and
  `resolveImportEdges` `:78-125`) then re-points the edges with no further
  change. If fix-explore's helper turns out to resolve only the edges of
  re-extracted files, pass it the owners of the detached edges too.
- Also cover the removed-symbol case. When `foo` is deleted from `a.ts`, the
  edge from `bar` ends with `dst_node_id` NULL, and impact reports `bar` as
  `by-name` only if a `foo` still exists somewhere. Otherwise `bar` is not
  reported.

## 2. `indexFiles` (`req~reindex-on-edit~1`)

### 2.1 Signature (in `src/modules/compass/indexer.ts`, exported via the compass barrel)

```ts
export interface IndexFilesResult {
  reindexed: string[];   // re-extracted, repo-relative
  removed: string[];     // files rows deleted
  unchanged: string[];   // content hash equal, no node/edge write
  skipped: { path: string; reason: "outside" | "ignored" | "language" | "size" | "missing" }[];
  stale: boolean;        // needsReindex(db) was true → nothing done
}
export function indexFiles(projectPath: string, relOrAbsPaths: string[]): Promise<IndexFilesResult>;
```

### 2.2 Algorithm

1. Open the existing DB. If the DB is absent, return immediately. Never create
   one.
2. If `needsReindex(db)` is true (`:263`), return `stale: true` and write
   nothing. A stale schema needs a full run.
3. Normalize each path against the root, resolving relative paths against the
   given base (D13). Classify each path with the shared eligibility predicate
   (D22). An ineligible path goes to `skipped`.
4. Run `BEGIN IMMEDIATE` (busy_timeout 5000 from `db.ts:496`). Inside the
   transaction, handle each eligible path:
   - **Missing on disk with a `files` row:** `detachFileNodes`, delete the
     file's nodes and edges and the `files` row, and record it in `removed`.
   - **Missing with no row:** skip it with reason `missing`.
   - **Present:** read the bytes and compute the hash (D14). If the hash equals
     `files.hash`, refresh `mtime_ms`/`size` only and record it in `unchanged`.
     Otherwise, call `detachFileNodes`, then run the per-file extract body
     factored out of `:367-494`. That body writes `files`, `nodes`, `edges`,
     `node_text`/FTS, `node_metrics`, `is_test`, `module`, and embeddings
     through `embedding_cache`. It computes only cache misses, using the lexical
     embedder.
5. Collect the D16 `fileIds` and call `resolveEdges(db, fileIds)`, which
   covers call and import edges, the member rule, and aliases. Do not use
   resolution SQL of its own.
6. Recompute `dir_hashes` along each touched file's ancestor chain up to the
   root, using the same hash rule as `buildDirHashMap`. Siblings come from the
   stored `files.hash` and child `dir_hashes`. Delete a directory row whose
   directory became empty, matching the full walk's sentinel rule.
7. If anything was written, set `meta.post_pending = '1'`. Then `COMMIT`.
8. Do not write PageRank, do not touch or evict the embedding cache, do not
   write `docs/compass.md`, do not write `meta.indexed_at`, and do not call
   `recordCompassCall`.

`compass` imports nothing from `foundation` (law).

### 2.3 Full-run changes (`buildIndex`)

- The no-op test at `:518` also requires `meta.post_pending` to be absent.
- After a full post-processing pass (PageRank and the map write), delete
  `meta.post_pending` in the same transaction as the PageRank write.
- Use `detachFileNodes` everywhere nodes are deleted (§1.2).

## 3. CLI `speclaw reindex-file` (`src/cli/commands/reindex-file.ts`, new)

```
speclaw reindex-file [--] <path>...   re-index these files now (foreground)
speclaw reindex-file                  hook mode: read PostToolUse JSON from stdin,
                                      re-index the edited file in the background
```

- Dispatch: add `case "reindex-file"` in `src/cli/index.ts` with a dynamic
  import, like `session-start` at `:101-102`.
  - Skip `maybeNotifyUpdate` (`:163-165`).
  - Leave it out of `HEADER_COMMANDS` (`:14-32`).
  - Add it to `COMMANDS` and give it usage in `src/cli/lib/help.ts`, so
    `--help`/`-h` works per `req~per-command-help~1`.
  - List it in `GLOBAL_HELP` (`:27`).
- First line of the handler: `process.removeAllListeners("warning")`, as in
  `session-start.ts:21`. The whole body is wrapped in try/catch, which sets
  exit 0 and prints nothing (`session-start.ts:24-27`).
- **Path mode:** if `.speclaw/index.db` is absent under `process.cwd()`, return.
  Otherwise call `await indexFiles(cwd, paths)` and ignore the result.
- **Hook mode:**
  - If stdin is a TTY, print the usage and return (D25).
  - Otherwise, read stdin to its end, capped at 1 MiB, and parse the JSON. On a
    parse error, return.
  - Take the target from `tool_input.file_path`, else `tool_input.notebook_path`,
    trimmed and non-empty. Resolve a relative path against the payload `cwd`
    (an absolute string), else against `process.cwd()`.
  - If `.speclaw/index.db` is absent, return. If the resolved path is outside
    `process.cwd()`, return.
  - Spawn the detached child (D21) and return. Do not wait.
- Never print. Exit 0 in every path.

## 4. Hooks (`src/modules/foundation/hooks.ts`)

- `speclawCommand(sub: "session-start" | "reindex-file"): string` builds the
  string at `:106-111` with the subcommand substituted. That keeps the guard,
  the resolution order, offline `npx --no-install` with
  `npm_config_update_notifier=false`, `>/dev/null 2>&1`, and `|| true`.
  `SESSION_START_COMMAND = speclawCommand("session-start")` stays
  byte-identical to today's string (unit assertion).
- `REINDEX_FILE_MARKER = "speclaw reindex-file"`. `isSpeclawHook` (`:166-174`)
  matches a `command` hook containing either marker, or the legacy marker.
- `REINDEX_TIMEOUT_SECONDS = 10`.
- `CompiledByEvent` (`:180-182`): `PostToolUse` widens to groups of
  `SpeclawHook | SpeclawCommandHook`.
- `compileHooks` (`:205-235`) always appends a **separate** group
  `{ matcher: MUTATION_MATCHER, hooks: [{ type: "command", command: speclawCommand("reindex-file"), timeout: 10 }] }`
  after the nudge and feedback groups. It is never merged into the feedback
  `mcp_tool` group, so a user's view of either stays readable.
- `mergeHooks` (`:248-265`) needs no logic change beyond the marker. Claude Code
  runs the matching groups in parallel.
- Stdin reaches `speclaw` through the `sh -c` wrapper unchanged. A unit test
  proves it: the stub records its stdin.

## 5. Performance

Bench script: `scripts/bench/reindex-file.mjs`, modeled on
`scripts/bench/session-start.mjs`. It uses throwaway worktrees of `main` and the
branch, both built and indexed, under `os.tmpdir()`. It runs 3 warm-ups, then
≥20 timed runs, and reports the median and p95.

| Metric | main | branch |
|--------|------|--------|
| A. no-op `speclaw index` | yes | yes (must not exceed main; existing scenario) |
| B. `speclaw index` after a one-function edit (today's way to refresh one file) | yes | yes |
| C. hook-mode wall time: `printf '<payload>' \| sh -c '<compiled reindex command>'`, measured to the parent's exit | — (no command) | yes |
| D. detached work time: `speclaw reindex-file <file>` foreground after the same edit | — | yes |

Budgets (spec scenario): C median < A median (branch), and D median < B median
(main). `reports/performance.md` records all four with the machine, the Node
version, and the commands used.

## 6. Tests

| File | What |
|------|------|
| `test/integration/edge-ids.test.ts` (new) | §1 regression for `buildIndex` and the same scenario through `indexFiles`, plus the removed-symbol and removed-file cases. |
| `test/unit/index-files.test.ts` (new) | `indexFiles`: new symbol, unchanged no-op (no node/edge write), removed file, eligibility skips (outside, `node_modules/x.ts`, `README.md`, oversize), a stale schema is a no-op, `post_pending` set, `indexed_at`, PageRank rows, and the `docs/compass.md` bytes and mtime all unchanged, ancestor `dir_hashes` equal a fresh full walk's, and resolution equivalent to a fresh full index on an unambiguous fixture. |
| `test/integration/reindex-file.test.ts` (new, modeled on `session-start.test.ts`) | Through the built CLI: no index means silent with no DB created; path mode picks up an edit; hook mode with an `Edit` payload picks it up (poll ≤10 s); hook mode returns within 2 s while another connection holds `BEGIN IMMEDIATE` (proves detachment); a locked DB in path mode is swallowed; not logged; invalid JSON and missing `file_path` are no-ops; `help` lists the command; overlapping-edit freshness (D14): hold the lock, start path mode, rewrite the file, release, then expect the latest content. |
| `test/unit/index.test.ts` or the no-op suite | A per-file run followed by `speclaw index` runs the full pass (PageRank recomputed, map written, marker cleared). |
| `test/unit/hooks.test.ts` | compile/merge (`:249-319`): the reindex group is present without laws, there is exactly one after a re-merge, a user `PostToolUse` command hook is kept, the feedback group is intact, and no `async` key exists. sh stubs (`:366-500`): no index, local binary receives `reindex-file` **and the stdin JSON bytes**, an old `PATH` binary exits 1 with nothing changed, npx is offline, and a failure is swallowed. `SESSION_START_COMMAND` is unchanged. |
| `test/integration/hooks.test.ts` (`:50-60`) | The init-written settings contain the reindex group. |
| `test/e2e/cli.test.ts` | The per-command help table picks up `reindex-file` through `COMMANDS` automatically. Check that it does not hang (stdin is not a TTY in the table, and `--help` short-circuits first). |

## 7. Docs

- `docs/compass.md` (hand-written section, not the map block) and
  `src/modules/foundation/assets/docs/compass.template.md:41`: freshness model
  (session start, then per-edit, then full runs), the PageRank and compact-map
  deferral, and what is not covered (D8).
- `README.md`: one paragraph under the Compass hooks section.
- `src/cli/lib/help.ts`: global list entry and `reindex-file` usage.
- The 2.0.11 CHANGELOG lines are handed to the coordinator, and `update.ts`
  gains a 2.0.11 migration note (refreshedDiverged once; docs mention).
- Not edited: `CLAUDE.md`, `AGENTS.md` (D12).

## 8. Risks

- **Many detached children during a burst of edits.** Each child does at most
  one short transaction. The lock serializes them. A child that waits more than
  5 s on the lock exits quietly, and the next run or full run catches up.
- **`process.argv[1]` under npx** points into the npx cache. The child reuses
  the same binary, so the version is consistent.
- **Windows:** the hook command is POSIX `sh`, as with session-start (no
  regression). `detached` + `windowsHide` covers the spawn.
