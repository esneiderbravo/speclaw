# Discipline reports — check-dispatcher

`build` fills one report per discipline this change touches, following the
required structure (header · gates table · tests added · spec-scenario coverage ·
pre-existing failures · pending manual · verdict).

Expected reports:

- **backend.md** — the `Law` model + manifest, the `checkAction()` evaluator, the
  hook compiler and idempotent settings-merge, the `AgentDef` hooks capability,
  and the `speclaw check` CLI / doctor changes. Includes the `PreToolUse` latency
  benchmark result (p99 < 15 ms with 50 laws).
- **api.md** — required: the change adds the `speclaw_check` MCP tool (a public
  tool surface) and the `speclaw check` command. Covers the tool contract
  (`projectPath`, `event`, `toolName?`, `payload` → ACS verdict + `elapsedMs`),
  the ≤12-word description, and the command-hook payload/exit-code contract.
- **security.md** — enforcement is a security-adjacent surface: the fail-open
  guarantee (a crashed evaluator never blocks), blocking of sensitive paths, the
  merge that must never delete foreign hook entries, and the honest reporting of
  agents where blocking laws do not apply.
