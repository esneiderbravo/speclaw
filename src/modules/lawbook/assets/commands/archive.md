---
description: Finalize a completed change — sync specs into canonical, then archive it.
---

Archive the completed change: $ARGUMENTS

Follow the `archive` skill: confirm every task is done and gates are green,
run `lawbook_validate`, then `lawbook_archive` with today's date (YYYY-MM-DD). It
syncs the specs and moves the change to `lawbook/changes/archive/`. Never move
the folder by hand.
