---
description: Promote a change's delta specs into the canonical specs, without archiving.
---

Sync the change's specs into canonical: $ARGUMENTS

Follow the `sync` skill: validate the change (`lawbook_validate`), then run
`lawbook_sync` to promote each delta spec into `lawbook/specs/`. Report what was
promoted; leave the change active.
