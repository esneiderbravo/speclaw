# Performance checks — enforce-compass-first (2026-10-06)

2026-10-06 · `feat/enforce-compass-first` (uncommitted working tree) vs `main` @ 9fa92e0f3477e45c6d2264dc74c3f5b41f03299b · `/Users/esneiderbravo/Projects/speclaw`, run with `scripts/bench/compass-first.mjs`

The human required this report (tasks 8.2 and 8.3, design §8).

## Environment

- OS: Darwin 25.5.0 (arm64). CPU: Apple M1 Max × 10. Node v24.17.0. Claude Code 2.1.285 (agent mode).
- Builds:
  - main: `main @ 9fa92e0` → build `2.0.3+bench-main`
  - branch: working tree `9fa92e0+dirty` → build `2.0.4+bench-branch`
  - Each build was materialized and built in its own copy under `os.tmpdir()/speclaw-bench-*`.
  - `--link-node-modules` was valid because `git diff main -- package-lock.json` changes only the root `version`.
- `--check-builds` printed `[main] CLI and MCP server are build 2.0.3+bench-main` and `[branch] CLI and MCP server are build 2.0.4+bench-branch`, exit 0. Every agent fixture's `.mcp.json` is pinned to its own ref's build and checked with an MCP `initialize` handshake.
- Isolation:
  - Fixtures are temp copies, and speclaw CLI runs use a sandboxed HOME.
  - The user's repo was only read.
  - Agent runs use the real HOME only for `claude` credentials (session transcripts).
  - Micro mode: N = 30 iterations plus 3 warm-ups per case per ref. Times are in ms.

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Build identity | `node scripts/bench/compass-first.mjs --check-builds --link-node-modules` | ✅ exit 0. Each ref's CLI and MCP server is its own build. |
| Micro-benchmarks (8.2) | `node scripts/bench/compass-first.mjs --link-node-modules --keep --json /tmp/sc-bench-micro.json` (default N=30) | ✅ exit 0. All 13 rows PASS their budgets (table below). |
| Agent benchmark (8.3) | `node scripts/bench/compass-first.mjs --link-node-modules --agent --agent-runs 3 --cases call-log-append --json /tmp/sc-bench-agent.json` | ✅ exit 0. 6/6 runs exited 0, none timed out (agent timeout 900 s). It ran on the first attempt with no retry. |

### Micro-benchmarks: main vs branch (N=30)

| Case | main median | main p95 | branch median | branch p95 | Δ median | Δ% | Budget |
| --- | --- | --- | --- | --- | --- | --- | --- |
| check-post-read:first-hit | 41.8 | 44.2 | 42.4 | 47.0 | +0.603 | +1.4% | PASS (p95<50ms) |
| check-post-read:steady | 42.2 | 44.1 | 41.7 | 47.5 | -0.449 | -1.1% | PASS (p95<50ms) |
| check-post-read:in-process | 0.005 | 0.019 | 0.115 | 0.148 | +0.110 | +2076.2% | PASS (p95<50ms) |
| check-post-grep:first-hit | 42.1 | 44.1 | 42.8 | 46.3 | +0.674 | +1.6% | PASS (p95<50ms) |
| check-post-grep:steady | 42.1 | 44.5 | 41.6 | 43.4 | -0.497 | -1.2% | PASS (p95<50ms) |
| check-post-grep:in-process | 0.005 | 0.006 | 0.124 | 0.156 | +0.119 | +2426.9% | PASS (p95<50ms) |
| check-post-glob:first-hit | 41.8 | 45.6 | 43.2 | 46.1 | +1.4 | +3.4% | PASS (p95<50ms) |
| check-post-glob:steady | 41.7 | 44.4 | 42.2 | 45.1 | +0.557 | +1.3% | PASS (p95<50ms) |
| check-post-glob:in-process | 0.005 | 0.019 | 0.120 | 0.131 | +0.115 | +2260.8% | PASS (p95<50ms) |
| check-pre-write | 42.6 | 45.5 | 43.0 | 44.7 | +0.453 | +1.1% | PASS (≤+10% or +2ms) |
| cortex-advance | 34.2 | 36.9 | 35.8 | 37.8 | +1.5 | +4.5% | PASS (≤+10% or +5ms) |
| index-noop | 303.9 | 311.9 | 319.6 | 336.4 | +15.8 | +5.2% | PASS (≤+10%) |
| call-log-append | — | — | 0.037 | 0.046 | — | — | PASS (p95<1ms/call) |

