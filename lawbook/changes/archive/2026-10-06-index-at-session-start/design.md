# Design — index-at-session-start

Level 2 (design optional). Written because the change crosses the hook wire
format, the merge identity, and the indexer's hot path, and because several
decisions were made by the human or set as coordinator defaults. Those
decisions are recorded here as binding.

## Decisions

| # | Decision | Source |
|---|----------|--------|
| D1 | The `SessionStart` hook is a **blocking** `command` hook with `timeout: 30` (seconds). It always exits 0 and never fails the session. | human |
| D2 | Command resolution: `node_modules/.bin/speclaw` first, then `speclaw` on `PATH`, else `npm_config_offline=true npx --no-install @esneiderbravo/speclaw`. It never hits the network. The whole command is guarded with `\|\| true`. | human (offline setting: D13) |
| D3 | If `.speclaw/index.db` is absent, skip. Never build from the hook. The first build stays `compass_index` / `speclaw index`. | human |
| D4 | Silent: stdout and stderr are discarded. `SessionStart` stdout enters the agent context, so nothing is printed. | coordinator default |
| D5 | Matcher `startup\|resume\|clear\|compact`, which covers every `SessionStart` source. | coordinator default |
| D6 | Claude only. That follows `installHooks`: only agents with the `hooks` capability, which today is just Claude (`src/shared/agents.ts`). | coordinator default |
| D7 | Watcher auto-start is out of scope. | coordinator default |
| D8 | On an unchanged repo the run must be cheap and must **not** rewrite `docs/compass.md`. | coordinator default |
| D9 | A `doctor` probe for the hook is out of scope (follow-up). | coordinator default |
| D10 | `SQLITE_BUSY` from a concurrent writer is swallowed (exit 0, silent). | coordinator default |
| D11 | The no-op fast path still writes `meta.indexed_at`, as one cheap statement. | planner |
| D12 | `speclaw session-start` does not record to `.speclaw/compass-calls.jsonl`. | planner |
| D13 | The hook runs a **top-level command** `speclaw session-start`, not an `index --session-start` flag, and the `npx` branch sets `npm_config_offline=true`. Rework 2 (tester FAIL) prefixes `npm_config_update_notifier=false` before it: `offline` alone still let npm's own update notifier query the registry once per notifier interval. | coordinator (review B1/B2 rework; tester rework 2) |

D11 rationale: `doctor`'s `freshnessCheck` (`src/modules/foundation/doctor.ts`)
flags the index as stale when `indexed_at` is older than 7 days **and** any
file has a newer mtime. A file that was touched but not changed keeps the root
unchanged. If `indexed_at` were not refreshed, `doctor` would warn even though
the index is verified current.

D13 rationale (review B1/B2): an older speclaw (before 2.0.7) that resolves
first — typically a stale global install on `PATH`, which is what this
repository itself has — ignored the unknown `--session-start` flag and ran a
full `speclaw index`: a call-log entry per session, the full post-processing,
a `docs/compass.md` rewrite, and for a pre-2.0 binary a schema-flapping
rebuild. An unknown top-level command instead falls through `dispatch` to
`Unknown command` and exits 1 before any index, call-log, notifier, or header
work; the redirect and `|| true` absorb that. 2.0.7 is unreleased, so no
install carries the old marker and the rename needs no migration; the flag is
removed rather than kept as an alias. One exception surfaced while
dogfooding: this repository's own settings already held a pre-release entry
with the old marker, which the new identity no longer matched, so `update`
added a second entry. `isSpeclawHook` therefore also recognizes the legacy
marker `speclaw index --session-start`, and a merge replaces such an entry. On npm ≥ 7, `npx --no-install` (`--no`)
still revalidates the packument against the registry when the package is not
in the local tree; npm's `offline` config (`npm_config_offline=true` in the
environment) forces cache-only resolution, so a cache miss fails silently
instead of reaching the network. `offline` does not silence npm's own update
notifier, which still queried the registry for the latest npm version, so the
branch also sets `npm_config_update_notifier=false` (rework 2). The
env-assignment prefix is POSIX `sh`.

D12 rationale: `compass_index` is not Compass evidence anyway
(`src/shared/compass-calls.ts`). Recording on every session start would only
grow the log and push real evidence entries toward rotation.

## 1. Hook wire format (`src/modules/foundation/hooks.ts`)

Do not widen `CheckEvent` (`check.ts`) or the `speclaw_check` zod enum
(`register-core.ts`). `SessionStart` never reaches `speclaw_check`.

- Add `type HookEvent = CheckEvent | "SessionStart"` and key
  `CompiledHooks.byEvent` by `HookEvent`.
