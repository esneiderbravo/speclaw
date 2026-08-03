---
name: archive
description: Finalize a completed change — sync its specs into canonical, then move it to the archive. Use when a change is done and merged-ready: "archive the change", "finalize X", "close out the change". Part of speclaw's lawbook module (draft → build → sync → archive). Archiving belongs in the same PR that implements the change.
---

# archive — Finalize and archive a change

Close out a completed change: its delta specs become canonical and the change
folder moves to `lawbook/changes/archive/`. This is part of the PR that
implements the change, not a post-merge chore.

`lawbook_archive` folds the sync in — it runs the deterministic copy, then moves
the folder. It never prompts for a separate sync and is blind to the code. So
before archiving you run the same reconciliation the `sync` step does, and
recommend a sync when the code has drifted past the original contracts.

## Steps

1. Confirm the change is truly done: every task in `tasks.md` checked, quality
   gates green, behavior verified.

2. **Reconciliation review (agent-executed).** Run the reconciliation from the
   `sync` skill: reconstruct what was built (branch diff since draft +
   `compass_explore` / `compass_impact`) and compare it to the change's delta
   specs.
   - **If the code drifted past the contracts:** recommend a reconciling
     `sync`, mark it **recommended**, and show short insights — a tight bullet
     list of what was built outside the delta specs and why it matters (e.g.
     "DB path renamed to `data/app.db` + auto-migration — infra behavior absent
     from the spec"). Do NOT archive yet: reconcile the delta specs (write the
     drift in), or proceed only if the user explicitly accepts the drift.
   - **If nothing drifted:** say so and continue — no recommendation needed.

3. Run `lawbook_validate` for the change; resolve any issues first.

4. Run the `lawbook_archive` tool with the change name and today's date
   (`YYYY-MM-DD`). It syncs the delta specs into `lawbook/specs/` and then moves
   `lawbook/changes/<name>/` to `lawbook/changes/archive/<date>-<name>/`.

5. Report the archive path, what you reconciled (or that nothing drifted), and
   the promoted specs. Never move the folder by hand — always use
   `lawbook_archive`, which performs the sync and validation a manual move would
   skip.
