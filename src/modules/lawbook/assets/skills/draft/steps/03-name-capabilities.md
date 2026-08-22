# Pick a change name and its capabilities

- **Change name:** kebab-case, action-oriented (e.g. `add-login`,
  `fix-shift-overlap`). This is the folder under `lawbook/changes/`, and it is
  per-feature — always distinct.
- **Capabilities:** run `lawbook_list` to see the canonical capabilities. A
  capability is the living contract for an area of behavior — it is *not* the
  change. When your change modifies behavior an existing capability already
  governs, reuse that capability's **exact** name so `sync` updates its spec.
  Introduce a new capability only as a deliberate choice for a genuinely distinct
  area of behavior — never as a near-duplicate (`transfer` next to an existing
  `transfers`) of one that already exists.

Next: read `steps/04-write-artifacts.md` and do only what it says.
