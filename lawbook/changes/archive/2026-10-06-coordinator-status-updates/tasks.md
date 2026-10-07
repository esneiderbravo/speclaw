# Tasks — coordinator-status-updates

Ships in **2.0.8**. The coordinator owns the version bump and the CHANGELOG
entry.

## 0. Branch

- [x] 0.1 Step 0: Create the feature branch (must be first). It already exists
  and is checked out: `feat/coordinator-status-updates`, based on `main` after
  2.0.7 shipped.

## 1. Summary builder and interval config (design §1–§2)

- [x] 1.1 Add `src/modules/cortex/status.ts` with `CortexStatusSummary`,
  `buildStatusSummary(projectPath, state, now?)`, `countTaskCheckboxes`, and
  `readStatusIntervalMinutes`, exactly as in design §1–§2. Reuse
  `stageStartedAt` (`compass-gate.ts`) and `briefForStage` (`brief.ts`). Do
  not import from the lawbook module. Add
  `// Covers: req~cortex-status-summary~1` and
  `// Covers: req~cortex-status-interval~1`.
- [x] 1.2 Confirm with `compass_explore` that `compass-gate.ts` and `brief.ts`
  do not import `harness.ts`, so there is no import cycle. Result:
  `compass-gate.ts` imports only `types.ts`; `brief.ts` had a type-only
  `import type { HarnessStage } from "./harness.js"`, which would close
  `harness → status → brief → harness`. It now imports from the leaf
  `types.ts` (same precedent as `compass-gate.ts`).

## 2. Engine and transports (design §3)

- [x] 2.1 In `src/modules/cortex/harness.ts`, make `handleHarness` `status`
  return `{ state, summary }`, where `summary` is `null` without a harness.
  Widen the return type. Other ops are unchanged.
- [x] 2.2 In `src/modules/cortex/register.ts`, keep the MCP input schema
  unchanged. Make at most a minimal description tweak.
- [x] 2.3 In `src/cli/commands/cortex.ts`, for `status`, print `summary.line`
  to stderr unless `--json`. stdout stays the JSON document. Mention
  `--json` in the usage string if it is not already there.

## 3. Skill and command text (design §4)

- [x] 3.1 Edit the canonical assets under
  `src/modules/lawbook/assets/skills/cortex/steps/`:
  - `01-load-or-start.md`: a "Status updates" section covering the interval
    from `summary.statusIntervalMinutes`, one `CronCreate` timer only inside a
    run, background dispatch preferred, and a no-timer fallback;
  - `02-dispatch-loop.md`: a new item covering updates after every Cortex op
    and before every blocking dispatch, `questions` suppression, the content
    list, the session-language rule, and how the human stops the updates;
  - `03-complete.md`: `CronDelete` at `done` or on a stop.

  Markdown assets carry no `Covers:` tag, because the coverage scanner reads
  parsed code only. The skill-text test in 4.3 carries it instead. Keep each
  step naming only its successor. Keep the
  explorer-brief texts and the `steps/03-complete.md` pointer in 02. Do not
  touch `SKILL.md`.
- [x] 3.2 Add one line to `src/modules/lawbook/assets/commands/cortex.md`
  about status updates and `cortex.statusIntervalMinutes`.
- [x] 3.3 Mirror 3.1–3.2 identically into `ai-specs/skills/cortex/steps/` and
  `ai-specs/commands/` (the managed copy). Confirm that
  `test/integration/scaffold.test.ts` stays green.

## 4. Review and update the affected tests

- [x] 4.1 Add `test/unit/cortex-status.test.ts` (temp dirs only) with the cases
  in design §5:
  - checkbox counting;
  - the `record.md` fallback and `null`;
  - `pendingVerdicts` by level;
  - elapsed time with an injected `now`;
  - the `line` format and the `questions` suffix;
  - interval parsing (absent, 10, 0, -1, abc, 2.5, missing file);
  - `summary: null` without a harness.
- [x] 4.2 Update `test/unit/harness.test.ts` for the new `status` shape.
- [x] 4.3 Add a skill-text test for 01, 02, and 03. It checks
  `statusIntervalMinutes` / `CronCreate`, the language rule, `questions`
  suppression, stop, and `CronDelete`. Extend
  `test/unit/explorer-brief.test.ts` or add
  `test/unit/cortex-skill-status.test.ts`. Tag the test
  `// Covers: req~cortex-status-updates~1`. Tag 4.1 and 4.4 with the summary
  and interval requirement ids.
- [x] 4.4 Add an integration CLI test via `test/helpers/cli.ts runCli` in a
  temp repo. It checks the stderr line plus the stdout JSON with `summary`,
  and that `--json` suppresses the line.
- [x] 4.5 Run `speclaw affected-tests --from-diff main`, review every selected
  file, and confirm that `skill-steps`, `explorer-brief`, `mcp-budget`,
  `contract/registers`, and `integration/scaffold` are green.

## 5. Quality gates