- Add `SpeclawCommandHook = { type: "command"; command: string; timeout: number }`.
  `HookGroup.hooks` becomes `Array<SpeclawHook | SpeclawCommandHook>`.
  Keep `SPECLAW_HOOK` as is.
- Add the exported constants `SESSION_START_MARKER = "speclaw session-start"`
  and `SESSION_START_COMMAND`. The command is POSIX `sh`. Claude Code runs
  hooks through a POSIX shell, including Git Bash on Windows.

  ```sh
  cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null && [ -f .speclaw/index.db ] && { if [ -x node_modules/.bin/speclaw ]; then node_modules/.bin/speclaw session-start; elif command -v speclaw >/dev/null 2>&1; then speclaw session-start; else npm_config_update_notifier=false npm_config_offline=true npx --no-install @esneiderbravo/speclaw session-start; fi; } >/dev/null 2>&1 || true
  ```

  The `[ -f .speclaw/index.db ]` guard runs in the shell, before Node starts.
  That makes the no-index case free. An **older** speclaw that resolves first
  rejects the unknown `session-start` command and exits before doing anything
  (D13). All three branches contain `SESSION_START_MARKER`.
- `compileHooks` always emits, for hook-capable agents,
  `byEvent.SessionStart = [{ matcher: "startup|resume|clear|compact", hooks: [{ type: "command", command: SESSION_START_COMMAND, timeout: 30 }] }]`.
  It does so whether or not the manifest has laws, the same way as the
  Compass nudge entry.
- Identity: extend `isSpeclawHook` to return true for
  `type === "mcp_tool" && server === "speclaw"` (unchanged) **or**
  `type === "command" && typeof command === "string" && command.includes(SESSION_START_MARKER)`.
  `mergeHooks` already removes entries by identity and then appends the
  compiled ones, so re-running is drift-free. A user `command` hook without
  the marker is never touched. The output has no unknown keys: only `matcher`
  and `hooks`, and inside a hook only `type`, `command`, and `timeout`.
- Update the doc comments at the top of the file and on `SpeclawHook` /
  `isSpeclawHook`. They currently claim that only `speclaw_check` hooks exist.

Existing installs will see `refreshedDiverged` (plus `.bak` under
`--backup`) once on `speclaw update`. That is expected, and it is documented
in `docs/compass.md` and the CHANGELOG.

## 2. CLI command (`src/cli/commands/session-start.ts`)

> Superseded during rework (D13): the mode is the top-level command
> `speclaw session-start` (`runSessionStart`), not an `index` flag; `index`
> has no `--session-start` flag. The rules below apply to that command.

`speclaw session-start` behaves as follows:

1. `projectPath = process.cwd()`. If `.speclaw/index.db` does not exist,
   return exit 0 at once. Do not open or create the DB, and do not load
   `node:sqlite` (whose `ExperimentalWarning` on older Node lines would reach
   stderr); on the index path, `warning` listeners are removed first.
2. Print no branded header, no progress, no summary, and no update notice.
   Ignore every flag (`--force`, `--prune`, `--json`, cache flags). The run is always
   incremental with defaults.
3. Wrap the whole `buildIndex` call in `try/catch`. Any error, including
   `SQLITE_BUSY` / `database is locked` after the existing 5000 ms
   `busy_timeout` (`db.ts`), results in exit 0 with no output.
