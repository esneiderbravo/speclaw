# Review — reindex-on-edit

- Discipline: review · change `reindex-on-edit` (level 3, feature, one defect) · 2026-10-07
- Branch: `feat/reindex-on-edit` (uncommitted working tree on 95cb789, ships 2.0.11)
- cwd: `/Users/esneiderbravo/Projects/speclaw`
- Reviewer: Cortex reviewer role. I read the code and did not change it. Compass calls: 2 (`compass_diff_context`, `compass_explore indexFiles`). The session MCP index is a stale build, so `indexFiles` came back not found, and I read the files directly after that.

## Verdict: **PASS**

The implementation matches the proposal (including "R0.1 outcome"), design D1–D26 plus "Implementation notes (after R0)", tasks 0–5, 7 and 10, and both delta specs (`code-graph`, `law-enforcement`). I found no blocking defect. The advisories below are non-blocking. A1 is worth a follow-up change.

Tasks 6.1 (gates), 8.1 (manual verification), 9.1 (discipline reports) and 11.1 (archive) are still open. They belong to the tester and coordinator stages, and nothing in them blocks review.

## What I checked, and how it held up

### Hook command: shell safety, silence, exit 0, offline npx (`src/modules/foundation/hooks.ts`)
- `speclawCommand(sub)` takes a closed union `"session-start" | "reindex-file"`. No payload or user data ever reaches the shell string, so there is no injection surface.
- `SESSION_START_COMMAND` is byte-identical to the 2.0.7 string, and a unit test asserts it. `REINDEX_FILE_COMMAND` equals `SESSION_START_COMMAND` with `session-start` replaced by `reindex-file` (spec scenario).
- The guard `cd "${CLAUDE_PROJECT_DIR:-.}" && [ -f .speclaw/index.db ]` is present. Resolution runs local → `PATH` → `npm_config_update_notifier=false npm_config_offline=true npx --no-install`. The `{…} >/dev/null 2>&1 || true` wrapper leaves stdin alone, so the payload reaches speclaw unchanged. The sh-stub test proves the bytes arrive.
- The reindex group is separate, with matcher `Write|Edit|MultiEdit|NotebookEdit`, keys `type`/`command`/`timeout` only, timeout 10, and no `async`. It is appended after the nudge and feedback groups and never folded into the `mcp_tool` group.
- `isSpeclawHook` recognizes the new marker alongside the session-start marker and the legacy marker. The merge is idempotent: a stale reindex shape is replaced, and a user `prettier --write` hook survives (tested).
- Old binaries: before 2.0.11, `reindex-file` is not in `KNOWN_COMMANDS`, so the binary prints to the discarded streams and exits 1 before any DB work. The PATH-stub test confirms `.speclaw/` is untouched.

### Hook-mode parent (`src/cli/commands/reindex-file.ts`)
- **Project root.** The root is `cwd` (D13). The payload `cwd` is used only when it is absolute, and only to resolve a relative `file_path` (`hookTarget`). `insideRoot(cwd, target)` compares `realPathOf` of both, so a symlink inside the root that points outside is rejected. A payload therefore cannot redirect writes into another project's database.
- **Malformed and large input.**
  - `readPayload` caps the payload at 1 MiB and still drains the rest.
  - `JSON.parse` failures return.
  - Non-object payloads, a missing `tool_input`, or a non-string, empty or blank `file_path` all yield `null`.
  - The value falls back to `notebook_path` for NotebookEdit. MultiEdit uses `file_path`.
  - A path containing NUL makes `spawn` throw synchronously, and the outer `try` swallows it.
- **No database or Compass in the parent.** The parent never opens the DB or loads Compass or tree-sitter. The indexer import is dynamic and only on the path-mode branch (D20). `process.removeAllListeners("warning")` runs before `node:sqlite` can load.
- **Detached child.** The spawn uses `spawn(execPath, [entry, "reindex-file", "--", target], {cwd, detached, stdio:"ignore", windowsHide})`, then `on("error")` and `unref()`, as D21 specifies.
  - The child has no inherited pipes, so the agent never waits on output.
  - The parent exits at once, so no zombie is left: the child is re-parented.
  - The child inherits `env`, and a test proves the update notifier stays off.
