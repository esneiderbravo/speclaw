# Review — coordinator-status-updates

- Role: reviewer (Cortex) · Change: `coordinator-status-updates` (level 2, ships 2.0.8)
- Branch: `feat/coordinator-status-updates` · Date: 2026-10-06
- Scope: proposal, design D1–D11, tasks, `specs/lawbook-workflow/spec.md` delta vs.
  `src/modules/cortex/{status,harness,brief,register}.ts`, `src/cli/commands/cortex.ts`,
  cortex skill steps 01/02/03 + `commands/cortex.md` (canonical + `ai-specs/` mirrors),
  `docs/cortex.md`, `lawbook/config.yaml`, tests `test/unit/{cortex-status,cortex-skill-status,harness}.test.ts`,
  `test/integration/cortex-status-cli.test.ts`. `harden-update-lock-and-cli` ignored.
- Compass calls made: 7 (diff_context ×1, explore ×6: `buildStatusSummary`, `handleHarness`,
  `runCortex`, `stageStartedAt`, `text`, `applyTextBudget`).

## Verdict: FAIL

One major finding (F1): on the MCP path, which the skill uses, the `summary` is the
first thing lost when the `status` JSON goes over the brief output budget. That is likely
in runs with reworks, which is the case the proposal is about. Everything else matches the
design and spec. The fix is small.

## What checks out

- **Summary correctness** (`src/modules/cortex/status.ts:131-171`):
  - `role` comes from `briefForStage`.
  - `stageStartedAt` reuses `compass-gate.ts:69` (newest `history[].to === stage`).
  - `elapsedMinutes` is `floor`ed, clamped at 0, and `null` when there is no match or the date does not parse (`status.ts:113-118`).
  - Tasks: `tasks.md`, then `record.md`, then `null` (`status.ts:96-111`). The regex `^\s*[-*]\s+\[( |x|X)\]` counts nested/indented items. The tests cover this (`cortex-status.test.ts:37-51`).
  - `pendingVerdicts` is ordered review, then test, and review is only added when `level >= 1` (`status.ts:140-142`).
  - The `questions` suffix and the ` · ` join match design §1.
- **Interval** (`status.ts:74-94`):
  - Defaults: missing file, block, or key gives 5; `0` is kept; `-1`, `abc`, and `2.5` give 5.
  - Parsing: quotes and inline comments are stripped; the block ends at the next column-0 key; commented-out blocks are ignored.
  - It never throws, and the tests cover all of this (`cortex-status.test.ts:160-178`).
- **Engine/transports:**
  - `handleHarness` `status` returns `{state, summary}`, with `summary: null` when there is no harness (`harness.ts:188-191`, type at `harness.ts:46-49`).
  - The MCP input schema is unchanged. Only the description gained "with summary" (`register.ts:43`).
  - CLI: the line goes to stderr only for `status` when there is no `--json` and the summary is non-null. stdout stays one JSON document (`cli/commands/cortex.ts:52-56`), and `--json` is in the usage string.
  - A missing change exits 1 (integration test `cortex-status-cli.test.ts:48-50`).
- **Import cycle:**
  - `brief.ts:7` now imports `HarnessStage` from the leaf `types.ts`.
  - `status.ts` imports only `brief`, `compass-gate`, and `types`; `compass-gate` imports only `shared/compass-calls` and `types`.
  - There is no `harness → status → brief → harness` cycle and no lawbook import (D11, `law-no-module-cycles`).
- **Alias side effect:** `lawbook_change` action `harness` (`change-tool.ts:142`) and `speclaw lawbook harness status` (`cli/commands/lawbook.ts:203-218`) now also return `summary`. The change only adds a field and prints no stderr line on the alias. Acceptable.
- **Skill text:**
  - 01 reads `summary.statusIntervalMinutes`, creates one `CronCreate` timer only inside a run (none when the interval is 0), prefers background dispatch, and falls back on hosts without a timer.
  - 02 covers after-op and pre-dispatch updates, the content list, the session language with English identifiers, suppression in `questions`, and stop handling. An explicit request is always answered.
  - 03 runs `CronDelete` at done or stop.
  - Step chaining is preserved (each step names only its successor). The explorer-brief and single-round texts are intact.
  - The `ai-specs/` mirrors are identical to the canonical assets.
  - This fits the human's preference that no session cron exists outside a Cortex run (with caveat m1).
- **Covers tags:**
  - impl: `status.ts:72`, `status.ts:129`.
  - utest: `cortex-status.test.ts:53,159`, `cortex-skill-status.test.ts:17,32,53`, `cortex-status-cli.test.ts:15`.
- **Docs/config:** `docs/cortex.md:75-124` matches the behaviour (fields, YAML, defaults, stderr/`--json`, timer, fallback, `0` semantics). `lawbook/config.yaml:31-35` has the commented `cortex:` block next to `compassGate`.
- **Tasks:** 0–4 and 8 are checked. 5.1, 6.1, 7.1, and 9.1 are left open, which is correct: the tester and archiver own them.