4. Do not call `recordCompassCall`.
5. The top-level help lists `session-start` ("silent, fail-safe refresh of an
   existing index (SessionStart hook)").

The hook redirects output anyway. The mode is silent on its own so that
manual runs and tests can assert it.

## 3. No-op fast path (`src/modules/compass/indexer.ts`)

In `buildIndex`, after the walk and per-file phase (where stat and hash
reuse already happen, and changed stat columns of untouched-content files may
be refreshed as today), add this check:

```
const noop = !opts.force && !opts.prune && reextracted === 0 && removed === 0 && rootUnchanged;
```

When `noop` is true:

- skip the `dir_hashes` rewrite (an unchanged root implies unchanged hashes;
  the O(dirs×files) loop goes away);
- skip the edge-resolution `UPDATE`, `resolveImportEdges`, and
  `recomputeGlobalPagerank`;
- skip the embedding cache touch and size eviction. The cache cannot grow on a
  no-op run, and explicit prune disables the fast path;
- still write `meta.indexed_at` (D11);
- skip `writeCompactMap` unless `docs/compass.md` is missing;
  *reconciled during implementation:* `writeCompactMap` never creates the
  file, so the exception is "the map block is empty" (`compactMapPending` in
  `map.ts`), and a missing file stays missing;
- return the same `IndexStats` shape: zero deltas, `rootUnchanged: true`,
  `totals` counted from the DB, and the usual `nextStep`.

*Reconciled during implementation:* an explicit `maxCacheMB` also disables
the fast path, like `prune`, so `--max-cache-mb` still evicts on an unchanged
project.

A run that is not `noop` behaves exactly as today. That includes writing the
map after real changes. The implementer must confirm with `compass_explore
buildIndex` the exact variable names for the re-extracted and removed counts,
and whether the per-file phase already runs inside the single transaction.
The fast path must commit, or never open, that transaction cleanly.

## 4. Concurrency

The DB runs in WAL mode with one write transaction per run and a 5000 ms
busy timeout. A session-start run can race the watcher, an MCP
`compass_index`, or a second session. The loser either waits for up to 5 s
and then proceeds incrementally (it sees an already-updated index, which is
usually a no-op), or it hits `SQLITE_BUSY` and exits 0 silently (D10). The
30 s hook timeout leaves room for that wait plus a real incremental index on
a typical repo.

## 5. Tests

- `test/unit/hooks.test.ts`:
  - the `SessionStart` group is compiled with zero laws, with the matcher,
    `type: command`, `timeout: 30`, and the marker;
  - `isSpeclawHook` recognizes the marker command and rejects a user command;
  - merge is idempotent (one `SessionStart` speclaw entry after two merges);
  - a user `SessionStart` command survives the merge.
- `test/integration/hooks.test.ts` / `scaffold.test.ts` / `install.test.ts`:
  init writes the entry; update reruns produce no drift; agents without hooks
  get no entry.
- New `test/integration/session-start.test.ts` (renamed in rework), run through
  `test/helpers/cli.ts runCli` in a temp dir:
  - no index: exit 0, empty stdout and stderr, no `.speclaw/index.db` created;
  - existing unchanged index: exit 0, silent, `docs/compass.md` bytes and
    mtime unchanged;
  - one changed file is re-extracted;
  - a DB held by an open `BEGIN IMMEDIATE` from another connection gives
    exit 0 and silence;
  - the call log is unchanged;
  - the top-level help lists `session-start`; `index --help` does not.
- Indexer fast-path test (unit or integration):
  - a no-op run leaves `dir_hashes` and `pagerank` rows untouched;
  - the map is not rewritten;
  - `indexed_at` advances;
  - `--force` and `--prune` bypass the fast path;
  - a deleted `docs/compass.md` is recreated on a no-op run
    (*reconciled:* an emptied map block is refilled; a missing file is never
    created — see §3).
- Shell command test: execute `SESSION_START_COMMAND` with `sh -c` in a temp
  dir that has no index, and in one that has an index with
  `node_modules/.bin/speclaw` stubbed to a script that records its argv.
  Assert exit 0, empty output, and the resolution order. Rework (D13) adds an
  older-binary stub on `PATH` that rejects unknown commands (no index call, no
  files touched) and a `PATH`-only `npx` stub that records argv,
  `npm_config_offline`, and `npm_config_update_notifier`.

## 6. Performance (main vs branch)

Required by the project's improvement-change rule. A
`scripts/bench/session-start.mjs` script (or an extension of
`scripts/bench/compass-first.mjs`) builds throwaway worktrees of `main` and
the branch. It measures N ≥ 20 runs, after 3 warm-ups, with median, p95, min,
and max:

- `index-noop`: `speclaw index` on an already-indexed, unchanged copy (main
  vs branch);
- `session-start-noop`: the full `SESSION_START_COMMAND` via `sh -c`
  (branch only);
- `session-start-one-change`: one touched file with changed content
  (branch only).

Budgets: the branch `index-noop` median must not exceed main's. The
`session-start-noop` p95 must be under 2 s on this repository (well inside
the 30 s timeout). The tester records the real numbers in
`reports/performance.md`, including the environment header.

## 7. Risks

- **Older speclaw on PATH.** Resolved by D13: an older binary rejects the
  unknown `session-start` command and does nothing, so the refresh is simply
  skipped until that binary is upgraded.
- **Hook timeout.** A run longer than 30 s is killed and its transaction rolls
  back, so it repeats every session; the first build and any large catch-up
  should be an explicit `compass_index` / `speclaw index` (documented).
- **Delta overlap.** `lawbook sync` copies whole spec files.
  `fix-compass-source-offsets` has its own full-copy `code-graph` delta, which
  adds `req~explore-exact-source~1`. This change's `code-graph` delta starts
  from **that** file, not from the canonical one, and appends the two new
  requirements. Sync order is fixed: `fix-compass-source-offsets` first, then
  this change. If the sibling delta is edited later, mirror the edit here
  before syncing.
