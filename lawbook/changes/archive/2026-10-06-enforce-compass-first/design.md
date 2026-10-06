# Design — enforce-compass-first

Level 2. This design is included because the change crosses three modules
(compass, cortex, foundation) plus shared and lawbook, and the module
boundaries, file formats, and hook semantics all have to be decided up front.

## 1. Compass call log (shared)

**New file `src/shared/compass-calls.ts`.** It only imports from `node:`
modules, because `shared` must not import modules or the CLI.

- `recordCompassCall(projectPath, tool)`
  - Appends `{"at":"<ISO>","tool":"<name>"}\n` to
    `.speclaw/compass-calls.jsonl`.
  - Best effort, like `logDeprecatedCall` in `src/shared/deprecation.ts`: it
    never throws and creates `.speclaw/` when missing.
  - **Rotation:** before appending, if the file is larger than 256 KiB, rename
    it to `compass-calls.jsonl.1`, replacing any earlier `.1`. Only one older
    generation is kept.
- `readCompassCalls(projectPath, { sinceMs?, maxBytes = 64 KiB })`
  - Reads at most the last `maxBytes` of the live file, drops a partial first
    line, and skips lines that fail to parse.
  - The log is append-ordered by time. So if the tail holds an evidence entry
    after `since`, the gate has its answer. If the tail holds no entry after
    `since`, no such entry exists anywhere. The bound never changes the result.
- `EVIDENCE_TOOLS`: `compass_explore`, `compass_find`, `compass_diff_context`,
  `compass_impact`, `compass_trace`, `compass_search`, `compass_recall`.
  `compass_index` is logged but is **not** evidence. The nudge writes `nudge`
  entries to the same log for rate limiting (§3), and those are not evidence
  either.

**Writers**

- **MCP.** The local `add` closure in `registerCompass`
  (`src/modules/compass/register.ts`) wraps every canonical handler so it
  records the canonical name. Each alias handler records the alias name next
  to its existing `logDeprecatedCall`.
- **CLI.** The CLI twins also record, because agents without MCP drive Compass
  through the shell. These are the `explore`, `find`/`search`, `recall`,
  `impact`, `trace`, and `diff-context` query commands, plus `index`. Each
  records its MCP-equivalent tool name. The commands are thin, so this is one
  call per command.

**Gitignore.** The log lives under `.speclaw/`. The explorer brief left open
whether `ensureGitignore` (`src/shared/install.ts:147`) covers `.speclaw/`.
The implementer verifies this. If it is not covered, the log is added to the
ignore set. There is a task for it.

## 2. Evidence gate (cortex)

**New file `src/modules/cortex/compass-gate.ts`.** It uses only fs, path, and
the shared helper above, and does **not** import lawbook (`req~cortex-module~1`).

- `readCompassGateMode(projectPath)`: regex-scans `lawbook/config.yaml` for a
  top-level `compassGate:` key with value `off`, `warn`, or `strict`. Quotes
  are optional and a trailing comment is allowed. If the file or key is
  missing, or the value is invalid, the mode is `warn`. The key is globally
  unique in the file, so a regex scan is enough. This matches the existing
  per-module scanners (`loadCeremonyConfig`, `loadCoverageConfig`,
  `parseTeamOwnersYaml`).
- `stageStartedAt(state)`: the `at` of the newest `history[]` entry whose `to`
  equals `state.stage`. A `start` entry has `to: "exploring"`, and a `rework`
  entry has `to: "implementing"`, so a rework restarts the window. If no entry
  matches, every log entry is eligible.
- `evaluateCompassGate(projectPath, state)`: returns
  `{ mode, stage, since, calls, satisfied }`, where `calls` counts evidence
  entries at or after `since`.

**Wiring.** In the `advance` branch of `handleHarness`, before `writeHarness`:

- The gate applies when the stage being left is `exploring` or `implementing`
  and the mode is not `off`.
- **`strict`, no evidence:** throw. The error names the stage, the evidence
  tools, and the `compassGate` key. Nothing is written. This reuses the
  existing illegal-advance error path, so `harness.json` stays byte-identical.
- **`warn`, no evidence:** advance as usual. The result also carries
  `warnings: ["compass-first: …"]`.
- **Every gated advance:** the result carries
  `compassEvidence: { mode, stage, since, calls }`. The history `note` is left
  unchanged.

`rework`, `start`, and `status` are never gated. All four callers
(`registerCortex`, `runCortex`, the `runSpec` harness alias,
`handleLawbookChange` harness) go through `handleHarness`, so all of them are
gated. The CLI prints `warnings` to stderr.

**Accepted limitation.** The log is per project. A concurrent session in the
same repo can satisfy another session's gate. This is documented in
`docs/cortex.md`.

