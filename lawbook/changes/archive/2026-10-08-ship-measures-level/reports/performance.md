# Performance checks — ship-measures-level (2026-10-08)

2026-10-08 · `fix/ship-measures-level` · `/Users/esneiderbravo/Projects/speclaw` (macOS, Claude Code headless `claude -p`)

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Agent benchmark, main vs branch vs alone | `scripts/bench-workflow.sh 3 <A\|B> <scenario>` (main via `SPECLAW_DIST=/tmp/speclaw-main/dist`) | ✅ 45 runs + 15 final-branch runs; every run fixed the bugs, tests passing |
| Stop hook without an agent | `echo '{}' \| speclaw ship-on-stop` on each fixture, 3× per build | ✅ 0.50–0.79 s (2.0.20) vs 0.64–0.76 s (2.0.19), gates included |
| `PostToolUse` doc-hint call | `speclaw_check` via MCP on the `deep` fixture | ✅ 214 ms when the file set changed, 16–18 ms otherwise (was ~125 ms before the `git status` fast path) |
| Nudge call | `speclaw_check` Read | ✅ 1 ms |

## Results (medians of 3: agent s · process s · cost · tokens · turns)

| Scenario | Agent alone | main (2.0.19) | branch (2.0.20, final) |
|----------|-------------|---------------|------------------------|
| L0 — one-line bug | 11.8 · 14.4 · $0.185 · 118k · 4 | 12.1 · 20.1 · $0.203 · 130k · 4 | 14.9 · 18.2 · $0.207 · 135k · 4 |
| L1 — bug across 2 modules | 12.8 · 15.5 · $0.195 · 120k · 4 | 14.2 · 17.1 · $0.211 · 131k · 4 | 28.5 · 31.9 · $0.293 · 282k · 8 |
| L2 — 5 modules + public entry | 13.5 · 16.1 · $0.200 · 121k · 4 | 13.1 · 16.3 · $0.216 · 132k · 4 | 27.6 · 30.8 · $0.276 · 214k · 6 |
| L3 — 16 modules + entry + `package.json` | 16.1 · 18.8 · $0.224 · 126k · 4 | 20.5 · 23.5 · $0.248 · 139k · 4 | 29.7 · 33.1 · $0.304 · 225k · 6 |
| deep — bug 5 calls down, 132 files | 30.5 · 33.2 · $0.254 · 229k · 7 | 22.4 · 25.2 · $0.253 · 175k · 5 | 23.2 · 26.5 · $0.268 · 182k · 7 |

Run-to-run spread is wide: the same branch L0 path measured 11.0 s and `deep` 16.7 s in the
earlier 45-run batch. Branch L1–L3 history: blocked-stop documentation 33–42 s → in-turn hint
28–30 s; 0 of 9 final L1–L3 runs were blocked at the stop.

Main produced level-0 archives with a file-list record for every scenario; the branch produced the
documentation each level owes (L1 record why + tasks + delta spec; L2 + proposal; L3 + design).

## Tests added / updated

`scripts/bench-fixture.mjs` (per-level and `deep` fixtures, `--solve` reference fixes) and
`scripts/bench-workflow.sh` (Stop hook installed via `speclaw agent add claude`, bash 3.2,
wall-clock, tokens, tool use from transcripts).

## Spec scenario coverage

Performance is not a spec scenario here; the functional scenarios are covered in `backend.md`.

## Pre-existing / unrelated failures

The benchmark's Cortex fixture had not installed the `Stop` hook since 2.0.16 (`init --minimal`
configures no IDE folder), so earlier "Cortex" numbers measured an agent alone; fixed in this change.

## Pending manual steps

None.

## Verdict

✅ PASS with a known cost — L0 and the hook are at par; the code-graph task is 24 % faster with 20 % fewer tokens than an agent alone; L1–L3 cost +14–16 s and +$0.08–0.10 for the documentation those levels owe.