These are the bench's own output, quoted verbatim. Notes:

- On a cold log, the nudge fired on the branch for every first-hit case and on main for none (`check-post-{read,grep,glob}:first-hit main=false branch=true`).
- `call-log-append`: 1000 calls, rotation exercised. A second run in the agent invocation measured a median of 0.035 ms and a p95 of 0.045 ms.
- Branch index totals: `{"files":230,"nodes":948,"edges":14009}`.
- Reading the deltas:
  - The CLI rows (~42 ms) are dominated by Node process start-up, which is the same on both refs.
  - The real added cost of the nudge is the in-process row: **+0.11–0.12 ms median**. The large Δ% only reflects main's near-zero no-op baseline.
  - The worst nudge-path p95 is 47.5 ms against the 50 ms budget, so the headroom (~2.5 ms) is all process start-up.

### Agent benchmark: headless explorer, 3 runs per ref

The prompt for every run was: "Explore how a Cortex advance is persisted and who calls it. Follow the explore skill and return the brief for the planner. Do not edit any file." Each run uses the ref's own `ai-specs/agents/explorer.md` (its tools allowlist and body) on the same source tree.

| Ref | Run | Wall s | Total tool calls | Compass evidence | compass_index | Read/Grep/Glob | Evidence share | Nudge fired | compassEvidence (branch) | Gate warnings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| main | 1 | 59.0 | 17 | 12 | 1 | 2 | 86% | no | — (no gate on main) | — |
| main | 2 | 56.6 | 18 | 8 | 1 | 6 | 57% | no | — | — |
| main | 3 | 77.9 | 17 | 9 | 1 | 4 | 69% | no | — | — |
| **main mean** | | **64.5** | **17.3** | **9.7** | **1.0** | **4.0** | **71%** | 0/3 | | |
| branch | 1 | 39.0 | 10 | 7 | 0 | 1 | 88% | no | `{mode:warn, stage:exploring, calls:7}` | none |
| branch | 2 | 42.8 | 11 | 7 | 0 | 2 | 78% | no | `{mode:warn, stage:exploring, calls:7}` | none |
| branch | 3 | 45.5 | 12 | 8 | 0 | 2 | 80% | no | `{mode:warn, stage:exploring, calls:8}` | none |
| **branch mean** | | **42.4** | **11.0** | **7.3** | **0.0** | **1.7** | **82%** | 0/3 | gate satisfied 3/3 | 0 |

Δ branch vs main (means):

- Wall-clock: **−22.1 s (−34 %)**
- Total tool calls: **−6.3 (−37 %)**
- `compass_index`: **1 → 0**
- Read/Grep/Glob: **4.0 → 1.7 (−58 %)**
- Evidence share: **71 % → 82 %**

The nudge never fired because no branch run read code before calling Compass, so the gate was satisfied on its own evidence. The bench labels agent runs nondeterministic and makes no significance claim. With 3 runs per ref, read these as raw numbers.

To confirm the nudge path, which the agent runs never exercised, the tester ran one separate live `claude -p` in a throwaway repo with MCP pinned to the branch build. After a cold `Read`, the model received the nudge as hook context. See law-enforcement.md.

### Reference baselines (not re-measured, recorded for comparison)

| Run | Explorer Compass calls | compass_index | Read/Grep/Glob | Explorer time | Human question time |
| --- | --- | --- | --- | --- | --- |
| ftd-admin-finanzas FAR-2199 (real run, before this change) | 0 explore/find | 1 | 69 | 3.6 min | ~20 min across two question rounds (34 min to `implementing`) |
| This change's own Cortex explorer | 40 (31 explore + 9 find) | — | — | 3.5 min | One batched question round, ~7 min |
| Bench, main (controlled) | 9.7 mean | 1.0 | 4.0 | 64.5 s | n/a |
| Bench, branch (controlled) | 7.3 mean | 0.0 | 1.7 | 42.4 s | n/a |

## Tests added / updated

None by the tester. The bench script (`scripts/bench/compass-first.mjs`, task 8.1) was run as written.

## Spec-scenario coverage

Scope: the 46 `#### Scenario` blocks this change adds or modifies in its three delta specs. Each delta is a full copy of the canonical spec. The other scenarios in those copies are unchanged canonical text, and the full suite (618/618) still covers them. Test names below are `node:test` titles, and every one ran in `npm test` (0 skipped). "Manual" means the tester ran it with the built CLI or MCP server in the throwaway repo `/private/tmp/sc-mv-KmUn`. "Bench" means `scripts/bench/compass-first.mjs`.

