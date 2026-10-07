# Performance checks — index-at-session-start (2026-10-06)

Date 2026-10-06 · Branch `fix/compass-source-and-session-index` (working tree,
`ad68416+dirty`) vs `main` @ `ad68416667c9f228fe5fa91b8d0a1ff049a69dca` · cwd
`/Users/esneiderbravo/Projects/speclaw` · `TMPDIR=/tmp/speclaw-bench-tmp`

Machine: Apple M1 Max (10 cores, 32 GiB), macOS 26.5.1 (Darwin 25.5.0 arm64),
Node v24.17.0, npm 11.13.0. Runs used an otherwise idle shell, with no other
benchmark in parallel.

Method: `scripts/bench/session-start.mjs`.

- It materializes `main` (via `git archive`) and the working tree into
  throwaway copies under `$TMPDIR`, and builds each.
- `package.json` and `package-lock.json` are identical to main, so
  `--link-node-modules` is valid.
- Both builds index the same 1090-file fixture copy.
- Each case runs 3 warm-ups, then N timed runs.
- The hook runs with `CLAUDE_PROJECT_DIR` pinned to the fixture and a local
  `node_modules/.bin/speclaw` shim to the branch build.
- The script removes its temp dirs on exit. Afterwards `/tmp/speclaw-bench-tmp`
  held only my logs, and `git worktree list` shows only the main checkout, so
  no worktree was left behind.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Benchmark run 1 | `TMPDIR=/tmp/speclaw-bench-tmp node scripts/bench/session-start.mjs --iterations 30 --link-node-modules --json /tmp/speclaw-bench-tmp/result.json` | ✅ exit 0, 3/3 budgets PASS |
| Benchmark run 2 (repeatability) | same with `--iterations 40` | ✅ exit 0, 3/3 budgets PASS |

### Run 1 (n = 30, 2026-10-06T23:49:43Z)

| Case | Ref | n | median ms | p95 ms | min ms | max ms |
|------|-----|---|-----------|--------|--------|--------|
| index-noop | main | 30 | 377.1 | 388.1 | 369.9 | 445.4 |
| index-noop | branch | 30 | 203.1 | 207.7 | 198.8 | 217.2 |
| session-start-noop | branch | 30 | 209.6 | 271.6 | 204.9 | 285.4 |
| session-start-one-change | branch | 30 | 446.8 | 498.7 | 438.7 | 499.8 |

### Run 2 (n = 40, 2026-10-06T23:50:53Z)

| Case | Ref | n | median ms | p95 ms | min ms | max ms |
|------|-----|---|-----------|--------|--------|--------|
| index-noop | main | 40 | 394.2 | 426.4 | 379.2 | 512.6 |
| index-noop | branch | 40 | 208.7 | 225.7 | 203.1 | 267.2 |
| session-start-noop | branch | 40 | 219.9 | 234.9 | 207.1 | 242.5 |
| session-start-one-change | branch | 40 | 449.8 | 456.4 | 440.0 | 563.1 |

### Budgets (design §6)

| Budget | Run 1 | Run 2 |
|--------|-------|-------|
| branch `index-noop` median ≤ main | ✅ 203.1 ≤ 377.1 ms (−46%) | ✅ 208.7 ≤ 394.2 ms (−47%) |
| `session-start-noop` p95 < 2000 ms | ✅ 271.6 ms | ✅ 234.9 ms |
| `session-start-noop` leaves `docs/compass.md` untouched | ✅ mtime unchanged | ✅ mtime unchanged |

Manual spot timings (real hook command via `/bin/sh -c`, 1-file temp repo):

| Case | Time |
|------|------|
| no-op | 478 ms (includes cold node start) |
| one change | 341 ms |
| older 2.0.6 binary rejecting the command | 68 ms |
| npx cache miss (offline) | 222–355 ms |

All are far inside the 30 s hook timeout.

## Tests added / updated

None. This is a benchmark, not a test suite.

## Spec-scenario coverage

| Scenario | Verified by |
|----------|-------------|
| code-graph, No-op index fast path: The no-op index is not slower than main | Runs 1 and 2 above. Branch median is about 46–47% below main's, and medians and p95 are recorded for both refs. |

The other scenarios are covered in `backend.md`, `cli.md`, and `hooks.md`.

## Pre-existing / unrelated failures

None.

## Pending manual steps

None. If the rework only changes the npx branch of the hook command, these
numbers stay valid: the bench resolves the local shim, never npx.

## Verdict

**PASS**.
