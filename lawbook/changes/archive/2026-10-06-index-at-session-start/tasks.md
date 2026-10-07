# Tasks — index-at-session-start

Ships in **2.0.7** together with `fix-compass-source-offsets`. Both changes
share the branch, the version bump, and one CHANGELOG entry.

## 0. Branch

- [x] 0.1 Step 0: Create the feature branch (must be first). It already
  exists: `fix/compass-source-and-session-index`, shared with
  `fix-compass-source-offsets`. It is checked out.

## 1. Hook compiler and merge identity (design §1)

- [x] 1.1 In `src/modules/foundation/hooks.ts`:
  - add `HookEvent = CheckEvent | "SessionStart"`, `SpeclawCommandHook`,
    `SESSION_START_MARKER`, and `SESSION_START_COMMAND` (exact command in
    design §1);
  - key `CompiledHooks.byEvent` by `HookEvent`.

  Do not widen `CheckEvent` or the `speclaw_check` zod enum.
- [x] 1.2 Make `compileHooks` always emit the `SessionStart` group for
  hook-capable agents: matcher `startup|resume|clear|compact`, one
  `{type:"command", command, timeout:30}`. Add
  `// Covers: req~session-start-hook~1`.
- [x] 1.3 Extend `isSpeclawHook` to recognize a `command` hook whose command
  contains `SESSION_START_MARKER`. Check that `mergeHooks` / `installForAgent`
  write no unknown keys and stay drift-free.
- [x] 1.4 Update the doc comments in `hooks.ts` that claim only
  `speclaw_check` hooks exist.

## 2. `speclaw session-start` (design §2)

Rewritten after rework (design D13): the mode is the top-level command
`speclaw session-start`, not an `index` flag. See section 11.

- [x] 2.1 Add the top-level command `speclaw session-start`
  (`src/cli/commands/session-start.ts`, `runSessionStart`, dispatched in
  `src/cli/index.ts`; originally an `index --session-start` flag, replaced in
  rework):
  - when `.speclaw/index.db` is absent, exit 0 without creating it;
  - print no header, no update notice, and no output;
  - ignore every flag;
  - wrap the run in `try/catch` and exit 0 on any error, including
    `SQLITE_BUSY`;
  - do not call `recordCompassCall`.

  Add `// Covers: req~session-start-index~1`.
- [x] 2.2 List `session-start` in the top-level usage; `speclaw index --help`
  does not mention it (the flag was removed).

## 3. No-op index fast path (design §3)

- [x] 3.1 In `buildIndex` (`src/modules/compass/indexer.ts`): when there is no
  force and no prune, nothing was re-extracted, nothing was removed, and the
  root is unchanged, skip the following:
  - the `dir_hashes` rewrite;
  - edge resolution, `resolveImportEdges`, and `recomputeGlobalPagerank`;
  - the embedding cache touch and eviction;
  - `writeCompactMap`, unless `docs/compass.md` is missing.

  Still write `meta.indexed_at` and return the full `IndexStats` (totals,
  `nextStep`). Add `// Covers: req~index-noop-fast-path~1`. Confirm the
  variable names and the transaction boundaries with `compass_explore
  buildIndex` first.

  Reconciled during implementation (delta spec updated): `writeCompactMap`
  never creates `docs/compass.md`, so the no-op exception is "the map block is
  empty" (`compactMapPending` in `map.ts`), not "the file is missing". An
  explicit `maxCacheMB` bypasses the fast path like `prune`, so
  `--max-cache-mb` on an unchanged project still evicts.

## 4. Review and update the affected tests

- [x] 4.1 Update `test/unit/hooks.test.ts`:
  - the `SessionStart` group is compiled with zero laws (matcher,
    `type: command`, `timeout: 30`, marker);
  - identity: the marker command is speclaw, a user command is not;
  - two merges give exactly one speclaw `SessionStart` entry;
  - a user `SessionStart` hook is preserved.
- [x] 4.2 Update `test/integration/hooks.test.ts`,
  `test/integration/scaffold.test.ts`, and `test/unit/install.test.ts`:
  - init writes the entry;
  - an update rerun produces no drift;
  - agents without hooks get no entry.
- [x] 4.3 Add `test/integration/index-session-start.test.ts` (renamed to
  `test/integration/session-start.test.ts` in rework) (via
  `test/helpers/cli.ts runCli`, temp dirs only). Cover:
  - no index: silent, exit 0, no DB created;
  - unchanged index: silent, exit 0, `docs/compass.md` bytes and mtime
    unchanged;
  - one changed file is re-extracted;
  - a DB locked by another connection's `BEGIN IMMEDIATE`: silent, exit 0;
  - the call log is unchanged;
  - the top-level help lists `session-start`; `index --help` does not.
- [x] 4.4 Add the indexer fast-path tests:
  - `dir_hashes` and `pagerank` are untouched on a no-op run;
  - the map is not rewritten;
  - `indexed_at` advances;
  - `--force` and `--prune` bypass the fast path;
  - a missing `docs/compass.md` is recreated.

  Done in `test/integration/index-noop.test.ts` with write-logging triggers;
  per the 3.1 reconciliation it covers an emptied map block being refilled,
  a missing file never being created, and an explicit cache cap bypassing the
  fast path.
