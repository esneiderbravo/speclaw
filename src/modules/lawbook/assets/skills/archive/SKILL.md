---
name: archive
description: Finalize a completed change — sync its specs into canonical, then move it to the archive. Use when a change is done and merged-ready: "archive the change", "finalize X", "close out the change". Part of speclaw's lawbook module (draft → build → sync → archive). Archiving belongs in the same PR that implements the change.
---

# archive — Finalize and archive a change

Close out a completed change: its delta specs become canonical and the change
folder moves to `lawbook/changes/archive/`. This is part of the PR that
implements the change, not a post-merge chore.

## Steps

1. Confirm the change is truly done: every task in `tasks.md` checked, quality
   gates green, behavior verified.
2. Run `lawbook_validate` for the change; resolve any issues first.
3. Run the `lawbook_archive` tool with the change name and today's date
   (`YYYY-MM-DD`). It syncs the delta specs into `lawbook/specs/` and then moves
   `lawbook/changes/<name>/` to `lawbook/changes/archive/<date>-<name>/`.
4. Report the archive path and the promoted specs. Never move the folder by
   hand — always use `lawbook_archive`, which performs the sync and validation a
   manual move would skip.
