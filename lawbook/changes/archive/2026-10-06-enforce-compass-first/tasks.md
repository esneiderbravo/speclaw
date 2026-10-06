# Tasks — enforce-compass-first

## 0. Branch

- [x] 0.1 Step 0: Make sure the feature branch `feat/enforce-compass-first`
  exists and is checked out (`git branch --show-current`). It already exists,
  so verify it rather than creating it.

## 1. Shared call log

- [x] 1.1 Add `src/shared/compass-calls.ts` with `recordCompassCall`,
  `readCompassCalls` (bounded 64 KiB tail), `EVIDENCE_TOOLS`, and rotation at
  256 KiB to `.jsonl.1` (design §1). Import only from `node:` modules. Add
  `// Covers: req~compass-call-log~1`.
- [x] 1.2 Check whether `ensureGitignore` (`src/shared/install.ts`) covers
  `.speclaw/compass-calls.jsonl*`. If it does not, add the log to the ignore
  set.
- [x] 1.3 Record calls from the `add` closure in `registerCompass` (canonical
  tools, including `compass_index`) and from each alias handler. Do the same
  in the CLI twins (`explore`, `find`/`search`, `recall`, `impact`, `trace`,
  `diff-context`, `index`).
- [x] 1.4 Add unit tests `test/unit/compass-calls.test.ts`:
  - append, then read;
  - a malformed line is skipped;
  - a partial first line in the tail is dropped;
  - rotation at the size cap;
  - `sinceMs` filter;
  - `compass_index` and `nudge` entries are not evidence;
  - a write failure never throws.

## 2. Cortex evidence gate

- [x] 2.1 Add `src/modules/cortex/compass-gate.ts`: `readCompassGateMode`
  (regex scan of `compassGate:`, default `warn`), `stageStartedAt`, and
  `evaluateCompassGate` (design §2). It must not import from
  `src/modules/lawbook`. Add `// Covers: req~compass-evidence-gate~1`.
- [x] 2.2 Wire the gate into the `advance` branch of `handleHarness`.
  - `strict` with no evidence rejects without writing.
  - `warn` adds `warnings`.
  - Every gated advance returns `compassEvidence`.
  - `rework`, `start`, and `status` stay ungated.
- [x] 2.3 Make `speclaw cortex advance` (and the `lawbook harness` alias) print
  gate warnings to stderr and the rejection message on a strict failure.
- [x] 2.4 Extend `test/unit/harness.test.ts` (or add
  `test/unit/compass-gate.test.ts`) to cover:
  - each of the three modes;
  - an invalid or missing key falls back to `warn`;
  - leaving `exploring` and leaving `implementing` are both gated;
  - leaving `planning` is not gated;
  - a strict rejection leaves `harness.json` byte-identical;
  - rework resets the window;
  - `compass_index`-only evidence does not satisfy the gate.

## 3. Compass-first nudge

- [x] 3.1 Make `compileHooks` always emit a `PostToolUse` entry with matcher
  `Read|Grep|Glob` for hook-capable agents, with the speclaw `mcp_tool`
  identity. Add `tool_input.path` and `tool_input.pattern` to the input
  template.
- [x] 3.2 Make the Compass indexed-extension table available to foundation
  without grammar or DB loading: import a pure `langForPath`, or move the
  table to `src/shared/code-extensions.ts` (design §3).
- [x] 3.3 Add the nudge branch to `checkAction`. It runs before the manifest
  load, and covers target resolution, unsubstituted-placeholder handling,
  eligibility, the 10 min evidence window, the 5 min rate limit, and the
  `nudge` and `reason` text. It fails open and never changes `verdict`. Add
  `// Covers: req~compass-nudge~1`.
- [x] 3.4 In `runCheck --hook-payload`, for any event other than
  `PreToolUse`, emit `hookSpecificOutput.additionalContext` with no
  `permissionDecision` and exit 0.