- [x] 4.5 Add a shell-command test that runs `SESSION_START_COMMAND` with
  `sh -c` in temp dirs:
  - with no index;
  - with an index and a stub `node_modules/.bin/speclaw` that records its
    argv.

  Assert exit 0, empty output, and that the local binary wins.

  Done in `test/unit/hooks.test.ts` (also covers the `PATH` fallback and a
  failing stub). Tests pin `CLAUDE_PROJECT_DIR` to the temp dir.
- [x] 4.6 Run `speclaw affected-tests --from-diff main` and check that every
  selected test file was reviewed. Run the existing
  `test/integration/compass.test.ts` and `reindex.test.ts` no-op cases, which
  must stay green.

  `--from-diff main` saw no committed changes, so the selection used
  `--file` with the changed sources (registers, check, mcp-budget); all ran
  green with the hook, scaffold, reindex, compass, e2e, and new suites.
  `test/unit/install.test.ts` was reviewed: it covers only
  `copyRendered`/`ensureGitignore`, so it needs no hook assertions.

## 5. Performance benchmark (main vs branch, design §6)

- [x] 5.1 Add `scripts/bench/session-start.mjs` (or extend
  `scripts/bench/compass-first.mjs`). It needs:
  - throwaway worktrees of `main` and the branch, each built;
  - the benchmarks `index-noop` (main vs branch), `session-start-noop`, and
    `session-start-one-change`;
  - N ≥ 20, 3 warm-ups, and median/p95/min/max;
  - `--json` output and a markdown table.

  It must never write outside temp dirs.
- [x] 5.2 The tester runs it and records the real numbers. Budgets:
  - the branch `index-noop` median ≤ main's;
  - the `session-start-noop` p95 < 2 s on this repository.

## 6. Quality gates

- [x] 6.1 Run the quality gates and verify they pass (see
  docs/standards/testing-standards.md): `npm run check`, `npm run build`, and
  `npm test`. Run `lawbook_change validate` and
  `speclaw coverage --only-defects` for `req~session-start-hook~1`,
  `req~session-start-index~1`, and `req~index-noop-fast-path~1`.

## 7. Manual verification (tester executes it, never the user)

- [x] 7.1 Perform manual verification of the behavior — the tester role
  executes this itself, never the user. Use the built CLI in a scratch repo
  under `os.tmpdir()`:
  - run `init` and check that `.claude/settings.json` carries the
    `SessionStart` speclaw entry exactly once; re-run `update` and check that
    there is no duplicate;
  - run `session-start` with no index and check that it is silent,
    exits 0, and creates no DB;
  - run `index`, then `session-start`, and check that it is silent and
    that the `docs/compass.md` checksum is unchanged;
  - edit one file, run `session-start`, then `explore` the edited
    symbol and check that the edit is reflected;
  - pipe the hook command through `sh -c` and check exit 0 with empty
    output;
  - (review B2) with an older speclaw (e.g. the 2.0.6 global) first on
    `PATH` and no local binary, run the hook command and check that nothing
    is indexed, logged, or rewritten.

  Tester 2026-10-06: every check passes except the real-npx run (review R4).
  The npx branch makes one registry request (`GET /npm`, npm's update
  notifier) despite `npm_config_offline=true` (`reports/hooks.md`). Left open
  for rework.

  Tester re-test after rework 2 (2026-10-06): the shipped command made 0
  registry requests in 3 fresh-cache real-npx runs against a trap server (the
  control without the notifier prefix made 1). Regression (a)–(d) passed again.
  This repo's settings hold exactly one `SessionStart` entry, equal to the
  constant. R5: `runHookCommand` now blanks both npm settings.

## 8. Discipline reports

- [x] 8.1 Produce the discipline reports under reports/ — one per discipline
  touched — with the unit/integration/e2e results for what the feature
  touched. Expected: `hooks.md` (hook wire format and merge), `cli.md`
  (`session-start` contract), `backend.md` (indexer fast path),
  `performance.md` (main vs branch), and `docs.md`. No HTTP or MCP API
  surface changes, so `api.md` is not owed; state this in `cli.md`. Each
  report follows the required structure, and every `#### Scenario` in the
  delta specs is mapped.

## 9. Documentation and release

- [x] 9.1 Update the technical documentation touched by the change:
  - the session-start refresh, the skip-when-absent rule, and the one-time
    `refreshedDiverged` on update in `docs/compass.md` and
    `src/modules/foundation/assets/docs/compass.template.md`;
  - `src/modules/foundation/assets/{CLAUDE,AGENTS}.template.md`;
  - the repo `CLAUDE.md` (Rule 1 and the operator notes) and `AGENTS.md`;
  - `README.md`;
  - the "run `compass_index` if missing" lines in
    `src/modules/lawbook/assets/skills/{explore,draft,build,investigate}/steps/*.md`
    and `assets/agents/{explorer,implementer}.md`, mirrored identically in
    `ai-specs/`.

  Update the skill and asset digest tests if they are pinned.

  `implementer.md` has no "run `compass_index`" line (only its tool list), so
  it is unchanged. No digest test pins these files; the regex in
  `test/unit/explorer-brief.test.ts` still matches.
