# Proposal — index-at-session-start

## Why

Compass answers code questions only as well as its index is fresh. Today the
index is refreshed only when someone runs `compass_index` / `speclaw index`
(or the watcher). An agent that starts a session after a `git pull`, a branch
switch, or a day of edits outside the agent sees a stale graph. Then it either
trusts wrong answers or falls back to Read/Grep, which undoes Rule 1
("Compass first, always"). The fix is to refresh the index when a session
starts, before the agent asks anything.

Two things make that cheap and safe today:

- The indexer is already incremental (stat prefilter, content hash, Merkle
  root). But a no-op run still repeats the global post-processing on every
  call: the `dir_hashes` rewrite, edge and import resolution, PageRank, the
  embedding cache touch and eviction, the `indexed_at` write, and a rewrite of
  the tracked `docs/compass.md`. A run on every session start must not do that
  work, and must not dirty the working tree.
- Claude Code runs `SessionStart` `command` hooks, and speclaw already owns
  the Claude hook settings through its hook compiler and idempotent merge.

## What changes

1. **Session-start hook (Foundation).** For every hook-capable agent (today
   only Claude Code), the hook compiler writes one `SessionStart` entry with
   matcher `startup|resume|clear|compact`. It holds a single blocking
   `command` hook with a 30 s timeout that runs `speclaw session-start`.
   The command:
   - skips everything when `.speclaw/index.db` does not exist;
   - uses the local `node_modules/.bin/speclaw` first, then `speclaw` on
     `PATH`, then `npm_config_offline=true npx --no-install
     @esneiderbravo/speclaw`, so it never downloads anything or contacts the
     registry;
   - discards all output and always exits 0 (`|| true`).

   The idempotent merge learns a second speclaw identity: a `command` entry
   whose command contains `speclaw session-start`. Re-running `init`
   or `update` then never duplicates the entry, and user hooks are never
   touched.
2. **`speclaw session-start` (CLI).** A silent, fail-safe top-level command
   for the hook (a command rather than an `index` flag, so an older speclaw
   rejects it as unknown instead of running a full index — design D13):
   - when the index is absent, it exits 0 without creating one;
   - otherwise it runs the normal incremental index (no force, no prune);
   - it prints nothing on stdout or stderr, and swallows every error,
     including `SQLITE_BUSY` from a concurrent writer, with exit 0;
   - it does not write to the Compass call log.
3. **No-op index fast path (Compass).** When a run without force or prune
   re-extracts nothing, removes nothing, and finds the Merkle root unchanged,
   `buildIndex` skips the global post-processing and does not rewrite
   `docs/compass.md` (unless that file is missing — *reconciled during
   implementation:* unless its map block is empty; a missing file is never
   created, and an explicit cache cap also disables the fast path). It writes only
   `meta.indexed_at`, so `doctor`'s freshness check stays accurate. Totals and
   `nextStep` are still reported. Both `compass_index` and `speclaw index`
   benefit.
4. **Docs and release.** Templates, operator notes, the Compass docs, and the
   skill and agent texts that say "run `compass_index` if missing" now
   mention the session-start refresh. Ships in **2.0.7** together with
   `fix-compass-source-offsets`.

## Capabilities touched

- `law-enforcement` (updated): a new requirement for the session-start index
  hook, and the idempotent merge identity extended to that `command` entry.
  Hook generation stays as it is: it already restricts every hook entry to
  hook-capable agents.
- `code-graph` (updated): new requirements for the no-op index fast path and
  for the `speclaw session-start` command.

There is no `foundation` canonical spec. The hook compiler and its merge
rules live in `law-enforcement`, and indexing lives in `code-graph`, so no new
capability is introduced. `cli` is not changed: the new command is an
indexing entry point, so its requirement lives in `code-graph`, which already
specifies `speclaw index`.

## Out of scope

- Building the first index from the hook. The first build stays `compass_index`
  / `speclaw index`.
- Auto-starting the watcher (`compass_watch`).
- Hooks for agents without a `hooks` capability (Cursor, Codex, …).
- A `doctor` probe that checks the hook actually ran (follow-up).
- Injecting index stats into the agent context. `SessionStart` stdout enters
  the context, so the hook stays silent.
