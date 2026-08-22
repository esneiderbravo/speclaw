# Reconcile code → delta specs (agent-executed)

Before promoting, compare what was built against the change's delta specs:

- Reconstruct what shipped: `git diff <branch-point>...HEAD` for the change's
  branch, then `compass_explore` / `compass_impact` on the touched symbols to
  understand behavior, not just changed lines.
- Diff intent vs reality: list behavior that is implemented but missing from,
  or contradicted by, `lawbook/changes/<name>/specs/**`.
- Write the gaps into the delta specs — normative `SHALL`/`MUST` requirements
  under `### Requirement:` and `#### Scenario:` acceptance criteria — so the
  contract matches what was built. Capture only behavior that actually
  exists; never invent scope that was not implemented.
- If nothing drifted, make no edits and say so.

Next: read `steps/03-validate.md` and do only what it says.
