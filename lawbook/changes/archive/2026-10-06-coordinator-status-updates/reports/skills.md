# Skills checks — coordinator-status-updates (2026-10-06)

Date 2026-10-06 · Branch `feat/coordinator-status-updates` · cwd `/Users/esneiderbravo/Projects/speclaw`; install check in throwaway repo `/tmp/csu-mv.mg5yyg`.

Scope: the coordinator guidance in the canonical assets `src/modules/lawbook/assets/skills/cortex/steps/{01-load-or-start,02-dispatch-loop,03-complete}.md` and `src/modules/lawbook/assets/commands/cortex.md`, plus their `ai-specs/` mirrors. `SKILL.md` is untouched.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Skill-text tests | `npm test` (`test/unit/cortex-skill-status.test.ts`) | ✅ 8/8: "cortex load step sets up one status timer from the summary interval", "…creates the timer only for an active run", "…keeps the timer id so there is exactly one timer", "…expresses every interval as a valid cron schedule", "cortex timer prompt carries the change and the rules", "cortex dispatch loop posts updates in the session language", "cortex complete step deletes the status timer", "cortex command mentions the status interval key" |
| Step chaining / existing texts | `npm test` (`skill-steps`, `explorer-brief`) | ✅ "cortex dispatch pastes the explorer brief into the planner prompt" and "cortex dispatch runs one question round…" pass; full run 685/685 |
| Repo mirror parity | `cmp` canonical vs `ai-specs/skills/cortex/steps/*.md`, `SKILL.md`, and `ai-specs/commands/lawbook/cortex.md` | ✅ all 5 identical |
| Install parity | `cmp` canonical vs the throwaway repo's `ai-specs/` after `speclaw init` | ✅ 01, 02, 03, and `commands/lawbook/cortex.md` identical |
| Scaffold | `npm test` (`integration/scaffold`) | ✅ pass |

## Text inspection (read as instructions)

| Requirement | Where it is stated | Clear? |
|-------------|--------------------|--------|
| 5-minute default | `commands/cortex.md`: "default 5, `0` disables, at most 60". Step 01 reads `summary.statusIntervalMinutes` (the engine applies the default) and says "never parse `lawbook/config.yaml` yourself" | ✅ |
| `0` disables | 01 "`0` disables unsolicited updates … none when the interval is 0"; 02 "Unless … is 0"; 02 "An explicit request for status is always answered" (D9) | ✅ |
| Only one timer | 01: "**one** recurring timer"; remember the `CronCreate` id; check the remembered id or `CronList` before creating; "never a second one per run"; only inside a run, summary non-null, stage not `done` | ✅ |
| Valid schedule | 01: `*/N * * * *` for 1–59, an hourly expression (e.g. `7 * * * *`) for 60 | ✅ |
| Self-contained timer prompt | 01: name the change and the rules (run `status`, session language, skip in `questions`, `CronDelete` at `done` or stop) | ✅ |
| Delete at done / stop | 03: "first delete the status timer if one exists (`CronDelete` with the id …)" at `done` or when the human stops; 02: delete on a stop request, then no more unsolicited updates | ✅ |
| Skip in `questions` | 01 timer prompt and 02 "Skip timer pings while the stage is `questions`" | ✅ |
| Session language | 02: the language of the human's most recent messages; stage, role, tool names, paths, and change names in English; `summary.line` is English-only, so use it as is only in an English session (D4/D7) | ✅ |
| Host fallback | 01: "On a host without a session timer, the after-op and before-dispatch updates … stand in for it"; prefer background dispatch so the timer can fire | ✅ |
| Update content | 02: change, stage and role, elapsed, tasks, rework, pending verdicts, and "human owes answers" in `questions` | ✅ |

## Tests added / updated

- `test/unit/cortex-skill-status.test.ts` (new, 8 tests, `// Covers: req~cortex-status-updates~1`) asserts the phrases above in the shipped assets.

## Spec-scenario coverage

| Scenario | Verified by |
|----------|-------------|
| The load step sets up the timer from the summary | the 5 "cortex load step …" and "timer prompt" tests; text inspection above |
| The dispatch loop posts updates in the session language | "cortex dispatch loop posts updates in the session language"; inspection |
| Completion deletes the timer | "cortex complete step deletes the status timer"; inspection |
| Summary and interval scenarios (11) | `api.md` / `backend.md` |

## Pre-existing / unrelated failures

None.

## Pending manual steps

Live host timer firing (`CronCreate`/`CronDelete` in a real Claude Code session) cannot be automated here. The evidence is the text inspection above and the skill-text tests. Any live observation the coordinator makes during this run can be added.

## Verdict

PASS
