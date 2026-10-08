# v3-lean-tools

> Draft (2026-10-08). Research carried over from `ship-measures-level` (2.0.20, PR #72).
> Not ready to build: the acceptance bar below must be met and measured first.

## Why

speclaw exposes 29 MCP tools, and a full Cortex cycle is far slower than an agent alone.

- **Unused surface.** Across 30 measured speclaw runs (`/tmp/bench-v2`, see
  `docs/benchmarks/cortex-speed.md`), agents called only `compass_explore`, `compass_find` and,
  after 2.0.20, `lawbook_investigate`. The 20 deprecated aliases and `speclaw_setup` had 0 uses;
  they only lengthen the tool list an agent must choose from.
- **Duplicate coordination.** The `cortex` tool and `lawbook_change` action `harness` drive the
  same harness.
- **Slow review.** The full Cortex cycle of `ship-measures-level` took **13 min 39 s**
  (harness history): review 5 min 25 s → rework 6 min 49 s → re-review 52 s → test/archive 25 s.
  The first review ran 329 s: 9 s in tools, ~320 s (97 %) model time, 94 messages, 29,693 output
  tokens; it made 27 Read + 24 Grep + 7 Glob calls and a single `compass_diff_context`. It still
  found 4 real defects, so speed must not cost that quality.
- **Unused bug tools.** `lawbook_investigate` now ranks the right code (test-reachable walk), but
  agents rarely pick it; `compass_diff_context` was never called by a working agent.

## What changes

1. Remove 21 MCP tools (29 → 8): `compass_search`, `compass_recall`, `compass_impact`,
   `compass_trace`, `compass_affected_tests`, `compass_hotspots`, `compass_coupling`,
   `compass_watch`, `lawbook_init`, `lawbook_list`, `lawbook_validate`, `lawbook_sync`,
   `lawbook_archive`, `lawbook_level`, `lawbook_coverage`, `lawbook_drift`, `init_project`,
   `configure_agent`, `list_packs`, `add_pack`, `speclaw_setup`. Update every doc/skill that still
   names them.
2. Keep `cortex` as the only coordination entry (the Cortex module — harness, role agents,
   fan-out lane — stays); remove `lawbook_change` action `harness`; update the role agents.
3. Remaining 8: `compass_explore`, `compass_find`, `compass_diff_context`, `compass_index`,
   `lawbook_change`, `lawbook_investigate`, `cortex`, `speclaw_check` (minimal: all but
   `compass_index`).
4. Fast review, agent-agnostic (no model switching — speclaw runs in Cursor, Codex, … and the
   `model` frontmatter is Claude-only):
   - the reviewer starts from `compass_diff_context` and reads only the diff's hunks/symbols
     (`compass_explore`), not whole files;
   - fixed short `review.md`: verdict, blocking findings with `file:line`, terse non-blocking list;
   - a checklist of the defect classes reviews have caught (stub artifacts accepted as written,
     tests touching the real checkout or data, missing discipline reports, red-first evidence).
5. A `PostToolUse` hint that suggests `lawbook_investigate` (with the output) when a test command
   fails, and `compass_diff_context` before the gates.
6. Benchmark: a complete Cortex flow scenario (implement → level docs → review → test → archive)
   and a fan-out scenario (3+ independent parts) against an agent alone.

## Acceptance bar (measured, before the PR)

- A complete Cortex flow on a level-2/3 task, in throwaway repos with real agents, finishes
  within **≤ 2× an agent alone** (proposed; user to confirm) — today ~13 min vs 1–2 min.
- Reviews still catch planted defects of the classes above.
- No agent-specific mechanism.

## Impact

- **Breaking:** clients or skills that call removed tool names fail → **3.0.0**.
- Modules: `shared/tool-catalog`, `shared/exposure`, every `register*.ts`, lawbook role agents and
  skills, docs, `token-budget.json`, benchmark scripts.

## Related, may land first as 2.0.21

The documentation hint measures the diff inside the `PostToolUse` hook. In ftd-admin-finanzas
(41 changed files) one measurement takes ~11 s (impact 5.4 s, affected tests 6.6 s) against the
hook's 5 s timeout: 2 hooks were cancelled, the level-3 hint was lost (state saved before
delivery), and ship re-measured 11 s at each stop. Fix: measure in a background process keyed by
file set, cache it for ship, record "told" only when a hint is returned, and strip quotes from
nudge patterns.
