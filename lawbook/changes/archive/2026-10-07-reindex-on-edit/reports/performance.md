# Performance checks — reindex-on-edit (2026-10-07)

Date: 2026-10-07 · Branch: `feat/reindex-on-edit` (working tree @ 95cb789+dirty) · Main: `origin/main` @ 1ed68dc (2.0.10, includes fix-explore-tests-and-callees) · cwd: `/Users/esneiderbravo/Projects/speclaw` · Machine: Apple M1 Max ×10, 32 GB, macOS Darwin 25.5.0 (arm64) · Node v24.17.0

Scope: design §5. The four metrics are:

- **A.** `speclaw index` on an unchanged index (no-op).
- **B.** `speclaw index` after a one-function edit.
- **C.** Wall time of the compiled `PostToolUse` hook, with an `Edit` payload piped through `sh -c`, measured until the parent exits.
- **D.** The detached child's work: `speclaw reindex-file <file>` run in the foreground after the same edit.

The budgets are:

- C median < A median (branch);
- D median (branch) < B median (main);
- branch A median ≤ main A median.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Bench, run 1 | `node scripts/bench/reindex-file.mjs --main origin/main --iterations 20 --link-node-modules --json <tmp>` | exit 1 (the A budget failed by 5.6 ms); C ✅, D ✅, A ⚠️ |
| Bench, run 2 | same | exit 0; C ✅, D ✅, A ✅ |
| Bench, run 3 | same | exit 1 (the A budget failed by 4.7 ms); C ✅, D ✅, A ⚠️ |
| Interleaved no-op A/B ×2 | ABBA order, 3 warm-ups + 40 timed `speclaw index` runs each, on `/tmp` git worktree `origin/main` vs the branch build | branch − main median: **+0.0 ms** and **+0.3 ms**. The two are at parity ✅ |
| Lint, build, tests | `npm run check` / `npm run build` / `npm test` | ✅ / ✅ / ✅ 925 of 925 pass |

**How the runs were isolated:**

- The bench writes only to `os.tmpdir()`. It extracts each ref with `git archive`, uses a sandboxed `HOME`, pins `CLAUDE_PROJECT_DIR` to the fixture, and gives the fixture a `node_modules/.bin/speclaw` shim to the branch build. It removes its temp dirs on exit; I confirmed none were left.
- `--link-node-modules` reuses the repo's `node_modules`, so there was no `npm ci` and no registry contact. `npm_config_registry` pointed at `127.0.0.1:9`.
- For the interleaved A/B I ran `git worktree add --detach /tmp/rof-main-wt origin/main`. The worktree was built with symlinked `node_modules` and indexed two 848-file copies of the branch tree under `/tmp`. I then ran `git worktree remove --force /tmp/rof-main-wt` and `git worktree prune`; `git worktree list` now shows only the main checkout.

## Results — run 1 (verbatim bench output, fixture 1179 files)

| Case | Ref | n | median ms | p95 ms | min ms | max ms |
|------|-----|---|-----------|--------|--------|--------|
| A index-noop | main | 20 | 219.3 | 226.2 | 217.4 | 229.4 |
| A index-noop | branch | 20 | 224.9 | 238.8 | 219.2 | 254.5 |
| B index-one-edit | main | 20 | 480.3 | 513.2 | 467.2 | 542.1 |
| B index-one-edit | branch | 20 | 479.3 | 504.8 | 471.5 | 513.4 |
| C hook-wall | branch | 20 | 51.0 | 54.6 | 47.0 | 58.1 |
| D reindex-file-edit | branch | 20 | 258.8 | 263.7 | 255.3 | 266.3 |

### Budgets

- PASS — C hook-wall median < A index-noop median (branch): 51.0 ms vs 224.9 ms
- PASS — D reindex-file-edit median (branch) < B index-one-edit median (main): 258.8 ms vs 480.3 ms
- FAIL — branch A index-noop median ≤ main: 224.9 ms vs 219.3 ms

### Caveats

- Unless `--main` names a ref that already contains fix-explore-tests-and-callees, the main build predates it: B (index-one-edit) main vs branch then mixes that change's resolution cost with this one's and is not this change's delta alone.
- Full runs skip the detached-owners query (only per-file runs scope resolution to it), so B branch carries no cost for it.


## Results — runs 2 and 3 (same command, same fixture)

| Case | Ref | run 2 median / p95 ms | run 3 median / p95 ms |
|------|-----|----------------------|----------------------|
| A index-noop | main | 258.6 / 289.6 | 236.5 / 250.6 |
| A index-noop | branch | 230.4 / 241.7 | 241.2 / 281.5 |
| B index-one-edit | main | 508.5 / 587.6 | 516.5 / 533.1 |
| B index-one-edit | branch | 501.1 / 562.5 | 520.6 / 580.0 |
| C hook-wall | branch | 62.6 / 69.1 | 60.4 / 67.2 |
| D reindex-file-edit | branch | 288.2 / 320.4 | 292.0 / 299.8 |

Budgets: run 2 passed all three. Run 3 passed C (60.4 < 241.2) and D (292.0 < 516.5). It failed A, branch 241.2 vs main 236.5.

## Interleaved no-op A/B (order bias removed)

The bench always times main before branch. To remove that ordering effect, I alternated the two builds in ABBA order. Each build had 3 warm-ups and then 40 timed runs, on its own indexed copy of the branch tree:

