# Load or start Cortex

- Confirm the change name with the user (or draft/quick first if none exists).
- Run the `cortex` MCP tool with `action: status` (or
  `speclaw cortex status --change <name>`). Prefer `action: brief` when you
  need the role + skill hints for the current stage.
- If missing, `action: start`.
- Read `ai-specs/agents/<role>.md` for the current stage's permission contract.
- If the host can spawn subagents (Claude Task / Cursor Task), spawn that role
  with the contract in the prompt. If not, **adopt the role** in this session
  but obey its allow/deny list strictly.

Stage → role:

| Stage | Role |
|-------|------|
| exploring | explorer (`explore` / `investigate` for bugs) |
| planning / questions | planner (`draft` / `quick`); questions always go to the human |
| implementing | implementer (`build` through implement hand-off) |
| reviewing | reviewer |
| testing | tester |
| archiving | archiver (`sync` + `archive`) |
| done | stop — report success |

## Status updates

- Read `summary.statusIntervalMinutes` from the `status` result (after
  `start`, run `status` once). `0` disables unsolicited updates; never parse
  `lawbook/config.yaml` yourself.
- Create the timer only when the summary is non-null and the stage is not
  `done`, the interval is greater than 0, and the host has a session timer
  (Claude Code `CronCreate`, session-only, at least 1 minute). Then create
  **one** recurring timer every `statusIntervalMinutes` minutes:
  - schedule: for 1–59 minutes use `*/N * * * *`; for 60 (the engine caps the
    interval at 60) use an hourly expression such as `7 * * * *`;
  - prompt: the timer firing is a fresh prompt, so it must carry its context.
    Name the change and the rules: run `cortex` action `status` for that
    change and post the update in the session's language; skip the ping while
    the stage is `questions`; when the stage is `done` or the run was stopped,
    delete this timer (`CronDelete`) and post nothing.
- Remember the id that `CronCreate` returns; it is the run's status timer.
  Before creating one, check that no status timer exists for this change
  (your remembered id, or `CronList`), so there is exactly one per run.
  `CronDelete` always targets that id.
- Create the timer only inside a Cortex run, never a second one per run, and
  none when the interval is 0.
- Prefer background role dispatch: the timer fires only while the session is
  idle, not during a blocking dispatch.
- On a host without a session timer, the after-op and before-dispatch updates
  of the dispatch loop stand in for it.

Next: read `steps/02-dispatch-loop.md` and do only what it says.
