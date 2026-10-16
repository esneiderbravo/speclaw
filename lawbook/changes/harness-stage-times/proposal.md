# harness-stage-times

## Why

`harness.json` was written in one burst: at level 0 by ship at the stop, at
level 1+ by `cortex start` plus a chain of `advance` calls right before the
archive. Every history entry took `nowIso()`, so all stages carried the same
second (`archive/2026-10-08-stop-hook-feedback`: seven stages in 23 s). The
harness could not tell how long exploring, implementing or testing took, which
is the evidence the Cortex latency work needs.

## What changes

- Ship stamps each stage with the time its evidence shows: exploring at the
  first Compass lookup (call log) since the branch was created (reflog) or the
  first edit if earlier; implementing at the oldest branch commit or
  uncommitted change; planning at the level's `confirmedAt`; testing,
  reviewing and archiving from the gates' own start and end. No entry is
  earlier than the one before it.
- `handleHarness` takes an optional internal `at` (defaults to now); the MCP
  tool and the CLI do not expose it.
- At level 1+ the stop opens the harness and records the work up to
  `implementing`, with no review verdict; a strict Compass gate leaves that to
  the agent's own `advance`.

## Impact

- `src/modules/lawbook/ship.ts`, `src/modules/cortex/harness.ts`,
  `test/integration/ship.test.ts`; capability `ship`.
- No added latency: the evidence is read once, at the stop, from files ship
  already touches plus one `git reflog` and one `git log` call.
- At archive, a level 1+ harness already exists: the agent advances from
  `implementing` instead of running `cortex start`.
- Times are approximate where git is: a file's mtime is its last change, and
  an expired reflog falls back to the oldest branch commit.
