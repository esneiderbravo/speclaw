# Dispatch loop

For the current Cortex stage (`cortex` action `brief` or `status`):

1. Dispatch (spawn or adopt) the matching role with a clear handoff brief.
   - **Explorer template.** Give the intent (what the change should achieve),
     the symbols or concepts to locate, and the questions to answer. Do not
     list file paths for the explorer to read — it locates code through
     Compass (`compass_find` / `compass_explore`) and reports
     `Compass calls made: N`.
   - When the role is the planner, paste the explorer brief into the prompt
     unchanged: symbols with files, callers and callees, blast radius,
     standards already read, recommended approach, open questions, and gaps.
2. **Single question round** (after the explorer, before the planner drafts):
   1. Propose a level with `lawbook_change` action `level`, mode `propose`,
      passing the paths and symbols from the brief.
   2. Dispatch the planner for questions only (no artifacts yet).
   3. Merge the explorer open questions, the planner questions, and the level
      confirmation into **one** `advance` with `pauseForQuestions` +
      `openQuestions`. Ask the human once; never open a second round for the
      level.
   4. After the answers, record the level with `lawbook_change` action
      `level`, mode `set` (evidence and answers in `reason`), then redispatch
      the planner to draft.
3. On role completion, call the matching Cortex op:
   - exploring → `advance`
   - planning with questions → `advance` + `pauseForQuestions` + `openQuestions`
   - questions after human answers → `advance` (back to planning)
   - planning complete → `advance` (to implementing)
   - implementing done → `advance` (reviewing, or testing at level 0)
   - reviewing PASS → `advance` + `verdict: PASS`; FAIL → `rework` + `verdict: FAIL`
   - testing PASS → `advance` + `verdict: PASS`; FAIL → `rework` + `verdict: FAIL`
   - archiving success → `advance` (to done)
4. Max rework is 3; if the engine rejects further rework, **ask the human**.
5. Coordinator never edits `src/`, never archives, never pushes, never runs
   `laws accept`.
6. **Status updates.** Unless `summary.statusIntervalMinutes` is 0, post a
   compact update after every Cortex op and just before every blocking role
   dispatch, built from the `status` summary fields:
   - the change, the stage and active role, the elapsed time in the stage;
   - tasks done/total, rework iteration/max, and the pending verdicts;
   - in `questions`, that the human owes answers.

   Write it in the session's language (the language of the human's most
   recent messages); keep stage, role, and tool names, file paths, and change
   names in English. `summary.line` is English-only; use it as is only in an
   English session. Skip timer pings while the stage is `questions` (the
   question round already speaks to the human). When the human asks to stop
   the updates, delete the timer (`CronDelete` with the id `CronCreate`
   returned) and post no further unsolicited update for this run. An explicit
   request for status is always answered.

Next: read `steps/03-complete.md` and do only what it says.