- **Silence and help.** A TTY prints usage (D25). `src/cli/index.ts` leaves the command out of `HEADER_COMMANDS` and skips `maybeNotifyUpdate`. `--help` short-circuits. Everything else prints nothing and exits 0.

### `indexFiles` / `openCurrentDb` (`src/modules/compass/indexer.ts`, `db.ts`)
- **`openCurrentDb` never creates, migrates or wipes.** It returns `null` when the file is absent. The probe is read-only and checks `schema_version === "11"`, `hasEdgeSpec`, `!isStale` and `!needsReindex`. An old schema (8–10, or pre-release 11) and a newer one (12+) both return `null`, which leaves the repair to the next full run. There is no `rehydrateAnchors` and no `mkdir`.
- **Locking and reads.** It runs `BEGIN IMMEDIATE` with `busy_timeout` 5000. Classification (stat) and the read both happen inside the lock (D14), and the overlapping-edit test proves this. `SQLITE_BUSY` rolls back only if a transaction is open, then propagates to `runReindexFile`, which swallows it.
- **Eligibility.** `classifyIndexPath` shares `isSkippedDir` with `walkFiles` and applies the same `langForPath` and `MAX_FILE_BYTES` checks. It resolves symlinks in the existing prefix. Outcomes:
  - A symlinked file maps to its real target, which the walk indexes under its real path. A target under `node_modules` is reported as `ignored`.
  - A deleted file is classified `missing` with its relative path, so its row can be removed.
  - Oversize files keep their prior rows, which matches the walk: `seen.add` runs before the size `continue`.
- **Unchanged content.** It updates only the stat columns. Nothing is written to nodes or edges, and no `post_pending` is set (tested with triggers).
- **Deferred global work.** There is no PageRank write: the cascaded drop of the replaced nodes' rows is the only `pagerank` write, as the amended spec allows. Cache hits are not touched (`touch=false`) and only misses are inserted. There is no `docs/compass.md` write, no `indexed_at` change and no `recordCompassCall`. `post_pending` is set only when a file was re-extracted or removed.
- **Directory hashes.** `updateAncestorDirHashes` recomputes ancestors deepest-first from `files.hash` and the stored child rows. It drops the rows of emptied directories, and `n_files` matches the walk. Tests check equality with a fresh full walk, including deleting the only file in a directory.
- **`buildIndex` fast path.** The no-op fast path now also requires `!postPending(db)`. `clearPostPending` runs in the same transaction as `recomputeGlobalPagerank`. The integration test covers per-file run → full pass → no-op.

### Dangling-id fix (`detachFileNodes`)
- It is called before every node delete:
  - re-extraction in `writeFileFragment`, which serves both the full and per-file paths;
  - full-run removal and per-file removal, both through `removeFileRows`.
- `nodes WHERE file_id = ?` also covers the hidden file-owner node, so import edges into a re-extracted or removed file are reset too. `resolveImportEdges` (always unscoped) then re-points them.
- **Red evidence.** `reports/.red-dangling.txt` shows the reused-rowid failure (`bar → added` with `dst: 3` instead of `foo` with `dst: 4`) on the full path before the fix. This is exactly the case fix-explore's post-hoc `NOT EXISTS` reset cannot see.
- **No regression to fix-explore.** The full run calls `resolveEdges(db)` unscoped, so detached edges re-resolve under the same member, builtin, alias and barrel rules. The only behavior change is that edges into a re-extracted file are re-ranked, which moves the result closer to a fresh index. `is_member = 1` edges are never bound, so detaching does not affect them.
- **Per-file scope.** The scope is the re-extracted file plus the owners returned by `detachedOwners`. `resolveEdges`'s `dst_name IN (names defined in fileIds)` clause covers D16's third set. The resolution-equivalence test against a fresh index passes.

### Docs, help, Covers tags, update note
- `docs/compass.md` is edited only in the hand-written prose: the "Reindex on edit" section and the freshness paragraph, both above the `speclaw:map` markers. The shipped template, README and `help.ts` (registry entry plus `GLOBAL_HELP` line) are consistent with the code, including the deferral and "not covered" caveats.
- `update.ts` has a 2.0.11 migration note.
- `CLAUDE.md` and `AGENTS.md` are untouched (D12).
- Covers tags are present for `req~reindex-on-edit~1`, `req~edge-ids-survive-reindex~1`, `req~index-noop-fast-path~1` and `req~edit-reindex-hook~1`.
- Compass imports nothing from foundation. `shared/paths.ts` imports only `node:`.

