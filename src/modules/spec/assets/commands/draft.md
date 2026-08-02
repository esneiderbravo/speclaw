---
description: Draft a new spec-driven change (proposal, delta specs, tasks) before coding.
---

Draft a new change under `spec/changes/<name>/` for: $ARGUMENTS

Follow the `draft` skill: ensure `spec/` exists (`spec_init`), investigate the
code with `compass_explore`/`compass_recall`, read the governing
`docs/standards/`, then write `proposal.md`, `specs/<capability>/spec.md`
(normative `SHALL`/`MUST` + `#### Scenario:`), optional `design.md`, and
`tasks.md` (with the mandatory steps from `spec/config.yaml`). Finish by
running `spec_validate` and fixing every issue.
