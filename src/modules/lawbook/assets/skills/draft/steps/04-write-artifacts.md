# Write the artifacts

Artifact volume follows the **confirmed ceremony level** in `change.json`
(propose + confirm with `lawbook_level` / the human **before** scaffolding).
Missing `change.json` means level 3.

Create under `lawbook/changes/<name>/` only what the level needs:

- **Level 0** — prefer `speclaw quick` / the `quick` skill: `record.md`
  (inline checklist) + `reports/` + `change.json`. No proposal/design/deltas.
- **Level 1** — `record.md`, `tasks.md`, ≥1 delta under
  `specs/<capability>/spec.md`, `reports/`, `change.json`.
- **Level 2** — `proposal.md`, `tasks.md`, delta specs, `reports/`;
  `design.md` optional only with justification in `record.md`.
- **Level 3** — `proposal.md`, `design.md`, `tasks.md`, delta specs, `reports/`.

For every level that needs delta specs:

- **specs/<capability>/spec.md** — the delta for each affected capability.
  `sync` promotes by overwriting the whole canonical file, so the delta must
  carry the capability's **full** intended spec. When updating an existing
  capability, **start from** `lawbook/specs/<capability>/spec.md`. Use normative
  language and testable scenarios:
  ```markdown
  # <Capability>

  ### Requirement: <name>
  The system SHALL <requirement>.

  #### Scenario: <name>
  - Given <context>
  - When <action>
  - Then <observable outcome>
  ```

- **tasks.md** (levels 1–3) — ordered, checkable steps. MUST include the
  mandatory steps from `lawbook/config.yaml` (feature branch first; tests;
  manual verification by the agent; discipline reports; docs; archive in PR).
- **reports/** — always scaffold with `reports/README.md` naming expected
  disciplines (`backend.md`, `frontend.md`, `api.md`, … — `api.md` when an API
  surface is touched). Archive is blocked until at least one discipline report
  exists.

Next: read `steps/05-validate.md` and do only what it says.
