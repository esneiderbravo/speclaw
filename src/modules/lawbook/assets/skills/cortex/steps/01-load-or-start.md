# Load or start Cortex

- Confirm the change name with the user (or draft/quick first if none exists).
- Run the `cortex` MCP tool with `action: status` (or
  `speclaw cortex status --change <name>`). Prefer `action: brief` when you
  need the role + skill hints for the current stage.
- If missing, `action: start`.
- Read `ai-specs/agents/<role>.md` for the current stage's permission contract.
- If the host can spawn subagents (Claude Task / Cursor Task), spawn that role
  with the contract in the prompt. If not, **adopt the role** in this session
  but obey its allow/deny list strictly.

Stage → role:

| Stage | Role |
|-------|------|
| exploring | explorer (`explore` / `investigate` for bugs) |
| planning / questions | planner (`draft` / `quick`); questions always go to the human |
| implementing | implementer (`build` through implement hand-off) |
| reviewing | reviewer |
| testing | tester |
| archiving | archiver (`sync` + `archive`) |
| done | stop — report success |

Next: read `steps/02-dispatch-loop.md` and do only what it says.
