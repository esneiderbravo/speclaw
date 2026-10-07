# lawbook/ — the spec-driven workflow (speclaw)

This directory is managed by speclaw's **lawbook** module.

- `specs/` — the canonical specifications (the current source of truth).
- `changes/<name>/` — an in-flight change. Artifact volume follows the
  confirmed ceremony level in `change.json` (0=quick … 3=full). Missing
  `change.json` means level 3 (proposal, design, tasks, delta specs).
- `changes/archive/` — completed, archived changes.
- `config.yaml` — mandatory task steps, coverage, and optional ceremony cuts.

## Workflow

1. `lawbook:explore` — think through an idea before or during a change.
2. `lawbook:draft` / `speclaw quick` — propose/confirm a ceremony level, then
   scaffold only the artifacts that level requires.
3. `lawbook:build` — implement the tasks.
4. `lawbook:sync` — promote the change's delta specs into `specs/` (when the
   level requires specs).
5. `lawbook:archive` — sync (if needed) + move the change to `changes/archive/`.
