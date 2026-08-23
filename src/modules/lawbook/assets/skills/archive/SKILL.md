---
name: archive
description: Finalize a completed change — sync its specs into canonical, then move it to the archive. Use when a change is done and merged-ready: "archive the change", "finalize X", "close out the change". Part of speclaw's lawbook module (draft → build → sync → archive). Archiving belongs in the same PR that implements the change.
---

# archive — Finalize and archive a change

Close out a completed change: its delta specs become canonical and the change
folder moves to `lawbook/changes/archive/`. This is part of the PR that
implements the change, not a post-merge chore.

`lawbook_change` (action: archive) is **gated** — the engine refuses to archive (and reports the
reason) while any task is unchecked, while `reports/` holds no discipline report,
or while the delta specs are not yet synced into the canonical specs. So archive
is the last step of a completed change: reconcile, sync, then archive.

Read `steps/01-confirm-done.md` and do only what it says.
