# Reports — enforce-compass-first

The tester writes one report per discipline this change touches, in the
required structure: header, gates-and-results table, tests added or updated,
spec-scenario coverage table, pre-existing failures, pending manual steps, and
verdict. See `docs/standards/testing-standards.md` and the
`spec-reports-disciplines` rule.

Expected disciplines:

- **`backend.md`**: shared call log (append, rotation, bounded tail), the
  Cortex Compass evidence gate (off/warn/strict, stage window, rework reset),
  `compass_index` totals and next step, and `scaffoldChange` with quick, bug,
  and feature draft.
- **`hooks.md`**: law enforcement. Covers the PostToolUse `Read|Grep|Glob`
  nudge entry, the input template (`path`, `pattern`), idempotent merge,
  nudge evaluation (eligibility, evidence window, rate limit, fail-open, no
  index query), and the CLI `--hook-payload` PostToolUse output with no
  `permissionDecision`.
- **`api.md`**: MCP contract changes. Covers `cortex` advance result fields
  (`compassEvidence`, `warnings`, strict rejection), `compass_index` result
  (`totals`, `nextStep`), `speclaw_check` result (`nudge`), the new
  `lawbook_change` action `draft` (+ `bug`), the nine-tool cap, and the
  description budget. Exercised through the contract stub and
  `test/integration/mcp-surface.test.ts` in scratch repos.
- **`cli.md`**: `speclaw lawbook draft <name> [--level N] [--json]`,
  `speclaw index` totals output, `speclaw cortex advance` warnings on stderr,
  and `speclaw check --hook-payload -` for PostToolUse. Exercised against the
  built CLI in scratch repos.
- **`docs.md`**: skill, agent, and doc text changes (explore/draft/cortex
  steps, role agent tool lists, `docs/compass.md`, `docs/cortex.md`, operator
  notes) and the shipped asset copies matching `ai-specs/`.
- **`performance.md`**: required by the human. A `main` vs branch comparison
  from `scripts/bench/compass-first.mjs`: micro-benchmarks (median/p95 with
  deltas, environment, SHAs) and the agent-level explore benchmark, with the
  FAR-2199 and this-change reference points. See design.md §8.

The reviewer writes `review.md` with the harness verdict.