### cli

| # | Scenario | Verified by |
| --- | --- | --- |
| C1 | Help documents feature draft | e2e `lawbook draft <name> --level 2 --json scaffolds a feature change` (asserts `/draft <name>/` in help). Manual: `speclaw help` lines 38–39 list `lawbook draft <name>` and `lawbook draft --bug <c>`. |
| C2 | Feature draft JSON has no branded header | Same e2e test (stdout parses as JSON). Manual: the first byte of `lawbook draft jsonhdr --level 1 --json` stdout is `{`. |
| C3 | Draft is an action, not a new tool | contract `lawbook_change accepts action draft without adding a tool`. Manual: MCP `tools/list` returns the same 29 names on main and branch builds, and the `lawbook_change.action` enum includes `draft`. |
| C4 | Warn-mode advance prints a warning on stderr | unit `CLI cortex advance prints the warn-mode warning to stderr and the strict rejection`. Manual: warn advance exits 0, stderr shows the `0 Compass evidence call(s)` count and the `!` warning, and stdout parses as JSON. |
| C5 | Strict-mode rejection exits non-zero | Same unit test. Manual: `cortex advance` and the `lawbook harness advance` alias both exit 1 with the `✗ compass-first: cannot leave stage "exploring"` error, and the `harness.json` sha256 is unchanged. |
| C6 | A no-op index still reports repository totals | integration `no-op reindex still reports repository totals equal to the DB row counts`; e2e `index prints repository totals and the next step, also as --json`. Manual: the no-op `index` prints `Totals: 2 files · 2 nodes · 1 edges` plus the next step. `--json` gives totals `{2,2,1}` with a zero delta, and a read-only sqlite count gives `2\|2\|1`. MCP `compass_index` returns the same. |

### law-enforcement

| # | Scenario | Verified by |
| --- | --- | --- |
| L1 | The Compass nudge entry is installed without laws | unit `compileHooks always emits the Read\|Grep\|Glob PostToolUse nudge entry, even with zero laws`, `compileHooks never puts the nudge matcher on PreToolUse`, `installHooks with zero laws installs the nudge, keeps foreign entries, and reruns without drift`. Manual: after `init --yes --agents claude`, `.claude/settings.json` has `PostToolUse` matcher `Read\|Grep\|Glob` with `mcp_tool`/`speclaw`/`speclaw_check` and a template carrying `file_path`, `path`, `pattern`, `glob`, `type`. The `PreToolUse` matcher is `Write\|Edit\|MultiEdit\|NotebookEdit` only. |
| L2 | The command-hook fallback carries PostToolUse context without a decision | unit `CLI --hook-payload on PostToolUse emits additionalContext and no permissionDecision`. Manual: a cold-log Read of `src/math.ts` prints `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"Compass first: …"}}` with exit 0. |
| L3 | The MCP result carries additionalContext on PostToolUse | unit `MCP speclaw_check carries hookSpecificOutput.additionalContext for PostToolUse, never a decision`. Manual MCP stdio probe: the result has `nudge`, `reason`, and `hookSpecificOutput{hookEventName:"PostToolUse",additionalContext}` and no `permissionDecision`. Live headless Claude Code 2.1.285 run: the agent received the nudge text as hook context after `Read`. |
| L4 | Reading code without recent Compass calls nudges | unit `Read on a .ts file with an empty call log nudges, even with no manifest`. Manual: see L2. |
| L5 | A recent Compass call suppresses the nudge | unit `a recent Compass evidence call suppresses the nudge; an old one does not`. Manual: `speclaw explore add` logs `compass_explore`, and the same Read payload then prints nothing (exit 0). |
| L6 | Nudges are rate limited | unit `nudges are rate limited to one per 5 minutes`. Manual: a second Read within 5 min prints nothing, and the log holds a single `nudge` entry. |
| L7 | Non-code and empty targets do not nudge | unit `non-code, empty, root, outside, ignored, and placeholder targets do not nudge`. Manual: `README.md`, `""`, and an unsubstituted `${tool_input.file_path}` each print nothing, and no log entry is written. |
| L8 | A repo-wide Grep or Glob nudges | unit `repo-wide Grep/Glob (no path or the project root) nudges over indexed code`. Manual: Grep with no path gives a nudge suggesting `compass_find "reduce"`, and Glob `**/*.ts` also nudges. |
| L9 | Reads never evaluate laws | unit `PostToolUse Read/Grep/Glob evaluates no law; PostToolUse Write still does`. Manual: a PostToolUse Read of `.env` returns the `law~no-secrets-in-repo~1` message on the main build and nothing on the branch build. |
| L10 | A dotted directory name is still a directory | unit `a directory with a dot in its name is a directory, not a file extension`. Manual: Grep on `src/v1.2` nudges. |
| L11 | Stop results carry no hookSpecificOutput | unit `Stop and InstructionsLoaded results never carry hookSpecificOutput, even with a reason`, `CLI --hook-payload keeps the pre-change output for Stop`. Manual: the MCP `Stop` result is `{verdict, evaluated, elapsedMs}` only. CLI Stop and InstructionsLoaded output is byte-identical to the main build. |
| L12 | Grep over a source directory nudges with the pattern | unit `Grep over a source directory nudges with the pattern`. Manual: Grep `reduce` in `src` produces a nudge suggesting `compass_find "reduce"`. |
| L13 | PreToolUse never nudges | unit `PreToolUse never nudges`. Manual: PreToolUse Read of `.ts` gives `permissionDecision allow`, no nudge, and no log entry. PreToolUse Write/Edit (allow) and `.env` (deny, exit 2) output is byte-identical to the main build. |
| L14 | The nudge never touches the index database | unit `the nudge opens no index database and loads no sqlite`. |
| L15 | The nudge path stays within the hook latency budget | Bench, N=30: `check-post-{read,grep,glob}` branch p95 is 43.4–47.5 ms (budget < 50 ms), and the in-process nudge median is 0.115–0.124 ms. See performance.md. |