### Bench (`scripts/bench/reindex-file.mjs`, `reports/.bench-reindex.md`)
- All writes go into an `os.tmpdir()` sandbox. HOME is sandboxed. A local shim keeps the hook from resolving a global binary or npx. The bench waits for each detached child, so timed runs never overlap.
- Budgets pass:

| Budget | Result |
|--------|--------|
| C hook median < A index-noop median (branch) | 59.1 ms < 234.5 ms |
| D reindex-file median (branch) < B index-one-edit median (main) | 289.6 ms < 488.7 ms |
| Branch A index-noop median ≤ main | 234.5 ms ≤ 234.6 ms |

## Advisories (non-blocking)

**A1. A full run can now race a per-file child.** `buildIndex` reads `existing` and `prevRoot` before its deferred `BEGIN` (`src/modules/compass/indexer.ts`, `buildIndex`).
- **What happens.** If a hook child commits a *new* file's row (an agent `Write` that creates a file) between that read and the full run's insert, `insFile` hits `UNIQUE(files.path)` and the whole full run rolls back.
- **Where it matters.** `speclaw watch` has a 400 ms debounce that sits right at the child's ~350 ms total. It swallows the error, so the cost is staleness until the next change. An agent calling `compass_index` right after creating a file would see an error.
- **Why it is not blocking.** The failure recovers itself: `post_pending` stays set, and the next full run completes.
- **Follow-up.** D9's claim that "SQLite serializes them" holds for `indexFiles` but not for `buildIndex`'s pre-transaction snapshot. Either re-read `existing` inside the transaction, or make `insFile` an upsert on `path`. Track it as a follow-up change rather than in this one.

**A2. The spec contradicts itself on output.** `req~reindex-on-edit~1` says the command "SHALL print nothing on stdout or stderr", but D25 (TTY → usage) and the existing `--help` scenario both print usage. Before sync, add a carve-out to the requirement text, for example "except usage for `--help` or when stdin is a terminal".

**A3. The child is spawned for files that will be skipped.** The hook parent spawns a child even for targets the child will classify as ineligible (`README.md`, `.ipynb`, `node_modules/…`). Each costs one Node start (~60 ms, detached). This is acceptable under D20. A cheap extension check in the parent would avoid it, but it is optional.

**A4. Removed files may leave coverage rows behind.** `removeFileRows(w, fileId, _rel)` never uses `rel`, so a removed file's file-level `coverage_links` rows (`node_id` NULL) survive. Node-bound rows cascade. This looks pre-existing in the full-run removal path, but per-file removal now uses the same helper. Either confirm it is pre-existing and record that in `backend.md`, or call `w.delCoverage.run(rel)` there.

**A5. Tree-sitter may start up while the write lock is held.** `indexFiles` awaits `extract()`, whose first call in the process lazily initializes tree-sitter, inside `BEGIN IMMEDIATE`. That stretches the lock-hold time per child. Warming the language before `BEGIN` would shorten it. This is optional.

**A6. A small TOCTOU window exists in `openCurrentDb`.** It probes the schema and then opens read-write without re-checking inside the transaction. A different-version full run could migrate between the two steps. The odds are negligible. A one-line `readSchemaVersion` re-check after `BEGIN IMMEDIATE` would close it.

**A7. Test gaps (optional).**
- No test covers a symlink inside the root that points outside it, for either `insideRoot` or `classifyIndexPath`.
- No test covers a case-variant path on a case-insensitive filesystem. `realPathOf` uses `fs.realpathSync`, not `.native`, so it does not canonicalize case and could create a second `files` row. That is unlikely, because Claude Code passes the exact path.

**A8. Bench caveats for `performance.md`.**
- `main` (7d78802) predates fix-explore, so B/main vs B/branch (+3.9%) mixes both changes.
- In a full run the `detachedOwners` SELECT result is unused, because resolution is unscoped. Skipping it when the owners are not needed would remove a small cost.
- Record both points in `performance.md`.

**A9. The 2.0.11 note depends on the version bump.** The coordinator must bump `package.json` to 2.0.11 so the `update.ts` migration note applies.

## Remaining before archive (not reviewer scope)

