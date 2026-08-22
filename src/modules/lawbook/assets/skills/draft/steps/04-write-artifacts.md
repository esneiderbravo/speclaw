# Write the artifacts

Create under `lawbook/changes/<name>/`:

- **proposal.md** — the why, the what, non-goals, and whether migrations are
  needed. Reference the team's tracker ticket if there is one.
- **specs/<capability>/spec.md** — the delta spec for each affected capability.
  `sync` promotes this by overwriting the whole canonical file, so the delta must
  carry the capability's **full** intended spec. When you are updating an existing
  capability, **start from the current `lawbook/specs/<capability>/spec.md`** and
  edit on top of it, so its existing requirements are carried forward — do not
  author it from scratch, or promotion will silently drop them. Use normative
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
- **design.md** — always: approach, alternatives weighed, and the trade-offs
  behind the decision. For a small change, keep it short — but write it.
- **tasks.md** — ordered, checkable steps. MUST include the mandatory steps
  from `lawbook/config.yaml` (feature branch first; tests reviewed and run;
  manual verification executed by the agent; discipline reports produced; docs
  updated; archive within the PR).
- **reports/** — create the folder with a short `reports/README.md` naming the
  discipline reports the change will need — one per discipline it touches, from an
  open set (`backend.md`, `frontend.md`, `api.md`, `database.md`, `infra.md`,
  `security.md`, … — and `api.md` is required when the change touches any API
  surface) that `build` will fill, following the required report structure
  (header · gates table · tests added · spec-scenario coverage · pre-existing
  failures · pending manual · verdict — see the `build` skill's discipline-reports
  step). Every change ships this folder; archive is blocked until it holds at
  least one discipline report.

Next: read `steps/05-validate.md` and do only what it says.
