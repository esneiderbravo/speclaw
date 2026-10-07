# Tasks — reindex-on-edit

Ships in **2.0.11** on `feat/reindex-on-edit` (stacked on
`fix/explore-tests-and-callees` = 2.0.10). The coordinator owns the version
bump and the CHANGELOG entry.

**Start condition.** Begin implementation only after **both**
`harden-update-lock-and-cli` and `fix-explore-tests-and-callees` are archived,
or at least have test PASS with no rework pending.
- `harden-update-lock-and-cli` shares `src/cli/index.ts`,
  `src/cli/lib/help.ts`, and `test/helpers/cli.ts`.
- `fix-explore-tests-and-callees` shares `src/modules/compass/indexer.ts`, and
  provides `resolveEdges(db, fileIds?)`, the hidden file-owner node, and schema
  11.

Sync order: `harden-update-lock-and-cli` → `fix-explore-tests-and-callees` →
`reindex-on-edit`. This change owns the dangling `dst_node_id` fix.

Do not edit the strict lock paths `CLAUDE.md` or `AGENTS.md` (design D12).
Compass must not import foundation.

## 0. Branch

- [x] 0.1 Step 0: Create the feature branch (must be first). The branch
  already exists and is checked out: `feat/reindex-on-edit`.

## R0. Re-base on fix-explore-tests-and-callees (planner/coordinator)

- [x] R0.1 Once `lawbook/changes/fix-explore-tests-and-callees/specs/code-graph/spec.md`
  exists, re-base this change's `code-graph` delta on it. The new copy is that
  file plus this change's edits:
  - the header sentences;
  - the amended "Per-file fragment independence";
  - the `post_pending` clause and scenario in `req~index-noop-fast-path~1`;
  - `req~reindex-on-edit~1`;
  - `req~edge-ids-survive-reindex~1`.

  Keep fix-explore's schema 11 text. If fix-explore fixed the dangling ids
  itself, drop `req~edge-ids-survive-reindex~1` here so there is a single owner.
  Re-run `lawbook_change validate`. Repeat this re-base if fix-explore's delta
  changes again before it syncs.
  *Done:* re-based on the canonical spec (fix-explore and harden are synced).
  `req~edge-ids-survive-reindex~1` is kept but narrowed to the reused-rowid
  case, which fix-explore's post-hoc reset cannot see (see proposal "R0.1
  outcome"). The law-enforcement delta is canonical plus this change's hunks.
- [x] R0.2 After fix-explore lands, re-locate the `indexer.ts` line references
  in design §1–§2 and confirm that the signature and scope of
  `resolveEdges(db, fileIds?)` match D16/D17.

## 1. Dangling destination ids — defect (design §1)

- [x] 1.1 Regression first. Add `test/integration/edge-ids.test.ts` (design
  §1.1). The fixture has `b.ts` calling `foo` in `a.ts`. Re-extract `a.ts`
  through `buildIndex`. Expect `bar` among the `exact` callers of `foo`, and
  zero edges whose `dst_node_id` is missing from `nodes`. Run the test and save
  the failing output to `reports/.red-dangling.txt`. Tag it
  `// Covers: req~edge-ids-survive-reindex~1`.
- [x] 1.2 In `src/modules/compass/indexer.ts`, add `detachFileNodes(db, fileId)`
  and call it before every node delete in `buildIndex`: re-extraction and
  removal of a deleted file, including the hidden file-owner node. Rely on
  fix-explore's `resolveEdges` to re-point the edges (design §1.2). Add
  `// Covers: req~edge-ids-survive-reindex~1`. Re-run 1.1 green.
- [x] 1.3 Add the removed-symbol and removed-file cases to the same test file.
  The removed-symbol case leaves the edge NULL and impact does not report `bar`
  as `exact`. The removed-file case leaves no dangling id.

## 2. Compass `indexFiles` (design §2)

- [x] 2.1 Export one file-eligibility predicate (skip-dir segments, language,
  size cap, and any other walk filter) and use it in both the full walk and
  `indexFiles` (D22).
- [x] 2.2 Factor the per-file extract body (`:367-494`) into a function used by
  both `buildIndex` and `indexFiles`. Keep `buildIndex` behavior byte-for-byte
  equal, apart from the §1 fix.
