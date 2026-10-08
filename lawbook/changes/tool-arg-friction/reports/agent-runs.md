# Agent runs by change size — tool-arg-friction (2026-10-08)

2026-10-08 · `fix/tool-arg-friction` · real headless agents (`claude -p`, `claude-opus-5-5`) on a
throwaway copy of this repo per run · harness, hidden tests and raw data:
`/tmp/speclaw-levels/` (`run.mjs`, `timing.py`, `hidden/`, `full.json`)

## Setup

| Config | What the agent had |
|--------|--------------------|
| **Agent alone** | Plain CLAUDE.md (conventions + "gates must pass: `npm run check && npm run build && npm test`"); no lawbook, hooks or speclaw MCP |
| **speclaw before** | 2.0.23 (`db5792b`), full install: hooks (Pre/PostToolUse `speclaw_check`, Stop `ship-on-stop`), MCP, CLAUDE/AGENTS/LAWS, skills, Compass index |
| **speclaw after** | Same install at `2315334`: scoped stop test gate, small-fix level 0, gate instructions that no longer contradict the hook, tool-argument fixes |

The speclaw the hooks and MCP run is a separate immutable build: the agent's edits never change its
own tooling. Same prompt for every config (Spanish, like real tickets), no hints about speclaw.
Quality = a hidden acceptance test the agent never sees + the full gates after the run.

| Size | Task |
|------|------|
| Small (T0) | Planted one-line bug in `changeNameForBranch` (ticket digits dropped) |
| Medium (T2) | `level` filter for `lawbook_change list`, `specList` and the CLI |
| Large (T3) | `lawbook_change` action `stats` + `speclaw lawbook stats [--json]` + a doctor warning |

## 1. Summary

| Size | Config | Wall | vs alone | Turns | Cost | vs alone | Hidden test | Gates | Level |
|------|--------|------|----------|-------|------|----------|-------------|-------|-------|
| Small | Agent alone | 135 s | 1.00× | 6 | $0.17 | 1.00× | 1/1 | PASS | — |
| Small | before | 233 s | 1.72× | 12 | $0.38 | 2.19× | 1/1 | PASS | 1 |
| Small | **after** | **108 s** | **0.80×** | 10 | $0.29 | 1.65× | 1/1 | PASS | **0** |
| Medium | Agent alone | 164 s | 1.00× | 16 | $0.52 | 1.00× | 3/3 | PASS | — |
| Medium | before | 295 s | 1.80× | 19 | $0.69 | 1.32× | 3/3 | PASS | 2 |
| Medium | **after** | **203 s** | **1.24×** | 22 | $0.78 | 1.49× | 3/3 | PASS | 2 |
| Large | Agent alone | 296 s | 1.00× | 20 | $0.82 | 1.00× | 3/3 | PASS | — |
| Large | before | 406 s | 1.37× | 26 | $1.01 | 1.23× | 3/3 | PASS | 2 |
| Large | **after** | **191 s** | **0.65×** | 25 | $1.03 | 1.26× | 3/3 | PASS | 2 |

`Wall` = `result.duration_ms`. T0 was also run 3× per config before the fixes: agent alone
109–139 s, speclaw 233–237 s (one agent-alone run at 214 s overlapped another process; excluded).

## 2. Where the time goes (seconds)

| Size | Config | Wall | Model | Agent's gate runs | Stop hook (ship) | Other tools / I/O |
|------|--------|------|-------|-------------------|------------------|-------------------|
| Small | alone | 135 | 16 | 113 | — | 6 |
| Small | before | 233 | 24 | 103 | 90 | 16 |
| Small | after | 108 | 16 | **8** | 73 | 11 |
| Medium | alone | 164 | 34 | 100 | — | 30 |
| Medium | before | 295 | 41 | 114 | 94 | 46 |
| Medium | after | 203 | 63 | **21** | 71 | 48 |
| Large | alone | 296 | 41 | 205 | — | 50 |
| Large | before | 406 | 64 | ~205 | 89 | ~48 |
| Large | after | 191 | 80 | **17** | 56 | 38 |

Model = time waiting on the model between events; API time (`duration_api_ms`): small 21 / 37 /
24 s, medium 61 / 83 / 104 s, large 87 / 107 / 113 s (alone / before / after).

### The Stop hook's gates (from the ship report)

| Size | Config | `npm run check` | `npm run build` | tests | Test scope |
|------|--------|-----------------|-----------------|-------|------------|
| Small | before | 4.2 s | 1.7 s | 83.3 s | full suite (`npm test`) |
| Small | after | 5.1 s | 2.0 s | 64.0 s | 31 affected test files, 97 skipped |
| Medium | before | 5.0 s | 1.8 s | 86.6 s | full suite |
| Medium | after | 5.0 s | 2.0 s | 62.5 s | affected test files |
| Large | before | 4.5 s | 1.7 s | 82.4 s | full suite |
| Large | after | 4.8 s | 1.9 s | 47.3 s | affected test files |

Every scoped run starts with `npm run pretest` (~15 s of test compilation). Hook overhead outside
the gates: PostToolUse `speclaw_check` 0.3–1.7 s per session in total; PreToolUse < 0.1 s; 0–3
hints injected (doc owed / Compass first).

## 3. Tokens and cost

All on `claude-opus-5-5` ($4 in · $20 out · $0.20 cache read · $8 cache write 1 h, per MTok).