```text
main    n=40 median=232.7 p95=243.6 min=227.1 max=246.0
branch  n=40 median=232.7 p95=242.1 min=227.2 max=251.4
branch median ≤ main median: PASS (-0.0 ms)
main    n=40 median=231.3 p95=241.2 min=227.5 max=284.1
branch  n=40 median=231.6 p95=237.7 min=225.1 max=250.4
branch median ≤ main median: FAIL (0.3 ms)
```

## Budgets (summary)

| Budget | Result |
|--------|--------|
| C hook-wall median < A no-op median (branch) | ✅ every run: 51.0 / 62.6 / 60.4 ms against 224.9 / 230.4 / 241.2 ms, about 4× below |
| D reindex-file median (branch) < B one-edit median (main) | ✅ every run: 258.8 / 288.2 / 292.0 ms against 480.3 / 508.5 / 516.5 ms, about 45 % less |
| Branch A no-op median ≤ main | ⚠️ **Parity, within noise.** The bench passed in 1 of 3 runs, with gaps of +5.6, −28.2 and +4.7 ms (+2.6 %, −10.9 %, +2.0 %). Main's own median moved by 39 ms between runs. The median of the three medians is branch 230.4 ms against main 236.5 ms. The interleaved A/B gives +0.0 ms and +0.3 ms (0.1 %). Rework 1's `BEGIN IMMEDIATE` on every full run, the no-op run included, costs no measurable time. A strict "median ≤" test between two equal builds passes about half the time. |

B, a one-function edit through a full run, is at parity between branch and main in every run (−7.4, +4.1 and −1.0 ms). Main now includes fix-explore, so B is this change's delta alone. The old caveat about main predating fix-explore no longer applies.

## Previous implementer run (folded from `reports/.bench-reindex.md` / `.json`; both removed)

That run measured against the older `main` @ 7d78802, which predates fix-explore-tests-and-callees and Rework 1. Its output, verbatim:

```text
## Reindex-on-edit benchmark

- Date: 2026-10-07T13:04:54.476Z
- OS: Darwin 25.5.0 (arm64) · CPU: Apple M1 Max ×10 · Node v24.17.0
- main: main @ 7d788027c309254d922ed892d55062cd8169428a
- branch: working tree (feat/reindex-on-edit) @ 95cb789c4f4054ce86c7f8ff75de53672de57bfa+dirty
- Iterations: 20 (after 3 warm-ups) · fixture files: 1173

| Case | Ref | n | median ms | p95 ms | min ms | max ms |
|------|-----|---|-----------|--------|--------|--------|
| A index-noop | main | 20 | 234.6 | 253.3 | 227.8 | 260.3 |
| A index-noop | branch | 20 | 234.5 | 240.9 | 229.2 | 243.0 |
| B index-one-edit | main | 20 | 488.7 | 533.4 | 482.7 | 562.6 |
| B index-one-edit | branch | 20 | 507.6 | 511.4 | 496.7 | 522.4 |
| C hook-wall | branch | 20 | 59.1 | 62.7 | 53.7 | 63.4 |
| D reindex-file-edit | branch | 20 | 289.6 | 295.2 | 281.3 | 303.6 |

### Budgets

- PASS — C hook-wall median < A index-noop median (branch): 59.1 ms vs 234.5 ms
- PASS — D reindex-file-edit median (branch) < B index-one-edit median (main): 289.6 ms vs 488.7 ms
- PASS — branch A index-noop median ≤ main: 234.5 ms vs 234.6 ms

### Caveats

- The main build (7d78802) predates fix-explore-tests-and-callees, so B (index-one-edit) main vs branch (+3.9%) mixes that change's resolution cost with this one's and is not this change's delta alone.
- This run predates Rework 1: the full run still executed the detached-owners SELECT (result unused). Rework 1 skips it on full runs, so B branch can only get cheaper; the numbers above were not re-measured.
```

`.bench-reindex.json` held the same environment (Apple M1 Max ×10, Node v24.17.0, main 7d78802, fixture 1173 files, 20 iterations after 3 warm-ups) and the same three budgets, all `ok: true`: 59.1 vs 234.5, 289.6 vs 488.7, and 234.5 vs 234.6 ms.

## Tests added / updated

- `scripts/bench/reindex-file.mjs` (new, task 7.1) is the benchmark harness. It is not a unit test.
- The "not slower" property of metric A has no automated test. It is a performance scenario and is checked with this bench.

## Spec-scenario coverage

| Scenario | Verified by |
|----------|-------------|
| `req~reindex-on-edit~1` — The per-edit cost stays below a full refresh | C < A (branch) and D < B (main): ✅ in all 3 bench runs |
| `req~index-noop-fast-path~1` — The no-op index is not slower than main | Inherited scenario; this report records the median and p95 for both. Result ⚠️: at parity within noise (see Budgets) |

Every other scenario of the two delta specs is mapped one by one in `backend.md` (`code-graph`, 141) and `hooks.md` (`law-enforcement`, 125).

## Pre-existing / unrelated failures

None. The A-budget misses in runs 1 and 3 are noise at parity. The interleaved measurement above shows this, and they were not caused by a code regression.

## Pending manual steps

None.

## Verdict

PASS. C and D are met in every run. The no-op path matches main within 0.3 ms when interleaved.