- 6.1: `npm run check`, `npm run build`, `npm test`, `lawbook_change validate`, and coverage with `onlyDefects`.
- 8.1: tester manual verification in scratch repos.
- 9.1: the reports `backend.md` (with the red output), `hooks.md`, `cli.md`, `performance.md` and `docs.md`.
- 11.1: sync and archive, in the binding order harden → fix-explore → reindex-on-edit.

## Rework 1 — re-review

- Scope: tasks.md "Rework 1" R1.1–R1.6 and design "Rework 1 notes" (advisories A1, A2, A4, A6, A8). 2026-10-07. Compass calls: 1 (`compass_find isCurrentIndex`, no hits because the session index is stale). After that I read the files directly.

### Verdict: **PASS**

All five advisories are resolved. Each fix in `reports/.red-a1.txt` has red evidence: 3/3 tests fail before the fix with the expected errors (`UNIQUE constraint failed: files.path`, the leftover `node_id: null` coverage row, and `stale false !== true`). The implementer reports 916/916 green, and the tester still owns re-running the gates under 6.1.

### Findings

- **A1 (`buildIndex`, `src/modules/compass/indexer.ts`).** `BEGIN IMMEDIATE` now runs before `needsReindex`, the `files` read, the `prevRoot` read and `postPending`, all of which are inside the `try`.
  - **Migrations.** `openDb` migrations commit their own `BEGIN IMMEDIATE` transactions (`db.ts`), and `rehydrateAnchors` autocommits, both before `buildIndex` starts its transaction. There is no nested `BEGIN`.
  - **Deadlock.** None is possible with `indexFiles`. Both take RESERVED up front with a 5 s busy timeout, so neither upgrades a read lock.
  - **Callers.** watch, `compass_index`, session-start, `index` and `init` all call the same function and are unaffected.
  - **Test.** The test ("a full run absorbs…") uses `busy_timeout = 0` from `onProgress`, which runs inside the transaction. It shows the external insert is blocked and the new file is indexed exactly once.
- **A2.** The `req~reindex-on-edit~1` text (`specs/code-graph/spec.md` around line 1149) now carves out usage on stdout for `--help` and for no arguments on a terminal. It agrees with D25 and the `--help` scenario.
- **A4.** `removeFileRows` calls `w.delCoverage.run(rel)` before `delFile`, and both the per-file path and the full-run path use it. The test covers both paths. The red note confirms the full-run leak existed before this change.
- **A6.** `isCurrentIndex` (`db.ts`) is the single check. `openCurrentDb` uses it for the probe, and `indexFiles` re-runs it right after `BEGIN IMMEDIATE`. If the index has changed, `indexFiles` rolls back, returns `stale: true` and writes nothing: the early return goes through the outer `finally`, which closes the connection. The cross-process holder test shows the graph is unchanged and no `post_pending` is set. If `readSchemaVersion` throws under the lock, the guarded `ROLLBACK` runs and the error is rethrown, then swallowed by `runReindexFile`, so nothing is written in that case either.
- **A8.** `collectOwners: !touch` means full runs skip the `detachedOwners` SELECT. Detaching still happens on every path. The bench caveats are recorded.

### New advisories (non-blocking)

- **B1. A new file can still be dropped silently after the walk (`buildIndex`).** `walkFiles` runs before `BEGIN IMMEDIATE`. Suppose a hook child creates and commits a new file's row after the walk has passed that file's directory but before the lock. The full run then sees the row in `existing` but not in `seen`, and `removeFileRows` drops it.
  - This no longer causes an error or a rollback. The file is missing until the next edit or full run.
  - The window is the walk's duration, so it only matters on large trees.
  - Fix options: run the walk after the lock, or check that a file is absent from disk before removing an unseen row. A follow-up change is enough.
- **B2. A failed `BEGIN IMMEDIATE` leaks the connection (`buildIndex`).** The `BEGIN IMMEDIATE` call sits outside the `try`/`finally`. On `SQLITE_BUSY` after 5 s, it throws without `db.close()`, which leaves a leaked handle in the long-lived MCP or watch process.
  - Separately, the unconditional `ROLLBACK` in `catch` can hide the original error if SQLite has already rolled back. This is older than the rework.
  - Mirror `indexFiles`: move `BEGIN IMMEDIATE` inside the `try` and guard with `if (db.isTransaction)`.
