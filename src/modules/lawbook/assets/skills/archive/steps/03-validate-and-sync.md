# Validate and sync

Run `lawbook_change` (action: validate). If the confirmed ceremony level requires delta specs
(levels 1–3), run `lawbook_change` (action: sync) to promote them into `lawbook/specs/` —
`lawbook_change` (action: archive) refuses unless the canonical specs already match. At **level
0**, skip sync (there are no deltas).

Next: read `steps/04-archive.md` and do only what it says.
