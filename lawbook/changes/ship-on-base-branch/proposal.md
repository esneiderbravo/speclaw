# ship-on-base-branch

## Why

`speclaw ship-on-stop` returned `skipped: "base-branch"` on `main`/`master` and
printed nothing. A project that works trunk-based — wedding_destination during
its demo stage commits straight to `main` — therefore never had a change
recorded, a gate run or a stop blocked: the hook the workflow promises
("implement, then stop; the hook records it") did nothing, and agents read that
as permission to skip the lawbook altogether. The generated AGENTS.md block
also told every agent to "Branch `<type>/<slug>`", contradicting such projects'
own conventions.

## What changes

- The Stop hook is branch-agnostic. On a feature branch nothing changes. On the
  base branch, work continues the change last shipped there while no commit has
  landed since (the marker now records the commit it sat on); otherwise the hook
  reports `unrecorded-base-work`, blocks the stop once with how to record it and
  which open changes it may continue, and always tells the user. A detached HEAD
  is the only branch state still skipped.
- The generated "speclaw workflow" section no longer assumes a branch: it names
  the change after a branch when there is one, asks for a name on the base
  branch, says the hook blocks unrecorded work, and asks for a draft first on
  public-API or multi-module work.

## Impact

- `src/modules/lawbook/ship.ts` (`shipOnStop`, the ship marker, `unrecordedReason`)
- `src/cli/commands/ship-on-stop.ts` (the blocking stop output)
- `src/modules/foundation/dialects/agentsmd.ts` (the generated workflow section)
- Capability `ship`: one new requirement. No MCP tool or CLI flag changes;
  markers written before this change carry no commit and never continue a
  change on the base branch.
