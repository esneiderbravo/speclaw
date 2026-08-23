---
description: Promote a change's delta specs into the canonical specs, without archiving.
---

Sync the change's specs into canonical: $ARGUMENTS

Follow the `sync` skill: reconcile the delta specs against what was actually
built (branch diff + code graph), validate the change (`lawbook_change` (action: validate)), then
run `lawbook_change` (action: sync) to promote each delta spec into `lawbook/specs/`. Report what
you reconciled and what was promoted; leave the change active.
