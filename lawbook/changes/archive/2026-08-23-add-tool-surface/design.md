# Design — add-tool-surface

## Approach

| Concern | Module | Why |
| --- | --- | --- |
| Tool catalog + aliases | `shared/tool-catalog.ts` (new) | One gate for count, omit-set, alias delegation |
| Output budget + truncate | `shared/mcp.ts` | Intercept all `text()` responses |
| Rich explore + find | `compass/query.ts`, `compass/register.ts` | Compose impact, affected, hotspots, trace |
| Diff context | `compass/diff-context.ts` (new) | Reuse `changedFiles`, `listWorktreeChanges`, shared renderers |
| Lawbook fusion | `lawbook/register.ts` | `lawbook_change` action dispatch |
| Setup fusion | `foundation/register.ts`, `tools/register.ts` | `speclaw_setup`; drop scaffold MCP |
| Budget gate fix | `test/unit/budget.test.ts`, build copy-assets | Load real `token-budget.json` in dist-test |
| Surface gate | `test/integration/mcp-surface.test.ts` (new) | ≤8 canonical tools, no query-language params |
| Deprecation log | `shared/deprecation.ts` (new) | JSONL + doctor section |

**Invariant:** consolidation must **reduce total tokens** (definitions + outputs).
If the post-change benchmark does not beat baseline, the change is not done.

## Canonical tool matrix

### Full profile (8 registered)

```
compass_explore      — discovery + symbol context (default includes)
compass_find         — exact | concept search
compass_diff_context — git/working-tree change context
compass_index        — index + watch (action: start|stop|status)
lawbook_change       — action: init|list|validate|sync|archive|level|coverage|drift
lawbook_investigate  — bug RCA (minimal omit)
speclaw_setup        — action: init|configure-agent|add-pack|list-packs (minimal omit)
speclaw_check        — hook enforcement; ≤12 words; minimal omit
```

### CLI-only (not in MCP count)

`scaffold`, `doctor`, `compass_visualize` / `speclaw visualize`, `law_verify`.

### Retired MCP names → alias → canonical

| Retired | Delegates to |
| --- | --- |
| `compass_search` | `compass_find` mode=`exact` |
| `compass_recall` | `compass_find` mode=`concept` |
| `compass_impact` | `compass_explore` include blast_radius |
| `compass_trace` | `compass_explore` with `to` |
| `compass_affected_tests` | `compass_explore` or `compass_diff_context` includes |
| `compass_hotspots` | `compass_diff_context` / explore hotspot include |
| `compass_coupling` | explore hotspot path (coupling in diff only when file known) |
| `compass_watch` | `compass_index` action |
| `lawbook_init` … `lawbook_drift` (8) | `lawbook_change` actions |
| `init_project`, `configure_agent`, `add_pack`, `list_packs` | `speclaw_setup` actions |

Aliases: description ≤12 words; **not** counted in the 8; registered only when
`SPECLAW_NO_ALIASES` unset; response prefix `[deprecated] …`.

## `compass_explore` enriched

```ts
interface ExploreRichResult {
  found: boolean;
  symbol?: { name; kind; file; startLine; endLine; signature?; source? };
  callers: CallerRow[];
  callees: CalleeRow[];
  blastRadius?: GroupedImpactSummary;  // shared renderer with diff_context
  affectedTests?: { count: number; files: string[]; command?: string };
  hotspot?: { score: number; churn: number; complexity: number; rank: number };
  path?: PathRow[];                   // when `to` set
  otherMatches?: MatchRow[];
  truncated?: TruncationEntry[];
  degraded?: Array<"no-index" | "no-tests-data" | "no-hotspots">;
  message?: string;
}
```

`include` default: `source`, `callers`, `callees`, `blast_radius`, `tests`.
Missing signals → omit field + `degraded[]` entry (never throw).

## `compass_diff_context`

```
paths ← explicit | git diff (rev | WORKTREE via listWorktreeChanges)
symbols ← nodes intersecting changed hunks (or all nodes in file when no hunks — overcount declared)
blast ← union impact grouped
tests ← affectedTests(files)
hotspots ← files touched
→ apply output budget → shared JSON shape
```

Non-git without `paths` → actionable error (not empty success).

## Output budget (`shared/mcp.ts`)

```ts
export const OUTPUT_BUDGET = { brief: 1500, full: 4500 } as const;
```

Truncation order: symbol source → blast top-N → callers/callees lists →
otherMatches → test file list. Always populate `truncated[]` with exact omitted
counts. `estimateTokens(s)` = `ceil(s.length / 4)` (documented, stable).

## `lawbook_change` actions

| action | Required fields | Handler |
| --- | --- | --- |
| init | projectPath | specInit |
| list | projectPath | specList |
| validate | projectPath, change | specValidate |
| sync | projectPath, change | specSync |
| archive | projectPath, change, date | specArchive |
| level | projectPath, mode, … | handleLevel |
| coverage | projectPath, change?, … | buildCoverageReport |
| drift | projectPath, capability?, … | buildDriftReport |

Runtime validation via shared `requireFor(action, fields)` — actionable errors
(no raw Zod dumps).

## Minimal omit-set (updated)

Omit from MCP when `minimal`: `speclaw_setup`, `speclaw_check`, `lawbook_investigate`,
`compass_index`, all aliases.

Minimal loop (~5–6 tools): `compass_explore`, `compass_find`, `lawbook_change`
(validate/sync/coverage/drift actions), optionally `compass_diff_context`.

## Token ceilings (post-measurement targets)

Commit new `token-budget.json` after build:

| Surface | Current (v0.3.13) | Target (v0.4.0) |
| --- | ---: | ---: |
| tools (full) | 4083 | **≤2500** |
| tools (minimal) | 1147 | **≤900** |
| total always-on (full) | 15246 | **≤12000** |

Exact numbers set in build from `speclaw budget --json`; tests fail if exceeded.

## CI hard gates

1. `test/integration/mcp-surface.test.ts` — canonical count ≤8; no SQL/Cypher
   string params; aliases ≤12 words.
2. `test/unit/budget.test.ts` — resolves `token-budget.json` from package root
   (copy in build or `packageRoot()` in test).
3. `test/unit/output-budget.test.ts` — numeric truncation assertions.
4. `test/fixtures/tool-surface-benchmark.test.ts` — N questions × fixture repo;
   assert tool-call count and total tokens ≤ baseline ratios (documented in
   reports).

## Version

**0.4.0** — breaking MCP surface; CHANGELOG states pre-1.0 semver intent.