| Size | Config | Input | Cache read | Cache write | Output | Peak context | Cost: read / write / output |
|------|--------|-------|------------|-------------|--------|--------------|-----------------------------|
| Small | alone | 12 | 116k | 13.6k | 2.0k | 23.7k | $0.02 / $0.11 / $0.04 |
| Small | before | 24 | 389k | 28.4k | 3.7k | 39.6k | $0.08 / $0.23 / $0.07 |
| Small | after | 14 | 204k | 24.5k | 2.4k | 35.7k | $0.04 / $0.20 / $0.05 |
| Medium | alone | 30 | 501k | 35.8k | 6.9k | 45.8k | $0.10 / $0.29 / $0.14 |
| Medium | before | 32 | 686k | 45.5k | 9.6k | 56.7k | $0.14 / $0.36 / $0.19 |
| Medium | after | 40 | 937k | 49.9k | 9.7k | 61.0k | $0.19 / $0.40 / $0.20 |
| Large | alone | 38 | 865k | 55.5k | 10.2k | 65.6k | $0.17 / $0.44 / $0.21 |
| Large | before | 46 | 1,272k | 63.8k | 12.3k | 74.9k | $0.25 / $0.51 / $0.25 |
| Large | after | 46 | 1,262k | 64.9k | 13.1k | 76.1k | $0.25 / $0.52 / $0.26 |

- **Cache writes are 50–65 % of every run's cost.** speclaw's always-on context (CLAUDE.md,
  AGENTS.md, rules, skills listing, MCP tool schemas) adds **~10–16k tokens** to the first context
  (peak 23.7k → 35.7–39.6k on the small task), written to cache once per session: +$0.08–0.13
  per session regardless of the task.
- More turns (the level's artifacts, Compass calls) re-read the context: cache reads grow 1.4–1.9×.

## 4. Tools used

| Size | Config | Tool calls | speclaw MCP | Errors |
|------|--------|------------|-------------|--------|
| Small | alone | Bash 5 (2 gate runs) | — | 0 |
| Small | before | Bash 9 (5 gate/test runs), `compass_explore` 2 | 2 | 0 |
| Small | after | Bash 4 (3 targeted test runs), Edit 3, `compass_explore` 2 | 2 | 0 |
| Medium | alone | Bash 15 (2 gate runs) | — | 0 |
| Medium | before | Bash 13 (4 gate runs), `compass_explore` 5 | 5 | 0 |
| Medium | after | Bash 16 (2 targeted test runs), `compass_explore` 5 | 5 | 0 |
| Large | alone | Bash 18 (4 gate runs), Write 1 | — | 0 |
| Large | before | Bash 21, Write 2, `compass_find` 1, `compass_explore` 1 | 2 | 0 |
| Large | after | Bash 21 (3 targeted test runs), Write 1, `compass_find` 1, `compass_explore` 1 | 2 | 0 |

No agent called `lawbook_change`, `cortex` or any role subagent: the Stop hook created, measured,
reported and (level 0) archived the change; the agent wrote only what the level owed. MCP calls
took ≤ 2 s per session in total.

## 5. What each run changed

| Size | Config | Source (files / lines) | Tests (files / lines) | Lawbook written |
|------|--------|------------------------|-----------------------|-----------------|
| Small | alone | 1 / 5 | 1 / 4 | — |
| Small | before | 1 / 2 | 1 / 4 | 6 files / 277 lines (level 1: record, tasks, full `ship` delta spec, report) |
| Small | after | 1 / 5 | 1 / 4 | none by the agent; the hook archived record + report |
| Medium | alone | 4 / 33 | 3 / 68 | — |
| Medium | before | 4 / 31 | 2 / 38 | 7 files / 199 lines |
| Medium | after | 4 / 32 | 3 / 46 | 7 files / 188 lines |
| Large | alone | 7 / 127 | 3 / 133 | — |
| Large | before | 5 / 122 | 1 / 123 | 7 files / 206 lines |
| Large | after | 7 / 124 | 2 / 100 | 6 files / 190 lines |

## 6. Reading

1. **Gates dominated.** 80–85 % of the agent-alone time is the repo's 82 s test suite; speclaw
   2.0.23 ran it twice (agent + Stop hook): 1.37–1.80× the agent alone.
2. **After the fixes speclaw is faster than the agent alone on small and large tasks** (0.80×,
   0.65×) and 1.24× on medium, with equal quality: every hidden test and every full-gate run passed
   in all nine runs.
3. **The small fix pays no ceremony:** level 0, nothing for the agent to write, archived by the
   hook.
4. **Cost stays above the agent alone (1.26–1.65×)**: the fixed instruction context (~10–16k
   tokens written to cache each session) and the level-2 artifacts.

## 7. Still slow — next steps (not in this change)

| Gap | Measured | Next step | Expected |
|-----|----------|-----------|----------|
| Stop test gate | 47–64 s (31 of 128 files for a one-line fix; ~15 s compile) | Select tests by **changed symbol**, not by file | small task ~40–50 s |
| Level-2 docs | +20–40 s model time on medium/large | Lighter level-2 artifacts (tasks + delta only; proposal from the commit body) | medium ≤ 1.1× |
| Fixed context | +10–16k tokens per session | Trim always-on CLAUDE/AGENTS/rules; load process detail on demand | −$0.08–0.13 per session |

## 8. Caveats

- One run per cell for medium and large; T0 had 3 per config before the fixes and they agreed
  within ±15 s.
- After-runs ran one at a time; before/alone pairs ran two at a time (same task, symmetric load):
  slightly favors the after-runs.
- The repo is speclaw itself (TypeScript, ~1,050 tests, 82 s suite); a repo with a faster suite
  shrinks the gate share and the gaps above.
- The large task's hidden test had two bugs of mine (missing `LAWS.md`; a pre-existing check that
  names every unarchived change); both configs were regraded with the fixed test.

## Verdict

✅ The fixes remove the doubled gate run and the small-fix ceremony: speclaw goes from 1.37–1.80×
the agent alone to 0.65–1.24× in time, quality unchanged; cost remains 1.26–1.65×.
