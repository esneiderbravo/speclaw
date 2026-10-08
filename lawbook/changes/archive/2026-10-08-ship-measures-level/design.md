# Design — ship-measures-level

## Approach

- **Measure where the work is known.** Ship already computes the branch's files
  (`branchFiles`); it feeds them to the existing `gatherSignals`/`proposeLevel`
  instead of an empty target list. No new scoring model.
- **`measured` vs `human`.** A level ship measured may be raised by a later,
  larger diff (`promoteCeremonyLevel`); a level a human set is never touched.
- **Documentation before gates.** `pendingArtifacts` checks the confirmed
  level's `artifactNeeds` against the files on disk and their scaffold stubs.
  When anything is owed, ship returns before the gates, so a missing proposal
  never costs a test run; the hook exits 2 once (`stop_hook_active` prevents a
  loop) and the agent writes exactly what was listed.
- **Level 0 never blocks.** The benchmark showed a written why at level 0 costs
  a full agent turn (+12 s) on the most common change; the record takes the
  commit bodies, else the file list.
- **Reopen, never rewrite merged history.** A level-0 archive is moved back only
  when it does not exist at the merge base, so archives on `main` stay sealed.
- **Hotspots need churn.** `combinedScore` is relative to the hottest file, so a
  file needs 3+ commits in the window before it can count.

## Rejected

- Asking the agent to size the change up front: an extra turn on every change.
- Separate reviewer/tester agents on the critical path: measured 4× the cost.
