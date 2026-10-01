# Dispatch loop

For the current Cortex stage (`cortex` action `brief` or `status`):

1. Dispatch (spawn or adopt) the matching role with a clear handoff brief.
2. On role completion, call the matching Cortex op:
   - exploring → `advance`
   - planning with questions → `advance` + `pauseForQuestions` + `openQuestions`
   - questions after human answers → `advance` (back to planning)
   - planning complete → `advance` (to implementing)
   - implementing done → `advance` (reviewing, or testing at level 0)
   - reviewing PASS → `advance` + `verdict: PASS`; FAIL → `rework` + `verdict: FAIL`
   - testing PASS → `advance` + `verdict: PASS`; FAIL → `rework` + `verdict: FAIL`
   - archiving success → `advance` (to done)
3. Max rework is 3; if the engine rejects further rework, **ask the human**.
4. Coordinator never edits `src/`, never archives, never pushes, never runs
   `laws accept`.

Next: read `steps/03-complete.md` and do only what it says.
