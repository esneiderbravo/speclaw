---
description: Finalize a completed change — sync specs when needed, then archive it.
---

Archive the completed change: $ARGUMENTS

Follow the `archive` skill: confirm every task (or level-0 checklist) is done
and gates are green, reconcile if the level has delta specs, run
`lawbook_change` (action: validate), then `lawbook_change` (action: archive). Archive dates
the folder today and syncs the delta specs itself when the level carries them. Never move
the folder by hand.