### lawbook-workflow

| # | Scenario | Verified by |
| --- | --- | --- |
| W1 | Explore starts with compass_find, not compass_index | unit `explore investigates through compass_find/explore before indexing or reading`. Agent bench: the branch explorer made 0 `compass_index` calls in 3/3 runs, against 1 per run on main. |
| W2 | Reading code requires a named fallback | Same unit test. Agent bench: Read/Grep/Glob averaged 1.7 per run on the branch against 4.0 on main. |
| W3 | The brief reports how many Compass calls were made | unit `explore summarize brief carries the Compass call count`. |
| W4 | Level-2 feature draft writes the stubs the level requires | unit `feature draft at level 2 writes exactly that level's stubs`; e2e draft test. Manual: `lawbook draft demo --level 2 --capability demo --json` writes proposal, design, tasks, `specs/demo/spec.md`, `reports/README.md`, and `change.json` (`confirmedLevel 2`, `changeType feature`). |
| W5 | A fresh draft validates at every level | unit `a fresh level-{0..3} feature draft passes validate out of the box`. Manual: `lv0`–`lv3` each report `✓ … is valid`. |
| W6 | A placeholder delta cannot be synced silently | unit `a new-capability delta stub is a marked placeholder: validate warns, sync refuses`, `a delta that quotes the marker inline is not a placeholder: no warning, sync promotes`. Manual: validate gives a placeholder warning. `lawbook sync demo` exits 1 with `refusing to sync placeholder delta(s)`, and no canonical spec is written. |
| W7 | Quick and bug drafts keep accepting their existing names | unit `quick and bug drafts keep accepting non-kebab names (unchanged outputs)`. |
| W8 | The delta starts from an existing capability spec | unit `the delta stub starts from an existing canonical capability spec`. Manual: `lawbook draft widen --level 1 --capability widgets` copies the canonical `widgets` spec body. |
| W9 | Draft without a level leaves the level unconfirmed | unit `feature draft without a level leaves the level unconfirmed (validate uses 3)`. Manual: `nolevel/change.json` has no `confirmedLevel`. |
| W10 | An existing change directory is refused | unit `an existing change directory is refused without modifying it`. Manual: the CLI exits 1 and MCP `lawbook_change draft` returns `isError: true`. Bad name `Bad_Name` and `--level 7` also exit 1. |
| W11 | Quick and bug drafts are unchanged by the shared scaffold | unit `quick output is unchanged by the shared scaffold`, `bug draft output is unchanged by the shared scaffold`. `test/unit/bugfix.test.ts`, `test/integration/bugfix-flow.test.ts`, and the quick tests pass. Manual: `--bug fix-thing` writes `bugfix.md, change.json, reports`, and `quick tiny-fix` writes `record.md, change.json, reports`. |
| W12 | An explore call is recorded | unit `MCP compass_explore, compass_index, and an alias each record their tool name`. Manual: CLI `explore` and MCP `compass_explore` each append `{"tool":"compass_explore"}`. |
| W13 | Index calls are logged but are not evidence | unit `compass_index and nudge entries are not evidence`, `strict: compass_index-only evidence does not satisfy the gate`. Manual: `index` logs `compass_index`, and the strict advance is still rejected. |
| W14 | The log rotates at its size cap | unit `the log rotates to .jsonl.1 once it exceeds the size cap`, `a log at exactly the cap does not rotate`, `concurrent writers rotate without a short .1 generation or leftover temp files`. Bench: `call-log-append` over 1000 calls reports `rotation exercised: true`. |
| W15 | Rotation does not hide current-stage evidence | unit `evidence rotated into .1 still counts when the live log does not reach back to sinceMs`. |
| W16 | A write failure never fails the tool | unit `a write failure never throws`. |
| W17 | Strict mode blocks an explore stage with no Compass calls | unit `strict with no evidence rejects leaving exploring and leaves harness.json byte-identical`. Manual: see C5. |
| W18 | Warn mode advances with a warning | unit `warn (default) leaving implementing with only compass_index advances with a warning`. Manual: CLI and MCP warn advances return `compassEvidence{mode:"warn",calls:0}` and `warnings[1]`. |
| W19 | Evidence since stage start satisfies the gate | unit `strict with evidence since the stage started advances`. Manual: `explore sum` inside the stage, then a strict advance, exits 0 with `compassEvidence.calls 1`. Agent bench: branch `compassEvidence.calls` was 7/7/8 with no warnings. |
| W20 | Calls before the stage started do not count | unit `strict: calls before a rework entry do not count`, `stageStartedAt picks the newest entry entering the current stage`. Manual: an `explore` before `cortex start`, then a strict advance, is rejected. MCP: an explore during `planning` does not count when leaving `implementing` (`calls: 0`). |
| W21 | Off mode and ungated stages skip the check | unit `off mode skips the gate entirely`, `leaving planning is not gated, even in strict mode`, `start, status, and rework are never gated in strict mode`. Manual: with `compassGate: off`, the advance has no `compassEvidence`/`warnings` and empty stderr. planning→implementing returns no `compassEvidence`. An invalid value (`bogus`) falls back to `warn`. |
| W22 | Role agents list canonical tools only | unit `explorer and planner list canonical tool names only`, `agent tools lists name only always-registered canonical speclaw tools`. |
| W23 | Shipped workflow texts name no alias tool | unit `no shipped agent, skill, command, rule, or template names a deprecated alias tool`. `ai-specs/` matches `src/modules/lawbook/assets/` byte-for-byte (`cmp`, 0 diffs). |
| W24 | One question round covers explorer, planner, and level | unit `cortex dispatch runs one question round and an explorer template without paths`, `draft skips level confirmation when confirmed and names the draft scaffold`. |
| W25 | Explorer dispatch names symbols, not files | unit `cortex dispatch runs one question round and an explorer template without paths`. |

