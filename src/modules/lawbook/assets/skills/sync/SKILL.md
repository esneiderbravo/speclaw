---
name: sync
description: Promote a change's delta specs into the canonical specs, without archiving. Use when the user wants to update the source-of-truth specs from a change: "sync the specs", "update the canonical specs", "promote the specs". Part of speclaw's lawbook module (draft → build → sync → archive).
---

# sync — Promote delta specs to canonical

Update the project's canonical specifications (`lawbook/specs/`) with a change's
delta specs, without archiving the change. Use this when the specs should
become the source of truth but the change isn't finished (e.g. multi-PR work).

## Steps

1. Confirm which change to sync (run `lawbook_list` if unsure).
2. Run `lawbook_validate` for the change; do not sync a change whose specs are
   invalid.
3. Run the `lawbook_sync` tool for the change. It copies each
   `lawbook/changes/<name>/specs/<capability>/spec.md` over the canonical
   `lawbook/specs/<capability>/spec.md` and reports what it promoted.
4. Report the promoted files to the user. The change stays active — `archive`
   it when it's fully done.
