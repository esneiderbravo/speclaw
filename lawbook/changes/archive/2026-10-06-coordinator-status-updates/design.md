# Design — coordinator-status-updates

Level 2 (design optional). This design is written because the change adds to
a public MCP/CLI result and introduces a config key. It also turns
host-dependent timer behavior into skill text, and several human decisions
must be recorded as binding.

## Decisions

| # | Decision | Source |
|---|----------|--------|
| D1 | The work is split in two: skill guidance, plus a compact summary on `cortex status`. The summary is an API surface, so `api.md` is owed. | human |
| D2 | `cortex.statusIntervalMinutes` lives in `lawbook/config.yaml`, default 5. `0` disables. | human |
| D3 | The summary carries the full content: stage, active role, elapsed time in stage, tasks done/total, rework iteration/max, and pending verdicts. | human |
| D4 | Updates are written in the session's language, meaning the language of the human's most recent messages. Stage, role, and tool names, file paths, and change names stay in English. | human |
| D5 | The MCP input schema is unchanged and `change` stays required. There is no all-changes mode: a Cortex run coordinates one named change, and loosening `change` for every action would weaken the contract and cost schema budget (`test/unit/mcp-budget.test.ts`). | planner |
| D6 | The summary goes on `status` only. `brief` is unchanged. | planner |
| D7 | The engine renders `line` in English only. It cannot know the session language. The coordinator writes the human-facing update from the structured fields, in the session language (D4). The CLI shows `line` as is. | planner |
| D8 | CLI compatibility: stdout of `speclaw cortex status` stays the JSON document, which now includes `summary`. The human `line` goes to **stderr**, and `--json` suppresses it. | planner |
| D9 | `0` disables every unsolicited update: timer pings and the per-op and pre-dispatch updates. An explicit human request for status is always answered. | planner (interpretation of D2) |
| D10 | Invalid values fall back to 5: a value that is non-numeric, negative, or not an integer, a missing key, a missing `cortex:` block, or a missing file. | planner |
| D11 | The tasks count is parsed inside the cortex module, with no lawbook import (`req~cortex-module~1`). | planner |
| D12 | (rework after review F1) The `status` result puts `summary` before `state`. On the MCP path (`cortex` and the deprecated `lawbook_change` `harness` alias), `fitStatusResult` keeps the pretty-printed JSON under the brief output budget so `text()` never cuts it: it drops the oldest `state.history` entries (binary search on the kept count, newest kept) and adds `historyOmitted`; if an empty history still does not fit, `state` becomes `null` with `stateOmitted: true`. Trimming by budget rather than a fixed N is what guarantees valid JSON whatever the note lengths. The CLI prints the full JSON (no budget there), and `harness.json` is never rewritten. | implementer |
| D13 | (rework after review m3) `statusIntervalMinutes` is capped at 60: a cron every-N-minutes step only exists for N ≤ 59, and 60 is the hourly ping. The skill maps 1–59 to `*/N * * * *` and 60 to an hourly expression. Values above 60 clamp to 60 rather than falling back to 5, which keeps the user's intent (slow updates). | implementer |
| D14 | (rework after review m1, m2, m4) The skill creates the timer only when the summary is non-null and the stage is not `done`; keeps the id `CronCreate` returns (or checks `CronList`) so exactly one timer exists and `CronDelete` targets it; and writes a self-contained timer prompt naming the change and the rules (skip in `questions`, session language, self-delete at `done` or stop). | implementer |

## 1. Summary builder (`src/modules/cortex/status.ts`, new)

```ts
export interface CortexStatusSummary {
  change: string;
  stage: HarnessStage;
  role: string | null;              // briefForStage(stage).role
  stageStartedAt: string | null;    // stageStartedAt(state) (compass-gate.ts)
  elapsedMinutes: number | null;    // floor((now - stageStartedAt) / 60000)
  tasks: { done: number; total: number } | null;
  iteration: number;
  maxRework: number;
  pendingVerdicts: Array<"review" | "test">;
  openQuestions: number;
  statusIntervalMinutes: number;
  line: string;
}
export function buildStatusSummary(
  projectPath: string, state: HarnessState, now?: Date,
): CortexStatusSummary;
export function countTaskCheckboxes(text: string): { done: number; total: number };
export function readStatusIntervalMinutes(projectPath: string): number;
```

- **tasks**: read `lawbook/changes/<change>/tasks.md`. When it is absent, read
  `record.md`, which is the level-0 checklist. When both are absent, `null`.
  Count list items that match `^\s*[-*]\s+\[( |x|X)\]`. `done` counts `x`/`X`.
- **pendingVerdicts**: `test` when `verdicts.test !== "PASS"`. `review` when
  `state.level >= 1` and `verdicts.review !== "PASS"`. The order is `review`,
  then `test`.
- **elapsedMinutes**: `null` when `stageStartedAt` is `null` or not parseable.
  It is never negative (clamp at 0).
- **line**, in this order and separated by ` · `:
  - `<change>`;
  - `<stage>` or `<stage> (<role>)`;
  - `<N>m in stage`, or `elapsed n/a`;
  - `tasks <d>/<t>`, or `tasks n/a`;
  - `rework <iteration>/<maxRework>`;
  - `pending: review, test`, or `pending: none`.

  In the `questions` stage, append
  `· waiting on human: <k> question(s)`. One line, no newline.
- `now` is injectable for deterministic tests.