- [x] 3.5 Update `test/unit/hooks.test.ts` and
  `test/integration/hooks.test.ts`:
  - the nudge entry is present with zero laws;
  - the template carries path and pattern;
  - non-speclaw entries are preserved;
  - a rerun produces no drift.
- [x] 3.6 Update `test/unit/check.test.ts`:
  - Read on a `.ts` file with an empty log nudges;
  - a recent evidence call suppresses the nudge;
  - the rate limit holds;
  - a `.md` target, an empty or root target, and an unsubstituted
    placeholder do not nudge;
  - a missing manifest still nudges;
  - `PreToolUse` never nudges;
  - no index DB is opened;
  - the CLI PostToolUse output has no `permissionDecision`.

## 4. Index totals and next step

- [x] 4.1 Add `totals {files,nodes,edges}` and `nextStep` to `IndexStats` /
  `buildIndex`, and print them in `speclaw index` (human and `--json`).
- [x] 4.2 Extend `test/integration/compass.test.ts` and `reindex.test.ts`:
  - totals equal the DB counts on a fresh index and on a no-op rerun (where
    the delta is zero but the totals are not);
  - `nextStep` names `compass_find` / `compass_explore`.

## 5. Change scaffold

- [x] 5.1 Extract `scaffoldChange` (`src/modules/lawbook/scaffold-change.ts`)
  and make `scaffoldQuick` / `scaffoldBugfix` delegate to it with unchanged
  outputs.
- [x] 5.2 Add feature draft: `speclaw lawbook draft <name> [--level N]
  [--json]` (keep `--bug`), and `lawbook_change` action `draft` (`change`,
  optional `level`, optional `bug`). Keep the tool description within the
  budget. Add `// Covers: req~feature-draft~1`.
- [x] 5.3 Tests:
  - `test/unit/bugfix.test.ts`, `test/integration/bugfix-flow.test.ts`, and
    `quick.test.ts` still pass unchanged;
  - new feature-draft unit tests for levels 0–3 stubs, no `--level` meaning no
    `confirmedLevel`, and an existing directory or bad name being rejected;
  - a contract test for the `draft` action in `test/contract/registers.test.ts`;
  - an e2e `lawbook draft <name> --level 2 --json` case in `test/e2e/cli.test.ts`;
  - `test/unit/mcp-budget.test.ts` and `test/integration/mcp-surface.test.ts`
    stay green with nine tools.

## 6. Workflow texts (ai-specs and shipped assets, identically)

- [x] 6.1 Rewrite `skills/explore/steps/01-investigate.md`: `compass_find` /
  `compass_explore` first, `compass_index` only on an empty or missing index,
  and Read/Grep on code only with a named reason.
- [x] 6.2 Add `Compass calls made: N` to the brief template in
  `skills/explore/steps/02-summarize.md`.
- [x] 6.3 Use canonical tool names in `agents/explorer.md` and
  `agents/planner.md`: drop `compass_impact`/`compass_trace`/`lawbook_level`,
  add `compass_diff_context` and `lawbook_change`.
- [x] 6.4 Add the explorer dispatch template and the single question round
  (level `propose` → one `pauseForQuestions` → level `set` with evidence) to
  `skills/cortex/steps/02-dispatch-loop.md`.
- [x] 6.5 In `skills/draft/steps/02-understand.md`, skip the separate level
  confirmation when `confirmedLevel` already exists. In `04-write-artifacts.md`,
  name `speclaw lawbook draft <name> --level N` / `lawbook_change draft`.
- [x] 6.6 Apply every edit in 6.1–6.5 to both `ai-specs/` and
  `src/modules/lawbook/assets/`. Update `test/unit/skill-steps.test.ts` and
  `test/unit/explorer-brief.test.ts`, plus `test/unit/update.test.ts` if the
  asset digests are pinned.

## 7. Review and update the affected tests

- [x] 7.1 Review and update the affected tests. Run
  `speclaw affected-tests --from-diff main` and check that every selected test
  file was reviewed. That includes `test/integration/verify.test.ts`,
  `test/integration/retrieval.test.ts`,
  `test/unit/indexer-stat-prefilter.test.ts`, `test/unit/levels.test.ts`, and
  `test/unit/deprecation.test.ts`.

