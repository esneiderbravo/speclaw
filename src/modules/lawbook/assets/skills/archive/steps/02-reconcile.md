# Reconciliation review (agent-executed)

Run the reconciliation from the `sync` skill: reconstruct what was built
(branch diff since draft + `compass_explore` / `compass_impact`) and compare it
to the change's delta specs.

- **If the code drifted past the contracts:** show short insights — a tight
  bullet list of what was built outside the delta specs and why it matters
  (e.g. "DB path renamed to `data/app.db` + auto-migration — infra behavior
  absent from the spec") — and reconcile the delta specs (write the drift
  in). Drift left unreconciled cannot be archived: the specs-synced gate will
  block it.
- **If nothing drifted:** say so and continue.

Next: read `steps/03-validate-and-sync.md` and do only what it says.