## 3. Compass-first nudge (foundation)

**Hook entry.**

- `compileHooks` always emits one extra `PostToolUse` entry for hook-capable
  agents, with matcher `Read|Grep|Glob`, even when the manifest has no laws.
- It keeps the speclaw identity `{type:"mcp_tool", server:"speclaw",
  tool:"speclaw_check"}`, so `mergeHooks` still replaces only speclaw entries.
- The shared input template gains `payload.tool_input.path`
  (`${tool_input.path}`) and `payload.tool_input.pattern`
  (`${tool_input.pattern}`), in addition to `file_path`.

**Why `PostToolUse` and never `PreToolUse`.** Claude Code does not document
what an `mcp_tool` result means on `PreToolUse`, nor `additionalContext` there.
A `PreToolUse` "allow" would auto-approve reads. `PostToolUse` is the channel
feedback laws already use: the result text enters the agent's context, and the
event cannot gate the tool.

**Evaluation.** In `checkAction` (`src/modules/foundation/check.ts`), when
`event === "PostToolUse"` and `tool_name` is `Read`, `Grep`, or `Glob`:

1. **Target.** Take the first non-empty value of `file_path`, then `path`. A
   value that still contains a literal `${` (an unsubstituted placeholder)
   counts as empty. If the target is empty, resolves to the project root, falls
   outside the project, or sits under `node_modules/`, `.git/`, `.speclaw/`, or
   `dist/`, there is no target and no nudge.
2. **Eligibility.** The target is eligible when its extension is in Compass's
   indexed-language table. For `Grep` and `Glob` only, it is also eligible
   when it has no extension (a directory), or when `pattern` ends in an
   indexed extension (for example `**/*.ts`).
3. **Evidence.** `readCompassCalls` with `sinceMs = 10 min`. If there is any
   evidence entry, there is no nudge.
4. **Rate limit.** If the log tail has a `nudge` entry from the last 5 min,
   there is no nudge. Otherwise record a `nudge` entry and emit one.
5. **Text.** Add a short line to `result.nudge` and to `result.reason`, next
   to any feedback-law messages: "Compass first: no compass_find /
   compass_explore call in the last 10 min. Try `compass_explore <stem>` or
   `compass_find "<pattern>"` before reading code." For Grep, `<pattern>` is
   the Grep pattern. Otherwise it is the target file's stem.

**Placement and failure.** The nudge branch runs **before** the law manifest
is loaded. A missing manifest still fails open for laws, and the nudge works
without one. Any nudge error is swallowed and the result has no nudge. The
nudge never changes `verdict`, which stays `allow` on `PostToolUse` because
only `bloqueo` laws on `PreToolUse` can deny.

**No index access.** The extension table must load no grammar and open no DB.

- If `langForPath` in `src/modules/compass/languages.ts` is a pure
  extension-to-language map, foundation imports it. A module may import
  another module's public export. The `law~compass-does-not-import-foundation~1`
  law only forbids the reverse direction.
- Otherwise, move the extension table to `src/shared/code-extensions.ts` and
  have both modules import it.

The rule that the check makes no index database query is unchanged.

**CLI fallback.** `runCheck --hook-payload -` (`src/cli/commands/check.ts`):
for any event other than `PreToolUse`, it emits
`{"hookSpecificOutput":{"hookEventName":"<event>","additionalContext":"<reason>"}}`
when a reason exists and nothing otherwise. It never emits a
`permissionDecision` and always exits 0. `PreToolUse` behavior is unchanged.

**Upgrade.** On `speclaw update`, existing installs report
`refreshedDiverged` for the hook settings because the entry set changed. This
is expected and documented in `docs/compass.md` and the operator notes.

## 4. `compass_index` totals and next step

`IndexStats` (`src/modules/compass/indexer.ts`) gains two fields:

- `totals: { files, nodes, edges }`: `COUNT(*)` on the open DB after the run,
  for the whole repository rather than the delta.
- `nextStep: string`, for example: "Index ready: 412 files, 3,180 symbols.
  Next: compass_find "<concept>" or compass_explore <symbol> — do not grep."

Both are additive. `buildIndex` callers (`runIndex`, `runWatch`, `runInit`,
`scheduleReindex`) need no change beyond the CLI printing them. `speclaw
index` prints a totals line and the hint. `--json` carries both fields.

## 5. Generic change scaffold (lawbook)

**New `scaffoldChange(projectPath, name, { level?, changeType, targets? })`**
in `src/modules/lawbook/scaffold-change.ts`:

- Rejects an existing directory and an invalid kebab-case name.
- Creates `reports/README.md`.
- Proposes a level from the targets.
- When `level` is passed, records it with `setCeremonyLevel` and writes
  `changeType` to `change.json`.