- [x] 9.2 Dogfood: run the built CLI `update` in this repo, then review the
  `.claude/settings.json` diff. It should add only the `SessionStart` entry.
  Note that the file already has local modifications, so review the diff
  carefully before committing.

  Tester 2026-10-06: verified exactly one `SessionStart` entry, equal to
  `SESSION_START_COMMAND`, and no legacy entry. The diff against main also
  carries the 2.0.4–2.0.6 nudge entries (`Read|Grep|Glob` group, extra `input`
  keys), which were never refreshed into main's committed settings; this
  change did not add them. Re-run `update` if the rework changes the command.
- [x] 9.3 `CLAUDE.md` / `AGENTS.md` are strict `speclaw.lock` paths. Ask the
  human, through the coordinator, to run `speclaw laws accept` on an
  interactive TTY. Agents never run it and never use MCP for it. Then confirm
  `speclaw verify` passes integrity.
  Coordinator 2026-10-06: the human ran `speclaw laws accept` on a TTY; it
  reported "Digest already matches the lock" because the dogfood `update`
  had already refreshed the strict digests (follow-up: `update` should not
  re-pin strict paths without `accept`). `speclaw verify`: no violations.
- [x] 9.4 Release 2.0.7, shared with `fix-compass-source-offsets`:
  - bump `package.json` and the `package-lock.json` root version from 2.0.6
    to 2.0.7, unless the sibling change already did it;
  - add one `CHANGELOG.md` 2.0.7 entry that covers both the source-offset fix
    and the session-start index refresh, including the one-time
    `refreshedDiverged` note.

## 10. Archive

- [x] 10.1 Archive the change within the same PR (lawbook:archive) after
  harness review/test PASS: reconcile and `sync` the delta specs, then
  `lawbook_archive`. **Sync order: `fix-compass-source-offsets` first, then
  this change.** `lawbook sync` copies whole spec files. This change's
  `specs/code-graph/spec.md` was built from
  `fix-compass-source-offsets/specs/code-graph/spec.md` (it already carries
  `req~explore-exact-source~1`). If that sibling delta changes after
  2026-10-06, re-apply its edits here before syncing, so this sync does not
  drop them.

## 11. Rework after review FAIL (design D13)

- [x] 11.1 B2: replace `speclaw index --session-start` with the top-level
  command `speclaw session-start` (`src/cli/commands/session-start.ts`,
  dispatched in `src/cli/index.ts`, no header, no update notice); remove the
  flag from `index` and its help; marker `speclaw session-start`; update the
  deltas, docs, templates, README, `CLAUDE.md`, and `AGENTS.md`.
- [x] 11.2 B1: run the `npx` branch as
  `npm_config_offline=true npx --no-install @esneiderbravo/speclaw session-start`.
- [x] 11.3 Tests: an older-binary stub on `PATH` that rejects unknown commands
  (no index call, `.speclaw/` untouched, exit 0) and a `PATH`-only `npx` stub
  recording argv and `npm_config_offline`; rename the integration test to
  `test/integration/session-start.test.ts`; help assertions updated.
- [x] 11.4 N1: reconcile design §3/§5 and proposal §3 with
  `compactMapPending` and the cache-cap bypass; record D13.
- [x] 11.5 N5: the no-index path loads no `node:sqlite` (existence check
  before a lazy import) and removes `warning` listeners before indexing; empty
  stderr stays asserted.
- [x] 11.6 N7: the no-op triggers also watch `edges` and `embedding_cache`.
- [x] 11.7 N8: `docs/compass.md` notes that a run over 30 s rolls back and
  repeats each session, so large catch-ups use `speclaw index` /
  `compass_index`.
- [x] 11.8 Dogfood (9.2 rework): run the built CLI `update` in this repo and
  confirm with `jq` that `SessionStart` holds exactly the new command and no
  other hook changed. The first run showed the pre-release entry kept beside
  the new one, so `isSpeclawHook` also recognizes the legacy
  `speclaw index --session-start` marker (merge test extended).

## 12. Rework 2 (tester FAIL: npm update notifier)

- [x] 12.1 Prefix `npm_config_update_notifier=false` before
  `npm_config_offline=true` on the `npx` branch of `SESSION_START_COMMAND`
  (the scenario substring still matches); the `npx` stub test also asserts
  `npm_config_update_notifier=false`; delta scenario "The npx fallback runs
  offline", design D13, and `docs/compass.md` updated.
- [x] 12.2 Dogfood: rebuild, run `update` in this repo, and confirm with `jq`
  that `SessionStart` holds exactly the new command.