## 2. Interval config

`readStatusIntervalMinutes` follows the precedent of `readCompassGateMode`
(`compass-gate.ts`), which uses a dependency-free text read with a default.
It does the following:

- finds a top-level `cortex:` line (column 0);
- scans the following indented lines until the next column-0 key;
- matches `^\s+statusIntervalMinutes:\s*(\S+)`;
- strips an inline `# comment` and quotes;
- accepts `/^\d+$/` only.

Anything else gives 5 (D10). It never throws.

## 3. Engine and transports

- `handleHarness` `status` (`harness.ts`) returns
  `{ state, summary: state ? buildStatusSummary(projectPath, state) : null }`.
  Widen the return type. Other ops are unchanged.
- MCP `cortex` (`register.ts`): the schema is unchanged. At most a
  one-word description tweak (for example "status (with summary)"). The
  `mcp-budget` test must stay green.
- CLI `runCortex` (`src/cli/commands/cortex.ts`): for `status`, when
  `summary` is non-null and `--json` is absent, write `summary.line` to stderr
  (`ui` helper or `console.error`). Then print the JSON on stdout as today.
- Import direction: `status.ts` imports `brief.ts`, `compass-gate.ts`, and
  `types.ts`, and `harness.ts` imports `status.ts`. The implementer confirms
  with `compass_explore` that `compass-gate.ts` and `brief.ts` do not import
  `harness.ts` (no cycle, per `law-no-module-cycles`).

## 4. Skill text (canonical assets, mirrored to `ai-specs/`)

The `skill-steps` test forbids extra step references. Each step names only its
successor, and the last step names none. So the guidance goes inline in the
three existing step files under
`src/modules/lawbook/assets/skills/cortex/steps/`. `SKILL.md` is untouched
(dispatcher cap).

- **01-load-or-start.md**, section "Status updates":
  - after `status`/`start`, read `summary.statusIntervalMinutes`;
  - if it is > 0 and the host has a session timer (Claude Code `CronCreate`,
    session-only, ≥ 1 min), create **one** recurring timer every N minutes.
    The timer runs `cortex` `status` and posts the update;
  - never create a timer outside a Cortex run, and never create a second one;
  - prefer background role dispatch, because the timer only fires while the
    session is idle;
  - on hosts without a timer, rely on the milestone updates in step 02.
- **02-dispatch-loop.md**, new numbered item:
  - post a compact update after every Cortex op and just before every
    blocking role dispatch, unless the interval is 0;
  - skip timer pings in `questions`;
  - list the update content and the language rule (D4, D7);
  - when the human says to stop the updates, delete the timer and post no more
    unsolicited updates for the run.

  Keep the existing "paste the explorer brief" text, the single question
  round text, and the `steps/03-complete.md` pointer
  (`test/unit/explorer-brief.test.ts`).
- **03-complete.md**: at `done` or on a stop, delete the status timer if one
  exists (`CronDelete`) before summarizing. A timer ping that sees stage
  `done` deletes itself.
- `commands/cortex.md`: one line saying that the run posts status updates
  every `cortex.statusIntervalMinutes` (default 5, `0` disables).

The update content is: the change; the stage and active role; the elapsed time
in the stage; tasks done/total; rework iteration/max; pending verdicts; and,
in `questions`, that the human owes answers.

## 5. Tests

- New `test/unit/cortex-status.test.ts` (temp dirs only):
  - `countTaskCheckboxes` handles mixed `[ ]`/`[x]`/`[X]` and `*` bullets,
    and ignores non-list brackets;
  - the summary fields come from a seeded `harness.json` + `tasks.md`;
  - `record.md` is the fallback, and with neither file `tasks` is `null`;
  - `pendingVerdicts` by level: level 0 lists only `test`, level 2 lists both,
    and a PASS is removed;
  - `elapsedMinutes` is computed with an injected `now`;
  - the `line` format, including the `questions` suffix;
  - the interval: absent gives 5, `10` gives 10, `0` gives 0, and `-1` /
    `abc` / `2.5` / a missing file give 5;
  - `handleHarness` `status` returns `summary: null` when there is no harness.
- `test/unit/harness.test.ts`: update the `status` shape assertions.
- A skill text test (extend `test/unit/explorer-brief.test.ts`, or add
  `test/unit/cortex-skill-status.test.ts`). It checks that:
  - 01 mentions `statusIntervalMinutes` and `CronCreate`;
  - 02 mentions the session language, `questions` suppression, and stop;
  - 03 mentions `CronDelete`.
- An integration CLI test through `test/helpers/cli.ts runCli`, in a temp
  repo. It checks that `speclaw cortex status --change x` prints the line on
  stderr and parseable JSON with `summary` on stdout, and that `--json` leaves
  stderr empty of the line.
- These must stay green: `skill-steps`, `explorer-brief`, `mcp-budget`,
  `contract/registers`, and `integration/scaffold`.

## 6. Risks

- **Timer does not fire during blocking dispatch.** This is mitigated by the
  milestone updates and the background-dispatch guidance. It is accepted as
  host behavior.
- **Stale `ai-specs/` copy.** The canonical assets are the source of truth.
  The implementer mirrors them identically, and `speclaw update` refreshes
  installs.
- **Harness level mismatch.** This change's own `harness.json` says level 3
  while `change.json` confirms 2. `pendingVerdicts` uses `state.level`. Both
  are ≥ 1, so the result is the same.
