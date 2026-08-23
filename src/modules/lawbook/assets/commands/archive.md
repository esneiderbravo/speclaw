---
description: Finalize a completed change — sync specs when needed, then archive it.
---

Archive the completed change: $ARGUMENTS

Follow the `archive` skill: confirm every task (or level-0 checklist) is done
and gates are green, reconcile if the level has delta specs, run
`lawbook_validate`, then `lawbook_archive` with today's date (YYYY-MM-DD). Sync
runs only when the ceremony level requires specs. Never move the folder by hand.