- [x] 2.3 Implement `indexFiles(projectPath, paths)` exactly as in design §2.2:
  - no DB means no create;
  - a stale schema writes nothing;
  - the file is read after `BEGIN IMMEDIATE` (D14);
  - unchanged content is a no-op;
  - a missing file is removed;
  - resolution calls `resolveEdges(db, fileIds)` over the D16 union, with no
    resolution SQL of its own;
  - no schema change (`meta.post_pending` is a `meta` row);
  - ancestor `dir_hashes` are recomputed;
  - `meta.post_pending` is set when anything was written;
  - PageRank, eviction, map, `meta.indexed_at`, and the call log are not
    touched.

  Export it from the compass barrel. Add `// Covers: req~reindex-on-edit~1`
  and `// Covers: req~edge-ids-survive-reindex~1`.
- [x] 2.4 `buildIndex`:
  - the no-op fast path also requires that `meta.post_pending` is absent;
  - a full post-processing pass deletes the marker.

  Add `// Covers: req~index-noop-fast-path~1`.
- [x] 2.5 Add `test/unit/index-files.test.ts`, covering every case in design §6
  for `indexFiles`. Include the ancestor `dir_hashes` equality with a fresh full
  walk and the resolution equivalence with a fresh full index. Also add the
  edge-ids scenario through `indexFiles` to `test/integration/edge-ids.test.ts`,
  and the "per-file run, then `speclaw index` runs the full pass" case. Tag
  them with the requirement ids.

## 3. CLI `speclaw reindex-file` (design §3)

- [x] 3.1 Add `src/cli/commands/reindex-file.ts`:
  - path mode runs in the foreground;
  - hook mode reads stdin (TTY → usage, D25), takes `file_path` /
    `notebook_path`, resolves against the payload `cwd`, guards on the index
    and the root, and spawns the detached child (D21);
  - it never prints, always exits 0, and swallows `SQLITE_BUSY` and every other
    error;
  - the Compass import is dynamic, on the path-mode branch only (D20).

  Add `// Covers: req~reindex-on-edit~1`.
- [x] 3.2 Wire `src/cli/index.ts`:
  - dynamic-import dispatch;
  - no `maybeNotifyUpdate`;
  - not in `HEADER_COMMANDS`.

  In `src/cli/lib/help.ts`, add the `COMMANDS` entry with usage and the
  `GLOBAL_HELP` line.
- [x] 3.3 Add `test/integration/reindex-file.test.ts`, covering every CLI case in
  design §6:
  - detachment while the lock is held;
  - overlapping-edit freshness;
  - not logged;
  - silent;
  - help lists the command.

  Confirm `test/e2e/cli.test.ts` picks up `reindex-file` from `COMMANDS`. Tag
  the tests with `// Covers: req~reindex-on-edit~1`.

## 4. Hooks (design §4)

- [x] 4.1 In `src/modules/foundation/hooks.ts`:
  - add `speclawCommand(sub)` (D11), and keep `SESSION_START_COMMAND`
    byte-identical;
  - add `REINDEX_FILE_MARKER` to `isSpeclawHook`;
  - widen `CompiledByEvent.PostToolUse`;
  - append the separate reindex group in `compileHooks`, with matcher
    `MUTATION_MATCHER`, type `command`, timeout 10, and no other key.

  Add `// Covers: req~edit-reindex-hook~1`.
- [x] 4.2 Extend `test/unit/hooks.test.ts` with the compile/merge and sh-stub
  cases in design §6. They include "the local stub receives the stdin JSON
  bytes" and "an old binary on `PATH` changes nothing". Extend
  `test/integration/hooks.test.ts` for the init-written settings. Tag the tests
  with `// Covers: req~edit-reindex-hook~1`.

## 5. Review and update the affected tests

- [x] 5.1 Review and update the affected tests. Run
  `speclaw affected-tests --from-diff main`, review every selected file, and
  confirm that `hooks` (unit and integration), `session-start`, the
  fix-explore regression suites, `indexer`/index
  suites, `query`/impact suites, `e2e/cli`, `integration/scaffold`, and
  `contract/registers` are green.

## 6. Quality gates

- [x] 6.1 Run the quality gates and verify they pass (see
  docs/standards/testing-standards.md): `npm run check`, `npm run build`, and
  `npm test`. Also run `lawbook_change validate` for this change and
  `lawbook_change` action `coverage` with `onlyDefects: true` for
  `req~reindex-on-edit~1`, `req~edge-ids-survive-reindex~1`,
  `req~index-noop-fast-path~1`, and `req~edit-reindex-hook~1`.

## 7. Performance (design §5)

- [x] 7.1 Add `scripts/bench/reindex-file.mjs`, modeled on
  `scripts/bench/session-start.mjs`, using throwaway worktrees of `main` and the
  branch under `os.tmpdir()`. Measure the four metrics A–D, with 3 warm-ups and
  ≥20 runs each, and record the median and p95. Check the budgets: C median <
  A median (branch), D median < B median (main), and the branch no-op `index`
  median ≤ the main median.