## 8. Performance benchmark (human requirement)

- [x] 8.1 Add `scripts/bench/compass-first.mjs` (design §8). It needs:
  - throwaway git worktrees for `main` and the branch, each built;
  - micro-benchmarks `check-post-read`, `check-post-grep`, `check-post-glob`,
    `check-pre-write`, `cortex-advance`, `index-noop`, and `call-log-append`,
    with N ≥ 20 (default 30), 3 warm-ups, and median/p95/min/max;
  - opt-in `--agent` headless explorer benchmark (N ≥ 3 per ref);
  - `--json` and a markdown table with deltas and an environment header;
  - cleanup of the worktrees.

  It must never write outside temp dirs.
- [x] 8.2 The tester runs the micro-benchmarks and records the real numbers.
  Budgets:
  - nudge-path `speclaw check` p95 < 50 ms;
  - no regression beyond the design §8 budgets for `check-pre-write`,
    `cortex-advance`, and `index-noop`.
- [x] 8.3 The tester runs the agent-level benchmark (`--agent`, N ≥ 3 per ref)
  against throwaway worktrees. It records:
  - wall-clock time;
  - total tool calls;
  - Compass evidence calls vs Read/Grep/Glob;
  - `compass_index` calls;
  - whether the nudge fired;
  - the branch's `compassEvidence` and `warnings`.

  If it cannot run, record why as a pending manual step.

## 9. Quality gates

- [x] 9.1 Run the quality gates and verify they pass (see
  docs/standards/testing-standards.md): `npm run check`, `npm run build`, and
  `npm test` (node:test with the ≥ 80 % coverage floor). Run
  `lawbook_change validate` and `speclaw coverage --only-defects` for the new
  requirement ids.

## 10. Manual verification (tester executes it, never the user)

- [x] 10.1 Perform manual verification of the behavior — the tester role
  executes this itself, never the user. Use the built CLI in a scratch repo
  under `os.tmpdir()`:
  - `init`, then check that the settings carry the `Read|Grep|Glob`
    PostToolUse speclaw entry;
  - `index`, then check that totals and the next step print;
  - pipe a PostToolUse Read payload for a `.ts` file into
    `check --hook-payload -`: it gives `additionalContext`, no
    `permissionDecision`, and exit 0;
  - run `explore`, then the same payload again, and get no nudge;
  - `lawbook draft demo --level 2 --json`;
  - `cortex start` + `advance` with `compassGate` at `warn`, then at
    `strict`, with and without a prior `explore`.

## 11. Discipline reports

- [x] 11.1 Produce the discipline reports under reports/ — one per discipline
  touched — with the unit/integration/e2e results for what the feature
  touched: `backend.md`, `hooks.md`, `api.md`, `cli.md`, `docs.md`, and
  `performance.md` (main vs branch, design §8). Each follows the required
  structure, and every `#### Scenario` in the delta specs is mapped.

## 12. Documentation and release

- [x] 12.1 Update the technical documentation touched by the change:
  - `docs/compass.md`: call log, nudge, upgrade `refreshedDiverged` note;
  - `docs/cortex.md`: `compassGate`, single question round, per-project
    limitation;
  - the `lawbook/config.yaml` comment for `compassGate`;
  - the operator notes in `CLAUDE.md` / `AGENTS.md`.
- [x] 12.2 `CLAUDE.md` / `AGENTS.md` are strict `speclaw.lock` paths. Ask the
  human, through the coordinator, to run `speclaw laws accept` on an
  interactive TTY. Agents never run it and never use MCP for it. Then confirm
  `speclaw verify` passes integrity.
- [x] 12.3 Bump `package.json` (and the lockfile's root version) from 2.0.3
  to 2.0.4.

## 13. Archive

- [x] 13.1 Archive the change within the same PR (lawbook:archive) after
  harness review/test PASS: reconcile and `sync` the delta specs, then
  `lawbook_archive`.