- `scaffoldQuick` and `scaffoldBugfix` delegate to it and keep their artifact
  templates.

**Feature draft** (`changeType: "feature"`) writes stub artifacts for the
level:

| Level | Stubs |
| --- | --- |
| 0 | `record.md` with a checklist |
| 1 | `record.md` + `tasks.md` |
| 2 | `proposal.md` + `tasks.md` |
| 3 | `proposal.md` + `design.md` + `tasks.md` |

Without `--level`, `change.json` holds only the proposal and `changeType` with
no `confirmedLevel`. Validate then treats the change as level 3 until
`lawbook level set` confirms a level, per the "Confirmed ceremony level is
persisted" requirement.

**CLI.** `speclaw lawbook draft <name> [--level N] [--json]` scaffolds a
feature change. `--bug` keeps today's path.

**MCP.** `lawbook_change` gains action `draft`: `change` is required, `level`
and `bug` are optional. No new tool, so the cap stays at nine. The
description growth must stay within the `mcp-budget` test cap. Keep the
addition to a few words.

## 6. Workflow texts

`ai-specs/` and the shipped copies under `src/modules/lawbook/assets/` must
change identically:

- **`skills/explore/steps/01-investigate.md`**
  - Locate with `compass_find` and read with `compass_explore` first.
  - Run `compass_index` only when find returns nothing or reports a
    missing or stale index.
  - Read/Grep code only after naming the reason (the three Rule 1 fallbacks).
- **`skills/explore/steps/02-summarize.md`:** the brief carries
  `Compass calls made: N` (explore/find/diff_context counts).
- **`agents/explorer.md`:** tool list uses `compass_explore`, `compass_find`,
  `compass_diff_context`, `compass_index`, and `lawbook_change`. Drop the
  `compass_impact` and `compass_trace` aliases.
- **`agents/planner.md`:** drop `lawbook_level` and keep `lawbook_change`.
- **`skills/cortex/steps/02-dispatch-loop.md`**
  - Add an explorer dispatch template: the intent, the named symbols or
    concepts, and the questions to answer. Never file paths to read.
  - Add the single question round. After the explorer, the coordinator
    proposes a level with `lawbook_change` action `level`, mode `propose`
    (paths and symbols from the brief), and dispatches the planner for
    questions only.
  - The coordinator merges the explorer open questions, the planner
    questions, and the level proposal into **one** `pauseForQuestions`
    advance.
  - After the answers, the coordinator records the level with mode `set`
    (evidence in `reason`) and redispatches the planner to draft.
- **`skills/draft/steps/02-understand.md`:** when `change.json` already has a
  `confirmedLevel`, skip the planner's separate level confirmation.
- **`skills/draft/steps/04-write-artifacts.md`:** name
  `speclaw lawbook draft <name> --level N` / `lawbook_change` `draft` as the
  scaffold entry.

`test/unit/skill-steps.test.ts` and `test/unit/explorer-brief.test.ts` guard
step chains and brief fields. Update them as needed.

## 7. Docs, lock, version

- **Docs:** `docs/compass.md` covers the call log, the nudge, `compassGate`,
  and the upgrade "refreshedDiverged" note. `docs/cortex.md` covers the gate,
  the single question round, and the per-project limitation. Add an operator
  note to `CLAUDE.md` / `AGENTS.md`.
- **Lock:** `CLAUDE.md` and `AGENTS.md` are **strict** paths in
  `speclaw.lock`. Editing them makes `speclaw verify` fail until a human runs
  `speclaw laws accept` on an interactive TTY. That command is never run over
  MCP or by an agent. The coordinator must surface this to the human before
  archive.
- **Version:** `package.json` goes from 2.0.3 to 2.0.4.

## 8. Performance comparison (human requirement)

The tester writes `reports/performance.md`, a `main` vs
`feat/enforce-compass-first` improvement report. It follows the standard
report structure and records real observed numbers only.

### Harness: `scripts/bench/compass-first.mjs`

The script is committed and has no dependencies. It is plain Node ESM, like
`scripts/budget-calibrate.mjs`, and uses only `node:` modules.

- **Isolation.** It creates two git worktrees under a temp dir (`main` and the
  branch ref), runs `npm ci && npm run build` in each, and benchmarks each
  worktree's `dist/cli/index.js`. Every fixture is a throwaway copy:
  `git worktree` or `cp -R` into `os.tmpdir()`. It never writes to the user's
  repo, index, or real data, and removes the worktrees on exit.
- **Run rules.** Same machine and the same Node for both refs. Each case runs
  `N` iterations (`--iterations`, default 30, minimum 20) after 3 warm-up runs.
  Results are median, p95, min, and max, timed with `process.hrtime.bigint()`.
