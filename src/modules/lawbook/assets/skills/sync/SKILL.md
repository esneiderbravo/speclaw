---
name: sync
description: Promote a change's delta specs into the canonical specs, without archiving. Use when the user wants to update the source-of-truth specs from a change: "sync the specs", "update the canonical specs", "promote the specs". Part of speclaw's lawbook module (draft → build → sync → archive).
---

# sync — Promote delta specs to canonical

Update the project's canonical specifications (`lawbook/specs/`) with a change's
delta specs, without archiving the change. Use this when the specs should
become the source of truth but the change isn't finished (e.g. multi-PR work).

`lawbook_sync` is a deterministic copy — it is blind to the code. So before
promoting, YOU reconcile the delta specs against what was actually built, so the
specs that become canonical describe reality, not just the original draft.

## Steps

1. Confirm which change to sync (run `lawbook_list` if unsure).

2. **Reconcile code → delta specs (agent-executed).** Before promoting, compare
   what was built against the change's delta specs:
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

3. Run `lawbook_validate` for the change; do not sync a change whose specs are
   invalid.

4. Run the `lawbook_sync` tool for the change. It copies each
   `lawbook/changes/<name>/specs/<capability>/spec.md` over the canonical
   `lawbook/specs/<capability>/spec.md` and reports what it promoted, flagging
   each as **created** (new capability) or **updated** (overwrote an existing
   one). A capability you expected to update showing up as *created* means the
   delta forked a near-duplicate — fix the name before promoting.

5. Report to the user what you reconciled (or that nothing drifted) and the
   promoted files (created vs updated). The change stays active — `archive` it
   when it's fully done.