## Pre-existing / unrelated failures

None.

## Pending manual steps

None. Both tasks 8.2 and 8.3 were run by the tester, and the numbers above are from those runs.

Caveats:

- The bench fixture is a well-indexed TypeScript repo (speclaw itself), and main's explorer already leaned on Compass there. It did not reproduce FAR-2199's 0-explore/69-Read pattern. So the controlled improvement (−58 % Read/Grep/Glob, `compass_index` removed, −34 % wall time) is a lower bound on the effect in a repo where agents default to grep.
- The question-round time saving (~20 min → ~7 min) comes from the reference runs. The bench does not measure it.

## Improvement verdict

**Improved, no regression.**

- Hook, advance, and index costs stay inside every design §8 budget: nudge p95 ≤ 47.5 ms < 50 ms, `check-pre-write` +1.1 %, `cortex-advance` +4.5 %, `index-noop` +5.2 %, and call-log append p95 0.046 ms.
- At the agent level, the branch explorer:
  - stopped re-indexing (1 → 0 `compass_index`)
  - used fewer tool calls (−37 %) and fewer raw Read/Grep/Glob calls (−58 %)
  - finished faster (−34 % wall time)
  - satisfied the evidence gate in 3/3 runs
- Against the FAR-2199 baseline (0 Compass locates, 69 Read/Grep/Glob), the branch explorer's 7–8 evidence calls against 1–2 reads reverse the ratio.

## Verdict

PASS