- **B3. One Rework 1 note overstates the lock behavior.** The note says per-file children "see no new wait", which is not quite true for no-op full runs. Before the rework, a no-op run took the write lock only at its final `meta` write. It now holds the lock for the whole stat loop (about 230 ms in the bench). That is well inside the 5 s busy timeout, so it does no harm. Reword the note when convenient.

## Rework 2 — re-review

- Scope: tasks.md "Rework 2" R2.1–R2.4 and design "Rework 2 notes" (B1, B2, B3). 2026-10-07. Compass calls: 1 (`compass_explore buildIndex`, not found because the session index is stale). After that I read `src/modules/compass/indexer.ts`, `src/shared/paths.ts`, `test/unit/index-files.test.ts` and `reports/.red-b1.txt` directly.

### Verdict: **FAIL** (one blocking regression in the B1 fix, small and local)

### What holds

- **B2 is resolved.**
  - `afterWalk` and `BEGIN IMMEDIATE` sit inside the `try`.
  - `catch` rolls back only `if (db.isTransaction)`, then rethrows.
  - `finally` always closes the connection.
  - The `onOpen` test (`busy_timeout = 0` plus a held lock) proves the connection is closed and the error rethrown. The red output in `.red-b1.txt` shows `true !== false` before the fix.
  - The remaining setup outside the `try` (`loadAffectedConfig`, `prepareFileWriter`, `walkFiles`) is older than this change.
- **The B1 mechanics are sound.**
  - No file is visited twice. `visit` adds `rel` to `seen`, and each `existing` key is unique.
  - The counters are sane:
    - A row a child has already indexed hits the stat skip and counts under `skippedByStat`/`unchanged`.
    - A changed file goes through `writeFileFragment`.
    - `removed` counts only ineligible rows.
  - `fileHashes` ends up holding the new hash (or the prior hash if `visit` returns early), so the dir hashes and root are correct.
  - The fast path is not regressed. The child's `post_pending` marker still forces the full pass, and that pass clears it.
  - The red evidence (`0 !== 1`) and the follow-up "next full run agrees, `removed` 0" assertion are good.
- **The test seams do not leak.** `hooks` appears only on the options object and is documented as a test seam. No production caller passes it: `register.ts` passes only `{ force, prune }`, and the watcher, session-start, index-build and init pass none.

### Blocking finding

**R2-1. An unseen row that still stats now survives every full run, even when the walk can no longer reach it under that spelling (`buildIndex`, the unwalked-rows loop, `src/modules/compass/indexer.ts` around lines 1049–1065).**

