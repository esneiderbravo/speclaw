# Lean tools and a fast review (2.1.0)

## Why

- **Cortex is too slow to adopt.** A full Cortex cycle of `ship-measures-level` took
  **13 min 39 s** on work one agent does in 1–2 min. Its first review ran 329 s, 97 % of it
  model time (~30k output tokens, 27 Read + 24 Grep + 7 Glob, one `compass_diff_context`), and
  still found 4 real defects — so speed must not cost that quality. A scoped prompt (diff
  exported to a file, `compass_diff_context` first, defect-class checklist, ≤ 40-line
  `review.md`) took 66 s / 9 calls / 37k tokens and verified every item with file:line.
- **The alias surface costs more than it saves.** 29 MCP tools for 9 jobs. In real sessions
  (all projects) the 20 retired aliases were called a few hundred times in total — 9 of them
  0–1 times — and alias calls failed 18 % of the time versus the canonical names. Each had a
  canonical call already.
- **Duplicate coordination.** `cortex` and `lawbook_change` action `harness` (plus
  `speclaw lawbook harness`) drove the same harness.
- **Bug tools go unused.** `lawbook_investigate` ranks the right code but agents rarely call it
  after a failing test.

## What changes

1. Remove the 20 retired MCP aliases and `lawbook_change` action `harness` / `speclaw lawbook
   harness`. Nine canonical tools remain (`speclaw_setup` stays canonical). `doctor` keeps
   naming project files that still cite a retired tool (now including `ai-specs/skills` and
   `ai-specs/agents`); the 2.1.0 `speclaw update` prompt rewrites them.
2. Scoped, agent-agnostic review: `cortex` `brief` at `reviewing` exports the diff and returns a
   bounded review prompt; the reviewer agent follows it (no model pinning).
3. A `PostToolUse` hint that points a failing test run at `lawbook_investigate`.
4. Benchmarks: a full Cortex flow and a fan-out flow against one agent in throwaway repos.

## Versioning

The user chose not to publish a major: this ships as **2.1.0** with a `BREAKING` note in the
CHANGELOG. Clients calling a removed name get "tool not found"; `speclaw update` and `doctor`
guide the migration.

## Acceptance

Before the PR: real agent runs on a one-line, a medium and a large change in throwaway repos,
speclaw vs the agent alone, measured (time, tokens, cost, tool calls, peak context, review
time, planted defects caught) → `reports/performance.md`.