- **Output.** `--json` writes a results file. The default prints a markdown
  table with columns case, main median/p95, branch median/p95, Δ median, and
  Δ%. Environment details come first: OS, CPU model and count, Node version,
  both commit SHAs, iterations, and date.

### Micro-benchmarks

Each case runs inside a scratch copy of this repo, or of a small fixture repo
built by the script.

| Case | How | Budget |
| --- | --- | --- |
| `check-post-read` | `speclaw check --hook-payload -` with a `PostToolUse` Read payload for `src/server.ts` (call log empty, so the nudge path runs, then rate-limited on later runs; report both first-hit and steady-state) | branch p95 < 50 ms; far under the 5 s hook timeout |
| `check-post-grep` / `check-post-glob` | same, Grep payload `{path:"src", pattern:"handleHarness"}` / Glob payload `{pattern:"src/**/*.ts", path:"src"}` | p95 < 50 ms |
| `check-pre-write` | `PreToolUse` Write payload for `src/x.ts` | no regression: branch median within +10 % or +2 ms of main |
| `cortex-advance` | `speclaw cortex advance` on a scratch change (re-created per iteration) with `compassGate` `warn` and a populated call log | branch median within +10 % or +5 ms of main |
| `index-noop` | `speclaw index` on an already-indexed scratch copy of this repo (no changes) | no regression beyond +10 %; branch shows `totals` |
| `call-log-append` | in-process `recordCompassCall` × 1,000 against a temp `.speclaw/`, including one rotation | report per-call µs; p95 < 1 ms |

`main` has no nudge, gate, or call log. For those cases the `main` column
measures the same command on `main`, which is the baseline cost the hook or
advance already pays. `call-log-append` reports the branch only. The report
states this explicitly instead of inventing a `main` number.

### Agent-level benchmark

The script's `--agent` mode is opt-in. It runs only when the `claude` CLI is
on `PATH` and the tester passes `--agent`.

- **Fixture.** A fresh throwaway worktree of this repo per run, with no access
  to the user's real repos or data.
- **Task.** A fixed explorer prompt, stored in the script, asking to explore
  "how a Cortex advance is persisted and who calls it". It runs headless:
  `claude -p --output-format stream-json` with the explorer agent definition
  from that worktree, so `main` uses `main`'s skills and agents and the branch
  uses the branch's.
- **Runs.** N ≥ 3 per ref (`--agent-runs`, default 3).
- **Metrics,** parsed from the stream JSON:
  - wall-clock time;
  - total tool calls;
  - Compass evidence calls (explore/find/diff_context/impact/trace/search/recall);
  - `compass_index` calls;
  - Read/Grep/Glob calls;
  - whether a Compass-first nudge appeared in tool results;
  - (branch only) the `compassEvidence` and `warnings` from a scripted
    `cortex advance` after the run.
- **Reporting.** Each ref gets mean, min, and max. Agent runs are
  nondeterministic, so the report shows each run's raw numbers and makes no
  significance claim.

### Reference points

These are quoted in the report, not re-measured.

| Run | Compass evidence calls | compass_index | Read/Grep/Glob | Time |
| --- | --- | --- | --- | --- |
| ftd-admin-finanzas FAR-2199 explorer (before) | 0 | 1 | 69 | 34 min to implementing, ~20 min in two human question rounds |
| enforce-compass-first explorer (this change) | 40 (31 explore + 9 find) | — | — | 3.5 min |

The single question round cannot be measured by the agent benchmark because
human latency dominates it. The report quotes the reference: two rounds
before, one round in this change's own harness history.

### Verdict rule

`performance.md` PASSes when:

- every micro-benchmark meets its budget;
- the agent benchmark shows the branch's Compass-evidence share
  (evidence / (evidence + Read/Grep/Glob)) at or above `main`'s.

If the agent benchmark could not run (no `claude` CLI or no credentials), the
report says so and records the pending manual step. It does not invent
numbers.

## Decisions taken by the planner

- **Call-log contract lives in `lawbook-workflow`, not `code-graph`.** The log
  exists only to serve the gate and the nudge, and no Compass tool contract
  changes. Keeping it next to the gate requirement avoids rewriting the large
  `code-graph` spec for a side effect.
- **The nudge needs a 10 min evidence window and a 5 min rate limit.** Without
  them, every Read in a long session would nudge.
- **Grep/Glob on a directory target are eligible; Read is eligible only for
  indexed extensions.** Searching a directory is exactly the grep-as-code-search
  pattern this change targets.
- **The "Draft and explore refresh the code index first" requirement is
  renamed** to "Explore locates through Compass before indexing or reading
  code". This is a deliberate rename, so validate's dropped-requirement
  warning for the old header is expected.