- **Why it happens.** `classifyIndexPath(projectPath, abs).eligible` only asks whether *some* file stats at that path. It does not ask whether the walk would yield this `rel`, and `realPathOf` uses `fs.realpathSync`, which does not canonicalize case.
- **Case-only rename on case-insensitive APFS (this repo's platform).** The user renames `Foo.ts` to `foo.ts`:
  - The walk inserts `foo.ts`.
  - The old row `Foo.ts` is unseen, but `statSync("Foo.ts")` succeeds, so it counts as eligible.
  - `visit` then keeps it. Its mtime and size match, so it hits the stat skip.
- **Directory replaced by an in-root symlink.** `classifyIndexPath` resolves the symlink and reports eligible. The walk never descends into symlinked directories, so the stale row is re-indexed under the link path on every run.
- **Effect in both cases.** Two `files` rows hold the same symbols forever. `--force` does not remove them, because it still goes through the same check. The result is duplicate nodes, so cross-file calls resolve as ambiguous instead of `exact` in impact and trace. That is the exact class of problem `req~edge-ids-survive-reindex~1` exists to prevent.
- **Not pre-existing.** HEAD and Rework 1 removed every unseen row, so a fresh full run converged.

### Rework guidance

- Keep an unseen row only when the walk itself would yield that exact `rel`:
  - every path segment exists with exactly that spelling (compare `readdirSync(parent)` entries), and
  - no segment is a symlink (`lstat`: directories are real directories and the leaf is a regular file, matching `walkFiles`' `Dirent` checks), and
  - `classifyIndexPath(...)` is still eligible with `c.rel === rel`.

  Otherwise call `removeFileRows`. Doing the exact-spelling check through `fs.realpathSync.native`, and comparing its relative form to `rel`, is an acceptable alternative.
- Add a test in `test/unit/index-files.test.ts`:
  - Index `lib/Case.ts`, rename it to `lib/case.ts`, run `buildIndex`, and expect exactly one `files` row, `lib/case.ts`, with `removed` = 1.
  - Skip the test when the temp filesystem is case-sensitive.
  - Optionally add the symlinked-directory variant.
  - Record the red output first, as you did for B1.
- Optionally add one line to the design's "Rework 2 notes" stating the exact-spelling/no-symlink condition.

Everything else in Rework 2 can stay as it is.

## Rework 3 — re-review

- Scope: tasks.md "Rework 3" R3.1–R3.5 and design "Rework 3 notes" (R2-1). 2026-10-07. Compass calls: 0. The session index is stale, as in the earlier rounds, so I read `src/modules/compass/indexer.ts` (`canonicalPathOf`, `classifyIndexPath`, `walkWouldYield`, `walkFiles`, the `buildIndex` unwalked-rows loop, the `indexFiles` guard), `test/unit/index-files.test.ts` and `reports/.red-r2-1.txt` directly.

### Verdict: **PASS**

R2-1 is resolved. I found no correctness regression and no data-loss path.

### Findings

- **`walkWouldYield` (around line 148) mirrors `walkFiles`.**
  - It rejects any empty, `.` or `..` segment.
  - Each segment must appear in its parent's `readdirSync` listing with exactly that spelling. This is a case- and byte-exact `Set` lookup on the same names the walk's `Dirent`s carry.
  - It uses `lstat`, so a directory segment must be a real directory that is not skipped, and the leaf must be a regular file. Symlinks fail, just as `Dirent.isDirectory()`/`isFile()` exclude them in the walk.
  - It then requires `classifyIndexPath` to be eligible with `c.rel === rel`, which adds the language and size checks.
  - The listing cache is per run (`new Map()` at around line 1127), so it never goes stale across runs. Within a run it lives only inside the write lock.
- **`canonicalPathOf` uses `fs.realpathSync.native`.** It walks up to the nearest existing ancestor and keeps a missing tail as given, falling back to `realPathOf` on other errors. It canonicalizes both the root and the target, so a root that is a symlink (for example `/tmp` → `/private/tmp`) or a case variant produces the same relative path on both sides.
- **The `indexFiles` guard (around line 1329)** turns an eligible but non-walkable spelling into `ignored`. It never writes a second row and never deletes anything. The case-variant and symlinked-directory tests show the walk's spelling is the one registered.
- **Red evidence.** `.red-r2-1.txt` shows 3 of 5 targeted tests failing before the fix: the case-only rename (`0 !== 1`), the directory replaced by a symlink (`0 !== 1`), and the case-variant `indexFiles` (`LIB/Other.ts` vs `lib/other.ts`). The new tests cover the exact-spelling, missing, skip-dir, language, dot-segment, symlink and cache cases. Case-sensitive filesystems and Windows symlink cases are skipped.

### Could legitimate rows be removed? No.

- **Rows the walk yields are never checked.** `walkWouldYield` runs only for rows that are not in `seen`, so any file the walk yields this run is never put through the check.
- **The worst case recovers.** For a row the walk did not yield, a false negative removes that row. That is the HEAD and Rework 1 behavior, and the next edit or full run brings the file back. A false negative in `indexFiles` only skips the write.
- **NFC/NFD on macOS.** APFS preserves the normalization it stores, and HFS+ stores NFD. Both `readdir` and `realpath.native` return the stored bytes, so `rel` agrees with them.
- **Windows separators.** `rel` stays `/`-joined, and `path.join` and `split(path.sep)` normalize it.
- **Very deep paths.** The check is iterative, with no recursion.

### Follow-ups (non-blocking)

- **C1. A case variant from the hook leaves the old row behind.** Once a case-only rename has happened, a hook edit to `foo.ts` indexes `foo.ts` but leaves the old `Foo.ts` row until the next full run. That run removes it now, but the two rows co-exist in the meantime. Optionally, `indexFiles` could drop rows that are equal case-insensitively but no longer walkable.
- **C2. Some edge cases are untested.** There is no test for an NFC/NFD filename or for a root that is reached through a symlink, such as a macOS `/var` tmpdir. The reasoning above covers both, and the tmpdir case is likely already exercised implicitly.