- [x] 5.1 Run the quality gates and verify they pass (see
  docs/standards/testing-standards.md): `npm run check`, `npm run build`, and
  `npm test`. Run `lawbook_change validate` and
  `speclaw coverage --only-defects` for `req~cortex-status-summary~1`,
  `req~cortex-status-interval~1`, and `req~cortex-status-updates~1`.

## 6. Manual verification (tester executes it, never the user)

- [x] 6.1 Perform manual verification of the behavior — the tester role
  executes this itself, never the user. Use the built CLI in a scratch repo
  under `os.tmpdir()`:
  - run `init`, `lawbook draft demo --level 2`, and `cortex start --change
    demo`;
  - run `cortex status --change demo`: the stderr line and the JSON `summary`
    match the harness;
  - tick a task in `tasks.md` and check that the count changes;
  - set `cortex.statusIntervalMinutes` to 10, then 0, then `abc`, and check
    that the reported value is 10, 0, and 5;
  - run with `--json` and check that there is no stderr line;
  - run `status` for a change without `harness.json` and check
    `summary: null`;
  - through the MCP tool (or `handleHarness` in a node one-liner against the
    scratch repo), check the same `summary`.

  Host timer firing (`CronCreate`) cannot be automated here. Record the skill
  text inspection, and any live observation the coordinator makes later in
  this run, as evidence.

## 7. Discipline reports

- [x] 7.1 Produce the discipline reports under reports/ — one per discipline
  touched — with the unit/integration/e2e results for what the feature
  touched. Expected:
  - `api.md` (mandatory): the MCP `cortex` `status` result contract and the
    `speclaw cortex status` stdout/stderr/`--json` contract, the exit codes
    (0 / 1 for a missing change), how each was exercised, and isolation
    (temp dirs only);
  - `backend.md`: the summary builder and config parsing;
  - `skills.md`: the cortex skill text;
  - `docs.md`.

  Each report follows the required structure, and every `#### Scenario` in
  the delta spec is mapped.

## 8. Documentation

- [x] 8.1 Update the technical documentation touched by the change:
  - `docs/cortex.md`: the actions table (`status` now returns `summary`), the
    CLI section (stderr line, `--json`), a "Status updates" section (interval
    key, defaults, language rule, timer and fallback);
  - a commented `cortex:` / `statusIntervalMinutes: 5` block in the repo
    `lawbook/config.yaml`, next to the `compassGate` comment.
- [x] 8.2 Hand the coordinator the 2.0.8 CHANGELOG line for this change: "Cortex
  status summary and periodic coordinator status updates
  (`cortex.statusIntervalMinutes`)". The coordinator owns the version bump and
  the CHANGELOG.

## 10. Rework after review FAIL (reports/review.md)

- [x] 10.1 F1: `handleHarness` `status` returns `{ summary, state }`; add
  `fitStatusResult` (`status.ts`, design D12) and use it for the MCP `cortex`
  `status` and the `lawbook_change` `harness` alias `status`. The CLI JSON
  stays full.
- [x] 10.2 F1 test: `test/unit/cortex-status.test.ts` drives the captured
  `cortex` MCP handler (real `text()` path) with 30 long history entries and
  asserts valid JSON, `summary` first and complete, `historyOmitted` + kept
  entries = 30, newest entry kept, `harness.json` untouched, and the alias
  fitted too; plus unit cases for a small result and `stateOmitted`.
- [x] 10.3 m1–m4: skill step 01 creates the timer only for a non-null summary
  outside `done`, keeps the `CronCreate` id (or checks `CronList`), gives the
  1–59 and 60 schedules, and writes a self-contained timer prompt; 02 and 03
  delete by that id. `readStatusIntervalMinutes` caps at 60 (design D13).
  Mirrored to `ai-specs/`; `test/unit/cortex-skill-status.test.ts` extended.
- [x] 10.4 m5: `Status: approved` on `req~cortex-status-updates~1`; the delta
  spec gains the budget, cap, and timer clauses and their scenarios.
- [x] 10.5 m6/m7: doc comments on the scan limits of `countTaskCheckboxes`
  and `readStatusIntervalMinutes`; `docs/cortex.md` covers the MCP budget
  fitting, the 60 cap, and the alias returning `summary`. m8 stays a
  follow-up (harness level sync at `start` / `level set`).

## 9. Archive

- [x] 9.1 Archive the change within the same PR (lawbook:archive) after
  harness review/test PASS: reconcile and `sync` the delta spec, then
  `lawbook_archive`. Sync order: this change has no overlap. The former
  sibling changes `fix-compass-source-offsets` and `index-at-session-start`
  shipped in 2.0.7 and never touched `lawbook-workflow`. The delta is a
  full-file copy of `lawbook/specs/lawbook-workflow/spec.md` as of 2026-10-06,
  re-checked against the post-2.0.7 canonical (unchanged apart from the
  intended additions). If that canonical changes before sync, re-apply it here first.
