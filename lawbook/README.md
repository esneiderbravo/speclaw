# lawbook/ — the spec-driven workflow (speclaw)

This directory is managed by speclaw's **lawbook** module.

- `specs/` — the canonical specifications (the current source of truth).
- `changes/<name>/` — an in-flight change: `proposal.md`, `tasks.md`,
  `design.md`, and `specs/<capability>/spec.md` delta specs.
- `changes/archive/` — completed, archived changes.
- `config.yaml` — mandatory task steps and workflow rules.

## Workflow

1. `lawbook:draft` — describe the change; generates proposal, delta specs, tasks.
2. `lawbook:build` — implement the tasks.
3. `lawbook:sync` — promote the change's delta specs into `specs/`.
4. `lawbook:archive` — sync + move the change to `changes/archive/`.
5. `lawbook:explore` — think through an idea before or during a change.
