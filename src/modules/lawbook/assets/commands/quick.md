---
description: Scaffold a level-0 lawbook change (record.md + reports) for a tiny fix.
---

Scaffold a **ceremony level 0** change named `$ARGUMENTS` with `speclaw quick`
(or the equivalent `scaffoldQuick` path). Do **not** invent `proposal.md` /
`design.md` / delta specs for a true one-liner.

1. Ensure `lawbook/` exists (`lawbook_init` if needed).
2. Prefer passing `--path` / `--symbol` so the proposal rationale is measured.
3. Confirm with the human if the measured proposal is higher than 0 — promote
   (`lawbook_level` mode `promote`) instead of staying at quick.
4. Implement, check the checklist in `record.md`, write a discipline report
   under `reports/`, then archive (no sync required at level 0).
