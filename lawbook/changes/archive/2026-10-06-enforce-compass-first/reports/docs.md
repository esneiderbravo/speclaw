# Docs checks — enforce-compass-first (2026-10-06)

2026-10-06 · `feat/enforce-compass-first` (uncommitted working tree) · `/Users/esneiderbravo/Projects/speclaw`, Node v24.17.0

Scope:

- Workflow texts (explore, draft, and cortex steps; role agents; commands; rules) in `ai-specs/` and the shipped copies in `src/modules/lawbook/assets/`.
- Foundation templates (`AGENTS`/`CLAUDE`/`compass`/`lawbook` standards).
- `docs/compass.md`, `docs/cortex.md`, and the `lawbook/config.yaml` comment.

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Format | `npm run check` | ✅ exit 0 (Prettier covers markdown). |
| Asset tests | `npm test` | ✅ 618/618. Includes `test/unit/explorer-brief.test.ts` (11), `test/unit/skill-steps.test.ts`, and `test/unit/update.test.ts`. |
| ai-specs ↔ shipped assets | `cmp` of every file under `src/modules/lawbook/assets/{agents,skills,commands,rules}` against `ai-specs/` | ✅ 0 differences. |
| No alias tool names in shipped texts | unit `no shipped agent, skill, command, rule, or template names a deprecated alias tool` | ✅ Pass. |
| Docs content | `git diff --stat main -- docs lawbook/config.yaml` | ✅ `docs/compass.md` +92/−5: call log `.speclaw/compass-calls.jsonl`, rotation, the nudge (PostToolUse only, context only, reads never evaluate laws), and the upgrade note on `refreshedDiverged`. `docs/cortex.md` +34: the `compassGate` section with off/warn/strict and a byte-identical `harness.json`. `lawbook/config.yaml`: `# compassGate: warn` comment. |
| Behavior of the texts | Agent bench (`--agent`, 3 runs per ref) | ✅ The branch explorer, following the new `01-investigate.md`, made 0 `compass_index` calls and 7–8 Compass evidence calls. Main's explorer made 1 `compass_index` per run. See performance.md. |

## Tests added / updated

These were updated by the implementers and reviewed here. `test/unit/explorer-brief.test.ts` covers:

- compass_find/explore before indexing or reading
- the brief's Compass call count
- canonical tool names in the explorer and planner
- the single question round and the explorer template without paths
- draft skipping the level confirmation
- no alias names
- agent tool lists naming only canonical tools

No docs test was added by the tester.

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

- Task 12.1: the `CLAUDE.md` / `AGENTS.md` operator notes are **not** updated in the working tree (`git diff main -- CLAUDE.md AGENTS.md` is empty).
- Task 12.2: these files are strict `speclaw.lock` paths. After 12.1 lands, a human must run `speclaw laws accept` on an interactive TTY. Agents never run it. Then `speclaw verify` must pass integrity.

Both items belong to the coordinator and the human, not this test run. They are listed here so the archive gate does not miss them.

## Verdict

PASS (the shipped texts and docs verified here are correct; 12.1 and 12.2 stay open as tracked tasks)
