---
name: sync
description: Promote a change's delta specs into the canonical specs, without archiving. Use when the user wants to update the source-of-truth specs from a change: "sync the specs", "update the canonical specs", "promote the specs". Part of speclaw's lawbook module (draft → build → sync → archive).
---

# sync — Promote delta specs to canonical

Update the project's canonical specifications (`lawbook/specs/`) with a change's
delta specs, without archiving the change. Use this when the specs should
become the source of truth but the change isn't finished (e.g. multi-PR work).

`lawbook_change` (action: sync) is a deterministic copy — it is blind to the code. So before
promoting, YOU reconcile the delta specs against what was actually built, so the
specs that become canonical describe reality, not just the original draft.

Read `steps/01-confirm.md` and do only what it says.
