---
name: archive
description: Finalize a completed change — sync its specs into canonical, then move it to the archive. Use when a change is done and merged-ready: "archive the change", "finalize X", "close out the change". Part of speclaw's lawbook module (draft → build → sync → archive). Archiving belongs in the same PR that implements the change.
---

# archive — Finalize and archive a change

Close out a completed change: its delta specs become canonical and the change
folder moves to `lawbook/changes/archive/`. This is part of the PR that
implements the change, not a post-merge chore.

`lawbook_archive` is **gated** — the engine refuses to archive (and reports the
reason) while any task is unchecked, while `reports/` holds no discipline report,
or while the delta specs are not yet synced into the canonical specs. So archive
is the last step of a completed change: reconcile, sync, then archive.

## Steps

1. Confirm the change is truly done: every task in `tasks.md` checked, quality
   gates green, behavior verified, and the discipline reports written under
   `reports/`.

2. **Reconciliation review (agent-executed).** Run the reconciliation from the
   `sync` skill: reconstruct what was built (branch diff since draft +
   `compass_explore` / `compass_impact`) and compare it to the change's delta
   specs.
   - **If the code drifted past the contracts:** show short insights — a tight
     bullet list of what was built outside the delta specs and why it matters
     (e.g. "DB path renamed to `data/app.db` + auto-migration — infra behavior
     absent from the spec") — and reconcile the delta specs (write the drift
     in). Drift left unreconciled cannot be archived: the specs-synced gate will
     block it.
   - **If nothing drifted:** say so and continue.

3. Run `lawbook_validate`, then `lawbook_sync` to promote the delta specs into
   `lawbook/specs/`. This is required, not optional: `lawbook_archive` refuses
   unless the canonical specs already match the delta specs.

4. Run the `lawbook_archive` tool with the change name and today's date
   (`YYYY-MM-DD`). It re-checks the gate deterministically and, if it passes,
   moves `lawbook/changes/<name>/` to `lawbook/changes/archive/<date>-<name>/`.
   If it refuses, resolve the reported blockers (unchecked tasks, missing
   reports, unsynced specs) and retry.

5. Report the archive path, what you reconciled (or that nothing drifted), and
   the promoted specs. Never move the folder by hand — a manual `mv` skips the
   gate and hides an incomplete change.