## 8. Manual verification (tester executes it, never the user)

- [x] 8.1 Perform manual verification of the behavior — the tester role
  executes this itself, never the user. Use the built CLI in scratch repos
  under `os.tmpdir()` only:
  - `init` (Claude Code) and check `.claude/settings.json`. It must hold one
    `PostToolUse` group with matcher `Write|Edit|MultiEdit|NotebookEdit` and a
    command containing `speclaw reindex-file`, timeout 10, and no `async` key.
    Run `update --no-self-update` twice and check that there is still exactly
    one such group and that a hand-added user `PostToolUse` command hook
    survives.
  - Run `speclaw index`. Edit a function. Pipe an `Edit` payload into the
    compiled hook command through `sh -c`. Check that it exits 0 with no output,
    that `speclaw query`/`compass_explore` shows the edited source within a few
    seconds, that the `docs/compass.md` bytes and mtime are unchanged, and that
    `.speclaw/compass-calls.jsonl` is unchanged.
  - Run `speclaw reindex-file` on a deleted file, on `node_modules/x.ts`, on
    `README.md`, and on a path outside the root. All print nothing, exit 0, and
    leave no stale rows.
  - After a per-file run, run `speclaw index`. It runs the full pass and writes
    the map.
  - Dangling fix: impact for an edited file's function still lists its
    cross-file callers as `exact`.
  - A stub `speclaw` that exits 1 on unknown commands, placed first on `PATH`:
    the hook command exits 0 and `.speclaw/` is unchanged.

## 9. Discipline reports

- [x] 9.1 Produce the discipline reports under reports/ — one per discipline
  touched — with the unit/integration/e2e results for what the feature
  touched. Each follows the required structure and maps every `#### Scenario`
  of both delta specs. Expected:
  - `backend.md`: `indexFiles`, the eligibility predicate, `post_pending`, and
    the dangling-id fix, with the **red-before-green** output from
    `reports/.red-dangling.txt`.
  - `hooks.md`: the compiled reindex hook, merge idempotence, the sh-stub matrix
    (stdin pass-through, old binary, offline npx, failure swallowed).
  - `cli.md`: `reindex-file` path and hook modes, silence and exit 0,
    detachment, help, not logged.
  - `performance.md`: metrics A–D for main and the branch, median and p95,
    budgets, machine and Node version.
  - `docs.md`: what was updated, and the D12 flag (CLAUDE.md/AGENTS.md not
    edited).
  - `api.md` is not owed (proposal, "API surface"). State the justification in
    `backend.md`.

## 10. Documentation

- [x] 10.1 Update the technical documentation touched by the change:
  - `docs/compass.md` (hand-written prose, not the map block) and
    `src/modules/foundation/assets/docs/compass.template.md`: the freshness
    model, the PageRank/map deferral, and what is not covered (Bash renames,
    non-Claude agents);
  - `README.md`: the hook paragraph;
  - `help.ts`: the usage text (task 3.2).
- [x] 10.2 Hand the coordinator the 2.0.11 CHANGELOG lines: "Compass re-indexes
  each file an agent edits (`PostToolUse` → `speclaw reindex-file`, detached and
  silent)" and "fix(compass): editing a file no longer drops its cross-file
  callers from impact/trace (dangling `dst_node_id`)". Also flag D12 to the
  human: the optional `CLAUDE.md`/`AGENTS.md` mention needs their TTY
  `laws accept`.

## Rework 1 (review advisories A1, A2, A4, A6, A8)

- [x] R1.1 A1: regression first ("a full run absorbs a per-file write that
  lands after it starts", `test/unit/index-files.test.ts`; red output in
  `reports/.red-a1.txt`: `UNIQUE constraint failed: files.path`). Fix:
  `buildIndex` takes `BEGIN IMMEDIATE` before reading the stored file set,
  `prevRoot`, and `needs_reindex`, so a per-file child waits for the full run
  instead of committing a row under it.
- [x] R1.2 A2: `req~reindex-on-edit~1` carves out usage on `--help` and with no
  arguments while stdin is a terminal (D25).
- [x] R1.3 A4: `removeFileRows` deletes the removed file's `coverage_links`
  (file-level rows have no node to cascade from), on both the per-file and the
  full-run path. The full-run leak was pre-existing (HEAD removed only the
  `files` row). Test: "removing a file drops its file-level coverage links
  (per-file and full run)"; red in `reports/.red-a1.txt`.