## Findings

### F1 — Major: `summary` is the first thing cut when the MCP `status` result goes over budget

- `src/modules/cortex/harness.ts:190` returns `{ state, summary }`, so `summary` comes **after** the whole `state` (including every `history[]` entry and its note).
- `src/modules/cortex/register.ts:59-69` sends it through `text()` (`src/shared/mcp.ts:15-26`). That calls `applyTextBudget(raw, "brief")` (`src/shared/output-budget.ts:26-42`), which allows 1500 tokens (about 6000 chars) and **cuts the tail**.
- This change's own `status` output is already about 3 KB at `reviewing` (notes of about 300 chars per advance). The full chain to `done` plus one or two `rework` round-trips with FAIL notes goes past 6000 chars.
- When that happens:
  - the MCP text is invalid JSON;
  - `summary` (including `statusIntervalMinutes`, which the skill says to read and never compute) is gone;
  - the truncation suffix points to `mode:"full"`, which the `cortex` tool does not accept.
- Every timer firing then has nothing to report. Rework-heavy runs are exactly when the human most needs updates (proposal "Why": "stuck in rework").
- `req~cortex-status-summary~1` ("SHALL return a `summary` next to `state`") is not met in that case.

**Rework:**
1. Emit `summary` before `state` in the `status` result (`return { summary, state }` in `handleHarness`, with the type order updated accordingly). Alternatively, have the MCP `status` path keep `summary` intact whatever the history length.
2. Add a unit test that drives `registerCortex`/`text()` (or `handleHarness` + `text`) with a harness of about 30 history entries with long notes. The test must assert that the MCP text still contains the full `"summary"` object and `statusIntervalMinutes`.
3. Keep the CLI and alias assertions green. Key order is not part of any test contract today (tests use `deepEqual`, which ignores order).

### Minor (fix now or record as follow-ups; they do not block on their own)

- **m1 — Timer on a finished or unstarted run** (`skills/cortex/steps/01-load-or-start.md:27-36`): the load step creates the timer whenever the interval is > 0. It does not first check that the run is active. On a resumed change whose stage is `done` (or with `summary: null`), the timer is created and only deleted at its first firing. That briefly breaks "no session cron outside a Cortex run". Add: "only when the summary is non-null and the stage is not `done`."
- **m2 — Timer id not kept** (01/02/03): `CronDelete` needs the id that `CronCreate` returns, and "never a second one per run" needs a way to know a timer exists. Say to remember the returned id (or check with `CronList`) and to delete by that id.
- **m3 — Intervals ≥ 60 minutes** (01): a cron "every N minutes" (`*/N`) is only valid for N ≤ 59. Nothing caps or translates larger values (`status.ts:91` accepts any `\d+`). Either clamp or document this, or tell the coordinator to build an hourly expression for N ≥ 60.
- **m4 — Timer prompt carries no context** (01:32-34): a firing is a fresh prompt. Suggest the `CronCreate` prompt itself names the change and the rules: skip in `questions`, session language, self-delete at `done`.
- **m5 — Missing `Status: approved`** (`specs/lawbook-workflow/spec.md:1304`): `req~cortex-status-updates~1` declares `Needs: utest` but no `Status: approved`, so the archive coverage gate ignores it. The two sibling requirements declare it. Add it for consistency, or state that the omission is deliberate.
- **m6 — Loose parsing:**
  - `countTaskCheckboxes` also counts checkbox lines inside fenced code blocks, and ignores `+` bullets and `1. [ ]` items.
  - `readStatusIntervalMinutes` accepts the key at any depth under `cortex:` (e.g. `cortex.sub.statusIntervalMinutes`) and ignores flow style (`cortex: {statusIntervalMinutes: 3}` gives 5).
  - These are acceptable for a text scan; mention them in a doc comment.
