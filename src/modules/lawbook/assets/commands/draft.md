---
description: Draft a new spec-driven change at the confirmed ceremony level before coding.
---

Draft a new change under `lawbook/changes/<name>/` for: $ARGUMENTS

Follow the `draft` skill: ensure `lawbook/` exists (`lawbook_init`), investigate
with Compass, propose a ceremony level (`lawbook_level` mode `propose`) and
**confirm** it with the human (`set`), then scaffold only the artifacts that
level requires. For true one-liners use `speclaw quick` / the `quick` skill
instead. Finish by running `lawbook_change` (action: validate) and fixing every issue.