- [x] R1.4 A6: new `isCurrentIndex(db)` in `db.ts`, shared by the
  `openCurrentDb` probe and a re-check in `indexFiles` right after
  `BEGIN IMMEDIATE`; on a change it rolls back and returns `stale: true` with
  nothing written. Test: "indexFiles writes nothing when a full reindex is
  flagged while it waits" (a second process holds the lock and sets
  `needs_reindex`); red in `reports/.red-a1.txt`.
- [x] R1.5 A8: bench caveats (main predates fix-explore; owners query) in
  `scripts/bench/reindex-file.mjs` output and `reports/.bench-reindex.md`; full
  runs skip the detached-owners SELECT (`FileWriter.collectOwners`).
- [x] R1.6 `npm run build`, `npm run check`, full `npm test` (implementer
  run; the tester re-runs gates under 6.1).

## Rework 2 (re-review advisories B1, B2, B3)

- [x] R2.1 B1: regression first ("a full run keeps a file a per-file run
  indexed after the walk", `test/unit/index-files.test.ts`, via the
  `hooks.afterWalk` seam; red in `reports/.red-b1.txt`: `0 !== 1`). Fix: before
  removing a stored row the walk did not see, `buildIndex` checks it with
  `classifyIndexPath`. If the file is still eligible, it is indexed in the same
  run; otherwise its rows are removed. New scenario "A full run keeps a file a
  per-file run indexed after its walk" in the `code-graph` delta.
- [x] R2.2 B2: regression first ("a full run that cannot take the lock closes
  its connection and rethrows", via the `hooks.onOpen` seam with
  `busy_timeout = 0` while a second connection holds the lock; red in
  `reports/.red-b1.txt`: the connection stayed open). Fix: `BEGIN IMMEDIATE`
  moved inside the `try`/`finally`, and `ROLLBACK` guarded by
  `db.isTransaction`.
- [x] R2.3 B3: reworded the design's "Rework 1 notes" lock sentence. Added
  "Rework 2 notes".
- [x] R2.4 `npm run build`, `npm run check`, full `npm test` (implementer run;
  the tester re-runs gates under 6.1).

## Rework 3 (re-review finding R2-1)

- [x] R3.1 Regression first, in `test/unit/index-files.test.ts`: "a full run
  drops the old row of a case-only rename" (skipped on a case-sensitive
  filesystem, detected by a probe file), "a full run drops rows under a
  directory replaced by a symlink", and "indexFiles registers a case-variant
  path under the walk's spelling". Red in `reports/.red-r2-1.txt` (`0 !== 1`,
  `0 !== 1`, `['LIB/Other.ts']` vs `['lib/other.ts']`). The B1 test ran green in
  the same red run and stays green. "indexFiles through a symlinked directory
  registers the real path" was added as a guard; it was already green.
- [x] R3.2 Fix: new exported `walkWouldYield(projectPath, rel, listings?)` in
  `src/modules/compass/indexer.ts`. It is true only when every segment is
  listed by its parent with exactly that spelling, every directory segment is
  a real (non-symlink, non-skipped) directory, the leaf is a regular file, and
  `classifyIndexPath` is eligible with `rel` unchanged. `buildIndex` keeps an
  unwalked row only when it holds (one listing cache per run); otherwise
  `removeFileRows`.
- [x] R3.3 Per-file path: `classifyIndexPath` now resolves through
  `fs.realpathSync.native` (fallback `realPathOf`), so a case variant yields
  the on-disk spelling where the platform reports it. `indexFiles` also skips
  (`ignored`) any eligible path for which `walkWouldYield` is false, so it can
  never register a path a full run would drop.
- [x] R3.4 Unit tests for `walkWouldYield` (exact path, missing leaf or
  directory, a file used as a directory, unindexed language, skipped
  directory, dot or empty segments, case variants, symlinked directory and
  file, listing cache). Two scenarios added to the `code-graph` delta.
- [x] R3.5 `npm run build`, `npm run check`, full `npm test` (implementer run;
  the tester re-runs gates under 6.1).

## 11. Archive

- [x] 11.1 Archive the change within the same PR (lawbook:archive) after
  harness review/test PASS. Reconcile and `sync` the delta specs, then run
  `lawbook_archive`. **Sync order:** `harden-update-lock-and-cli` syncs and
  archives first. This change's `law-enforcement` delta is a full copy of that
  change's delta plus `req~edit-reindex-hook~1`, the merge-marker edit, and the
  header sentence. If the sibling delta changed before its sync, re-apply it
  here first. For `code-graph`, `fix-explore-tests-and-callees` syncs and
  archives first. This delta must already be re-based on fix-explore's delta
  (R0.1). Re-check it against the canonical spec after fix-explore syncs, and
  re-apply this change's edits if they differ.
