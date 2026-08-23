# add-tool-surface — consolidate MCP tools and gate surface cost

## Why

speclaw registers **28 MCP tools** (~4.1k definition tokens in the full profile).
Each definition is paid on **every** agent turn. Overlapping tools
(`compass_search` vs `compass_recall`, `explore` + `impact` + `affected_tests` for
one question) add choice noise and multiply round-trips. Measured full profile
already exceeds declared ceilings in `token-budget.json` (4083 > 3000 tools;
15246 > 13000 total) — and the budget test silently passes in CI because
`dist-test` lacks the committed budget file.

Roadmap **tool-surface** (#13) applies the CodeGraph lesson (−62% tokens by
consolidating) and rejects the CodexGraph trap (+106% from query languages).
Authority: **`defer_loading` is not author-settable** for MCP servers
([`02-correcciones-verificadas.md`](../../../docs/roadmap/02-correcciones-verificadas.md));
savings come from **fusion**, **minimal omit-set**, **output budgets**, and
**hard CI gates** — not deferred tiers.

## What

1. **≤8 canonical MCP tools** (deprecation aliases excluded from the count).
2. **`compass_explore` enriched** — source, callers, callees, aggregated blast
   radius, affected tests, hotspot; `to` absorbs call-path tracing.
3. **`compass_find`** — merges `compass_search` + `compass_recall`
   (`mode: exact | concept`; no `hybrid` until FTS/RRF).
4. **`compass_diff_context`** — one call for changed symbols + blast radius +
   tests + hotspots (reuses `git.ts` + affected/impact helpers).
5. **`lawbook_change`** — lifecycle actions: init, list, validate, sync,
   archive, level, coverage, drift.
6. **`speclaw_setup`** — init_project, configure_agent, add_pack, list_packs
   (setup/lifecycle; minimal omit-set).
7. **Remove from MCP:** `scaffold` (CLI-only — saves ~533 definition tokens),
   `doctor` (CLI/MCP `doctor` → CLI-only structured report), `compass_visualize`
   (CLI-only HTML graph).
8. **Output token budget** in `shared/mcp.ts` — `brief`/`full`, explicit
   `truncated[]`, counts preserved.
9. **Deprecation aliases** for retired names (2 minor versions); terse
   descriptions; `SPECLAW_NO_ALIASES=1`; `.speclaw/deprecated-calls.jsonl` log.
10. **Central tool catalog** (`src/shared/tool-catalog.ts` or equivalent) —
    single source for registration, omit-set, alias map, and count gate.
11. **Hard CI gates:** integration test caps canonical tools ≤8; budget test uses
    real `token-budget.json`; lowered measured ceilings committed; optional
    fixture benchmark for tool-call count regression.
12. **Assets + docs** — managed skills/commands use new tool names; README
    publishes before/after tool count and token cost vs Spec Kit 18.6k.

### Canonical eight (full profile)

| Tool | Absorbs / notes |
| --- | --- |
| `compass_explore` | + impact, trace (`to`), affected_tests, hotspots signals |
| `compass_find` | search + recall |
| `compass_diff_context` | new |
| `compass_index` | + watch |
| `lawbook_change` | init, list, validate, sync, archive, level, coverage, drift |
| `lawbook_investigate` | unchanged (bug RCA) |
| `speclaw_setup` | init_project, configure_agent, packs; **not** scaffold |
| `speclaw_check` | hooks enforcement; minimal omit-set |

`law_verify` remains **CLI-only** (`speclaw laws verify`); minimal profile keeps
the law loop via CLI + `speclaw_check` hooks.

## Non-goals

- **SQL/Cypher/query language** exposed to the model — prohibited.
- **`mode: hybrid`** on find — no FTS5/RRF in this change.
- **Client-side Tool Search / defer_loading** — not claimed or implemented.
- **Repeat-call server cache** — defer unless trivial; descriptions carry limits
  first.
- **Removing CLI commands** for retired MCP names — CLI keeps `speclaw query …`
  family with stable subcommands where agents already use terminal.

## Migrations

**Breaking** MCP renames (pre-1.0 minor 0.4.0). Alias period through 0.5.x,
removed 0.6.0. `update` refreshes managed assets; `doctor` scans personalized
files for retired names. Lower `token-budget.json` ceilings after measured post-
change totals. No Compass `SCHEMA_VERSION` bump.

## Decisions locked in explore

| Decision | Choice |
| --- | --- |
| Scope | **Single PR** — full consolidation (~8 tools), not phased |
| `scaffold` MCP | **Remove** — CLI-only |
| CI enforcement | **Hard gate** — tool-count test + real budget file in tests |
| `defer_loading` | **Not used** — minimal omit-set instead |
| Target count | **≤8 canonical** (aliases excluded) |