- **m7 — Docs** (`docs/cortex.md:123-124`): note that the deprecated `lawbook harness` / `lawbook_change harness` `status` now also returns `summary`, and that the alias prints no stderr line.
- **m8 — `pendingVerdicts` uses `harness.level`** (`status.ts:141`): the harness level is set at `start` from `confirmedLevel`, defaulting to 3. A run started before the level is confirmed shows `review` as pending even at level 0 (this change's own harness has level 3 vs. confirmed 2). This matches the spec wording and is a pre-existing harness trait. Worth a follow-up so `start`/`level set` keep the harness level in sync.

## Rework guidance (FAIL)

1. Fix F1 (summary first, or a budget-safe `status` rendering) and add the long-history MCP test.
2. Recommended alongside: m1 and m2 (skill text in 01/02/03, mirrored to `ai-specs/`, with `test/unit/cortex-skill-status.test.ts` extended), and m5.
3. Re-run `npm run check`, `npm run build`, and `npm test`, then return to `reviewing`.

---

## Rework 1

- Date: 2026-10-06 · Compass calls made: 2 (explore `applyTextBudget` with callers, explore `text`).
- Scope: `status.ts` `fitStatusResult`, `harness.ts` status return, `cortex/register.ts`,
  `lawbook/change-tool.ts` (+ how `lawbook/register.ts` renders it), skill steps 01/02/03 +
  `commands/cortex.md` and `ai-specs/` mirrors, spec delta, design D12–D14, `docs/cortex.md`,
  `test/unit/cortex-status.test.ts`.

### Verdict: PASS

### F1: resolved

- **Order:** `handleHarness` `status` now returns `{ summary, state }` (`harness.ts:192`), and the type `HarnessStatusResult` (`harness.ts:49-52`) declares the fields in the same order.
- **Budget math is exact, not approximate:**
  - `fitStatusResult` (`status.ts:216-242`) measures `estimateTokens(JSON.stringify(value, null, 2)) <= maxTokens`, with `maxTokens = OUTPUT_BUDGET.brief`.
  - `text()` (`shared/mcp.ts:15-26`) serializes objects with the same `JSON.stringify(value, null, 2)`. `applyTextBudget` passes the text through unchanged when `estimateTokens(text) <= budget` (`output-budget.ts:31-32`).
  - Both sides use the same serializer, the same estimator (`ceil(len/4)`, UTF-16 length on both sides), and the same budget. So any result that `fitStatusResult` accepts is never truncated.
- **No wrapper text on the fitted paths:**
  - `cortex` tool: `text(fitStatusResult(result))` (`cortex/register.ts:70`).
  - `lawbook_change` harness: `text(handleLawbookChange(args))` (`lawbook/register.ts:60`).
  - Neither path adds a prefix. The deprecated-alias wrappers that do add `prefixDeprecated` text (`lawbook/register.ts:78-181`) cover only init, list, validate, sync, archive, level, coverage, and drift. None of them covers harness.
- **CLI keeps the full history:** `speclaw cortex status` and `speclaw lawbook harness` call `handleHarness` directly (`cli/commands/lawbook.ts:12,206`), so they get the full, unfitted history as D12 says.
- **Search is correct:**
  - The binary search for the largest number of kept entries is valid, because fitting is monotone in that number.
  - An empty history that still does not fit leads to `stateOmitted`. A zero-length history goes straight there, before the loop.
  - `historyOmitted` is left out when nothing was cut, because the full result is returned as-is.
- **Tests:** `cortex-status.test.ts:217-273` asserts that:
  - the fixture overflows when unfitted;
  - the output has no `[truncated` marker and parses as JSON;
  - the key order is `summary`, `historyOmitted`, `state`;
  - every stable summary field is present, including `statusIntervalMinutes`;
  - `historyOmitted` + kept entries = 30, and the newest entry is kept;
  - `harness.json` is untouched;
  - the `lawbook_change` alias is fitted too.
  The `stateOmitted` and small-result cases are covered at lines 275-295.
- **Layering:** `cortex/status.ts` imports `shared/output-budget`, which is allowed. The lawbook → cortex import direction is unchanged.

### Minors

- m1, m2, m4: fixed in step 01 (lines 30-46): the timer is created only when the summary is non-null and the stage is not `done`; the id is kept (or found with `CronList`); the timer prompt is self-contained. Steps 02 and 03 delete by that id. The `ai-specs/` mirrors match.
- m3: fixed. The interval is clamped to 60 (`status.ts:25,105`). The skill uses `*/N` for 1–59 and an hourly expression for 60. Design D13, the spec scenario "Values above 60 are capped at 60", and `docs/cortex.md:94-99` agree.
- m5: fixed. `Status: approved` is present on all three requirements.
- m6: documented in doc comments (`status.ts:52-56,79-81`).
- m7: fixed (`docs/cortex.md:128-135`).
- m8: still open as a follow-up (it is a pre-existing harness trait).

Spec `req~cortex-status-summary~1` (`spec.md:1204-1209`, scenario at 1242), design D12–D14, the docs, and the skill text agree with each other.

### Nits (follow-ups, not blocking)

- **n1 — Very large summary:** `fitStatusResult` can still return a result over budget if `summary` alone exceeds about 6000 chars (for example, an absurdly long change name). That is practically impossible, but a one-line note in the doc comment would make the guarantee's precondition explicit.
- **n2 — `brief` is not fitted:** `cortex` action `brief` (`cortex/register.ts:55-58`) still sends the full `state` through `text()` unfitted. On a long history, its JSON can be truncated the same way. `brief` carries no summary, so this does not affect F1. It existed before this change; consider fitting it in a follow-up.
- **n3 — Docs line wrap:** `docs/cortex.md:99` is a long unwrapped line (cosmetic only).

Return to the coordinator: PASS → `cortex advance`.
