# Backend checks — fix-compass-query-output (2026-10-07)

**Discipline:** backend (Compass extraction/resolution/search, find formatter,
Cortex harness, lawbook ceremony) · **Change:** fix-compass-query-output (bug,
level 3) · **Date:** 2026-10-07 · **Branch:** fix/compass-query-output
(uncommitted working tree vs `main`) · **cwd:** gates in
`/Users/esneiderbravo/Projects/speclaw`; manual checks in `mkdtemp` fixtures
under `/tmp`.

## Gates & results

| Check | Command | Result |
|---|---|---|
| Lint + format | `npm run check` | ✅ exit 0. "All matched files use Prettier code style!", ESLint clean. |
| Type-check + compile | `npm run build` | ✅ exit 0. "copy-assets: copied assets for 3 module(s)". |
| Tests + coverage | `npm test` | ✅ exit 0. **984 tests, 984 pass, 0 fail, 0 skipped.** Coverage over all files: **88.35 % lines / 85.74 % branches / 90.57 % functions** (floor 80). Changed modules: `extract.js` 97.57/88.60/96.43, `hybrid.js` 92.92/89.08/91.30, `indexer.js` 97.30/94.25/98.15, `query.js` 97.41/88.89/98.15, `explore-rich.js` 74.32/83.33/83.33, `find-output.js` 100/93.85/100, `harness.js` 90.94/83.81/87.50, `bugfix.js` 83.00/65.96/81.82, `levels.js` 95.08/87.05/89.47, `quick.js` 98.88/75.00/100, `deps.js` 100/88.89/100, `graph.js` 99.55/86.84/100. |
| Change validation | `node dist/cli/index.js lawbook validate fix-compass-query-output` | ✅ exit 0, valid (3 delta specs). 107 advisory warnings (EARS style; one known false positive, "drops Task-relative ranking"). |
| Requirement coverage | `node dist/cli/index.js coverage --change fix-compass-query-output --json` on the isolated working-tree copy | ✅ exit 0. 29/29 identified requirements deep-covered, **0 direct defects**. |
| Laws + integrity | `node dist/cli/index.js verify` on the isolated copy (byte-identical lock and strict files) | ⚠️ exit 1. 1 passed · 12 failed · 2 unknown. All 12 failures are `drift~changed-semantic` (table below). Integrity: only the expected advisory mismatch on `docs/compass.md`. `main` snapshot: 1 passed · 0 failed · 2 unknown. |

### Drift detail (`speclaw drift --json`, isolated copy)

`changedSemantic: 12`, `deleted: 0`, `moved: 0`. On `main`: `semantic 0`.

| Capability | Requirement anchor | Symbol (file) |
|---|---|---|
| cli | never-contaminate-machine-consumed-output | `explore` (`src/modules/compass/query.ts`) |
| context-budget | output-token-budget-on-tool-responses | `text` (`src/shared/mcp.ts`) |
| law-enforcement | compass-first-nudge ×4 | `handleHarness` (`src/modules/cortex/harness.ts`) |
| lawbook-workflow | a-complete-explorer-brief-is-the-planner-code-map ×2, compass-call-log ×1, explore-locates-through-compass-before-indexing-or-reading-code ×3 | `explore` (`src/modules/compass/query.ts`) |

Each of these bodies is edited on purpose by this change (`includeRefs`/`via`,
the opt-in `text()` budget, the harness guards). The tests that guard those
requirements are green. Archive reseals only the change's own capabilities
(`code-graph`, `context-budget`, `lawbook-workflow`; `engine.ts:661-667`). The
`cli` and `law-enforcement` anchors (5 findings) stay drifted after archive
unless they are resealed. That is for the archiver (see "Pending").

## Tests added / updated — red before the fix, green after

Red is quoted from `reports/.red-before-fix.txt` (HEAD 5854270, `src/`
untouched: "ℹ tests 91 · pass 65 · fail 26"). Green is from the full
`npm test` run above.

| Test (file) | Asserts | Red before fix | Green |
|---|---|---|---|
| `worktree focus excludes unindexed files` (`test/integration/retrieval.test.ts`) | worktree focus keeps only indexed paths and reports `focusIgnored` | `actual: [ 'notes.md', 'src/a.ts' ], expected: [ 'src/a.ts' ]` | ✅ |
| `explicit unindexed focus falls back to no-focus defaults` (same) | `focus: []`, no-focus budget and PageRank | `actual: [ 'notes.md' ], expected: []` | ✅ |
| `exact find for a missing name reports not found with nearest` (same) | `found:false`, `nearest[0] RequestDetail` | `actual: undefined, expected: false` | ✅ |
| `multi-term exact query ORs identifiers` (same) | both names, `terms` | `actual: undefined, expected: [ 'alpha', 'beta' ]` | ✅ |
| `explore lists type references as callers via ref` (`test/integration/compass.test.ts`) | `render`/`Widget` `via:"ref"`, `main` `via:"call"`, no cross-file bare-name bind | `actual: undefined, expected: 'ref'` | ✅ |
| `ref edges change neither impact nor affected tests` (same) | impact/affected unchanged | `the fixture produced ref edges … actual: false, expected: true` | ✅ |
| `a per-file reindex resolves ref edges like a full index` (same; rework F4) | per-file `ref` rows equal full index | not recorded (review-finding coverage, not a bug regression) | ✅ |
| `TS annotations, generics, and heritage clauses become ref edges`, `JS class heritage is a ref; …`, `Python emits no ref edges`, `a type parameter shadows a name only inside its own declaration`, `a same-file interface keeps its refs outside a same-named type parameter` (`test/unit/extract-refs.test.ts`, new; rework F3) | extraction rules, built-ins, de-dup, type-parameter scope | not recorded (F3 refinement) | ✅ ×5 |
| `find-output.test.ts` (new, 9 cases) | formatter trim order, prefixes, totals, exact `tokens`, last-resort drop | rework F1 red is in the contract file: `"…billing-module-22/reques … [truncated — narrow includes or the query]"` | ✅ ×9 |
| `bug draft without a level is not self-confirmed` / `a bug draft with a supplied level is confirmed` (`test/unit/bugfix.test.ts`) | no `confirmed*` fields; validate wants `design.md`; supplied level confirmed | `change.json carries confirmedLevel … actual: true, expected: false` | ✅ ×2 |
| `pauseForQuestions outside planning is rejected` (`test/unit/harness.test.ts`) | throws naming planning; `harness.json` byte-identical | `Missing expected exception. … expected: /planning[\s\S]*exploring…/` | ✅ |
| `advance follows the level confirmed after start` (same) | level re-read → `planning`, level 2 | `actual: 'implementing', expected: 'planning'` | ✅ |
| `an unconfirmed level never skips planning` (same) | unconfirmed → 3 | `actual: 'implementing', expected: 'planning'` | ✅ |
| `empty targets propose no level` (`test/unit/levels.test.ts`) | `level: null`, `no-targets` | `{"filesTouched":0,… actual: false, expected: true` | ✅ |
| `set and promote without targets keep the stored proposal` (same) | proposal preserved | `set kept level … actual: 0, expected: 1` | ✅ |
| `set without targets and without a stored proposal stores the no-targets proposal` (same) | `level: null` stored | `actual: 0, expected: null` | ✅ |
| `promote on a change with no confirmed level is rejected with use mode set` (same; rework F5) | error, `change.json` unchanged | not recorded (new guard documented in review F5) | ✅ |
| Updated literals / counts (`metrics`, `hotspots`, `affected-tests`, `git-history-cache`, `fts`, `embedding-cache`, `drift`, `feature-draft`, `bugfix-flow`) | schema `"12"`, edge totals, bug-draft fields | n/a (expected moves, task 17) | ✅ |

## Manual verification (fixtures under `/tmp`, built `dist/`)

- **Ref extraction and resolution** (fixture `fcq-fixture.*`, read-only SQLite
  query of its own index): there are exactly 3 `ref` rows. `render → Props
  (src/types.ts)`, `Widget → Props (src/types.ts)`, `otherUse → Props
  (src/other.ts, its same-file definition)`. `wrap<Props>(x: Props)` adds no
  edge (type parameter). There is no cross-file bare-name binding. `call`/`import`
  counts are the same as 2.0.12 on the same tree (1 / 2).
- **Explore callers:** MCP `compass_explore src/types.ts` →
  `render`/`Widget` `via:"ref"`. CLI `explore render` → `main … via call`.
- **Focus (RC2):** indexed focus only. A tracked+modified `notes.md` →
  `focusIgnored`. An untracked file is never considered (**T1**).
- **Exact mode (RC3):** not-found with `nearest`, found, and multi-term OR, all
  confirmed over MCP (see `api.md`).
- **Find budget (RC1):** every response is valid JSON within its cap (256 /
  1500 / 8000) with `tokens` exact. Explore full is not cut at 1500, but the
  source field is cut at 120 lines with a `use mode:"full"` hint (**T2**).
- **Harness / ceremony (RC5–RC7):** CLI and MCP checks in a lawbook fixture
  all behave as specified (`api.md`, `cli.md`).

## Edge-query audit (task 10 / R7, from `review.md`, re-checked against the current source)

Every `FROM edges` / `JOIN edges` in `src/` (found with
`grep -rn -E "(FROM|JOIN) edges" src`) has a kind filter or does not need one:

| Query | Kind filter | Why it is safe |
|---|---|---|
| `src/modules/compass/hybrid.ts:365, 368, 439` | `kind = 'call'` | neighbour expansion / PageRank input; refs excluded |
| `src/modules/compass/map.ts:34` | `kind = 'call'` | compact map |
| `src/modules/compass/visualize.ts:69` | `kind = 'call'` | HTML graph |
| `src/modules/compass/indexer.ts:326` | `kind = 'call'` | resolved-call count |
| `src/modules/compass/indexer.ts:349, 439` | `kind = 'import'` | import resolution |
| `src/modules/compass/indexer.ts:1566` | `kind = 'call'` | PageRank edges |
| `src/modules/compass/query.ts:312, 322, 972` | `kind = 'call'` | callees, trace, investigate paths |
| `src/modules/compass/query.ts:341` | `includeRefs ? kind IN ('call','ref') : kind = 'call'`; the by-name fallback is `e.kind = 'call'` only | explore callers; refs count only through their resolved id |
| `src/modules/compass/query.ts:707` | `kind IN (…)`, default `call`+`import` | impact / affected tests / diff context; an explicit `ref` matches no arm |
| `src/modules/compass/hotspots.ts:233, 251` | `kind IN ('call', 'import')` | coupling `in_graph`, hotspots |
| `src/modules/foundation/deps.ts:45, 64` | `edgeKindClause(edgeKinds)`, default `DEFAULT_EDGE_KINDS = ["call","import"]` (`laws.ts:58`) | deps laws; before this change only those two kinds existed, so laws evaluate as before |
| `src/modules/foundation/graph.ts:31` | same default | graph laws; refs never form a law cycle |
| `src/modules/compass/indexer.ts:765, 769` (`detach`, `detachedOwners`) | none, **on purpose** | refs must be detached and re-resolved like calls on a per-file reindex |
| `src/modules/compass/indexer.ts:1493` `countTotals` | none | index stats now include `ref` rows. `bugfix.md` §4 expects this; `indexNextStep` does not print edges. |

`affected.ts`, `diff-context.ts`, and `pagerank.ts` do not query `edges`
directly. They go through `impact()` (`query.ts:707`) or receive call-only edges
(`indexer.ts:1566`, `hybrid.ts`). Result: `ref` rows reach only explore callers.
Manual confirmation: impact and affected tests are unchanged (integration test
"ref edges change neither impact nor affected tests").

## Spec-scenario coverage — new or changed scenarios owned by this report

| Spec | Requirement | Scenario | Verified by |
|---|---|---|---|
| code-graph | `req~type-ref-edges~1` | An interface lists its users as ref callers | `compass.test.ts` ✅; manual MCP/CLI ✅ |
| code-graph | `req~type-ref-edges~1` | A generic type name does not bind across unrelated files | `compass.test.ts` ✅; manual `otherUse → src/other.ts Props` ✅ |
| code-graph | `req~type-ref-edges~1` | Refs do not change blast radius or tests | `compass.test.ts` "ref edges change neither impact nor affected tests" ✅; audit above |
| code-graph | `req~type-ref-edges~1` | Built-in types and repeats add no edge | `compass.test.ts`, `extract-refs.test.ts` ✅ |
| code-graph | `req~type-ref-edges~1` | A type parameter shadows a name only in its own declaration | `extract-refs.test.ts` ×2 ✅; manual `wrap<Props>` adds no edge ✅ |
| code-graph | `req~type-ref-edges~1` | A per-file reindex resolves refs like a full index | `compass.test.ts` per-file case ✅ |
| code-graph | `req~reindex-on-edit~1` | Resolution matches a full index (changed) | `resolve-edges.test.ts` "resolveEdges with and without fileIds matches a full index" + per-file ref case ✅ |
| code-graph | `req~compass-mcp-surface~1` | Find always runs hybrid; exact mode also filters to exact names | `retrieval.test.ts` exact cases ✅; manual ✅ |
| code-graph | `req~find-exact-not-found~1` | A missing name is reported with the nearest names | `retrieval.test.ts` ✅; manual ✅ |
| code-graph | `req~find-exact-not-found~1` | An existing name is found without nearest | `retrieval.test.ts` ✅; manual ✅ |
| code-graph | `req~find-exact-not-found~1` | Multi-term exact queries are an OR of identifiers | `retrieval.test.ts` ✅; manual ✅ |
| code-graph | `req~find-exact-not-found~1` | Concept mode keeps fuzzy results | `retrieval.test.ts` golden-set MRR gate ✅ |
| code-graph | `req~task-relative-ranking~1` | Focus defaults to the working state (changed) | `retrieval.test.ts` worktree case ✅; manual ✅ |
| code-graph | `req~task-relative-ranking~1` | Worktree focus excludes unindexed files | ❌ **T1**: passes for a tracked+modified file; the scenario's untracked `notes.md` is not reported (manual) |
| code-graph | `req~task-relative-ranking~1` | Explicit unindexed focus falls back to no-focus defaults | `retrieval.test.ts` ✅; manual ✅ (O1) |
| context-budget | `req~find-response-budget~1` | all 7 scenarios | see `api.md` ✅ |
| context-budget | Output token budget on tool responses | Full mode is not cut at the brief ceiling / A full-mode truncation hint is truthful / text() keeps its default | see `api.md`, ✅ with **T2** |
| lawbook-workflow | Ceremony level is proposed from graph signals | Empty targets propose no level | `levels.test.ts` ✅; manual MCP `propose` → `level: null` ✅ |
| lawbook-workflow | `req~level-proposal-preserved~1` | Set without targets keeps the stored proposal | `levels.test.ts` ✅; manual MCP ✅ |
| lawbook-workflow | `req~level-proposal-preserved~1` | Promote without targets keeps the stored proposal | `levels.test.ts` ✅; manual MCP ✅ |
| lawbook-workflow | `req~level-proposal-preserved~1` | Targets replace the stored proposal with a measurement | `levels.test.ts` ✅; manual MCP `set 2` + 3 paths → score 8 ✅ |
| lawbook-workflow | `req~level-proposal-preserved~1` | Promote on an unconfirmed change is rejected | `levels.test.ts` ✅; manual MCP ✅ |
| lawbook-workflow | `req~bug-draft-unconfirmed~1` | A bug draft without a level is unconfirmed | `bugfix.test.ts` ✅; manual CLI + MCP ✅ |
| lawbook-workflow | `req~bug-draft-unconfirmed~1` | An unconfirmed bug draft is held to full ceremony | `bugfix.test.ts` ✅; manual `validate` → "missing design.md (required at ceremony level 3)" ✅ |
| lawbook-workflow | `req~bug-draft-unconfirmed~1` | A supplied level is confirmed | `bugfix.test.ts` ✅ |
| lawbook-workflow | `req~feature-draft~1` | Quick and bug drafts are unchanged by the shared scaffold (changed) | `feature-draft.test.ts` "bug draft output is unchanged…", "quick and bug drafts keep accepting non-kebab names" ✅ |
| lawbook-workflow | `req~harness-pause-questions~1` | A pause from implementing is rejected | `harness.test.ts` ✅; manual CLI + MCP ✅ |
| lawbook-workflow | `req~harness-pause-questions~1` | A pause from exploring is rejected | `harness.test.ts` ✅; manual CLI (exit 1, byte-identical) ✅ |
| lawbook-workflow | `req~harness-pause-questions~1` | A pause from planning records the questions | `harness.test.ts` "harness start/status/advance and rejects illegal jumps" ✅; manual MCP ✅ |
| lawbook-workflow | `req~harness-pause-questions~1` | The CLI exits non-zero on a misplaced pause | `cortex-questions-cli.test.ts` ✅; manual (see `cli.md`) ✅ |
| lawbook-workflow | `req~harness-level-current~1` | A level set after start governs the next advance | `harness.test.ts` ✅; manual MCP ✅ |
| lawbook-workflow | `req~harness-level-current~1` | An unconfirmed level never skips planning | `harness.test.ts` ✅; manual CLI ✅ |
| lawbook-workflow | `req~harness-level-current~1` | A confirmed level 0 still skips planning | `harness.test.ts` "level 0 skips planning and review on advance" ✅; manual MCP ✅ |

The schema scenarios are in `database.md`. The CLI scenarios are in `cli.md`.

## Findings

- **T1, T2, O1:** see `api.md` "Findings". T1 is spec/bugfix wording only. T2
  needs a small code fix in `budgetExploreShape` plus a red-first unit case.
- **R7:** done. The audit is above.

## Pre-existing / unrelated failures

- The repository's own Compass index is empty (schema 11, needs_reindex,
  0 edges) because the session's MCP server process runs pre-change code; see
  `api.md`. Unrelated to the change's correctness.
- None among the tests (984/984).

## Pending manual steps

None for verification. For the archiver: reseal the `cli` and
`law-enforcement` drift anchors (`speclaw drift --reseal`, after confirming the
edits are intended) so `speclaw verify` returns to 0 failures.

## Verdict

**PASS**: the backend behaviour is correct and fully tested; T1 and T2 are resolved (see Rework 2).

### Rework 2 (T1, T2) — re-test

- T1: the worktree-focus scenario and bugfix.md now say *tracked, modified*
  `notes.md`, and the scenario adds "untracked files SHALL NOT be part of the
  worktree focus" (git diff HEAD skips untracked files).
- T2: `budgetExploreShape` sizes full-mode source to 400 lines and its full-mode
  hints no longer point at `mode:"full"`. Regression test
  `test/unit/output-budget.test.ts::budgetExploreShape keeps a 172-line source
  whole in full mode…` failed first (`ℹ pass 6 / ℹ fail 1`) and passes after
  the fix; output in `.red-before-fix.txt` under "rework 2 / T2". Manual:
  `compass_explore handleHarness mode:"full"` returns 172/172 source lines with
  no truncation entry.
- Gates: `npm run check && npm test` exit 0 — 985 tests, 985 pass, 0 fail;
  coverage 88.39% lines / 85.74% branches / 90.57% functions (68 s).


## Appendix — unchanged scenarios of the three delta specs

The delta specs are full copies of the canonical specs. The scenarios below
have the same requirement, title, and body as `main`'s `lawbook/specs/*`
(compared by script). No code they describe lost its tests, and the full suite
is green. Total across the three specs: 156 + 32 + 144 = 332 scenarios =
47 new/changed (tables above, `api.md`, `database.md`, `cli.md`) + 285
unchanged (below).

### code-graph — 135 unchanged scenarios

| Requirement | Scenario | Verified by |
|---|---|---|
| Id-first reverse reachability `req~impact-id-first~1` | Id-resolved edge is preferred over name match | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Id-first reverse reachability `req~impact-id-first~1` | Name-resolved results are flagged | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Id-first reverse reachability `req~impact-id-first~1` | Import-only dependent is found | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Id-first reverse reachability `req~impact-id-first~1` | Declaration-less importer is found | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Id-first reverse reachability `req~impact-id-first~1` | Calls in callbacks have an owner | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Id-first reverse reachability `req~impact-id-first~1` | Member calls on foreign receivers are not bound by name | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Id-first reverse reachability `req~impact-id-first~1` | Builtin globals bind only within the file | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Id-first reverse reachability `req~impact-id-first~1` | Package-namespace receivers are foreign | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Id-first reverse reachability `req~impact-id-first~1` | Scoped-looking paths aliases are project code | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Id-first reverse reachability `req~impact-id-first~1` | Pure re-export barrels are project code | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Id-first reverse reachability `req~impact-id-first~1` | A call through a barrel prefers the barrel's subtree | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Id-first reverse reachability `req~impact-id-first~1` | Single-segment baseUrl modules are project code | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Id-first reverse reachability `req~impact-id-first~1` | An imported project function named like a builtin binds across files | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Id-first reverse reachability `req~impact-id-first~1` | Restricting edge kinds excludes imports | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Id-first reverse reachability `req~impact-id-first~1` | A cyclic graph terminates | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Import resolution `req~import-resolution~1` | Multi-line import resolves | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Import resolution `req~import-resolution~1` | An import longer than the cap still resolves | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Import resolution `req~import-resolution~1` | tsconfig paths alias resolves per workspace | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Import resolution `req~import-resolution~1` | Malformed tsconfig does not fail indexing | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Grouped blast-radius output | Large blast radius is summarised | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Grouped blast-radius output | Flat format is available on request | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Grouped blast-radius output | Ambiguous symbol name is announced | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Global files never report empty impact | Touching tsconfig is repo-wide | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Global files never report empty impact | Test-only change is empty for build target | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Schema records test and module metadata | Test files are marked at index time | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Schema 11 edge membership migration `req~schema-edge-membership~1` | A schema-11 index without edges.spec migrates in place | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Schema 11 edge membership migration `req~schema-edge-membership~1` | Reindex after migration recomputes no unchanged embedding | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Schema 11 edge membership migration `req~schema-edge-membership~1` | Failed 10 to 11 migration rolls back | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Static affected-test selection `req~affected-test-selection~1` | Only reachable tests are selected | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Static affected-test selection `req~affected-test-selection~1` | Nothing selected yields no command | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Static affected-test selection `req~affected-test-selection~1` | Vitest package gets a non-watch command | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Static affected-test selection `req~affected-test-selection~1` | Compiled node test layout is mapped | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Static affected-test selection `req~affected-test-selection~1` | Hoisted runner is inherited | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Static affected-test selection `req~affected-test-selection~1` | Node test flag values stay with their flags | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Static affected-test selection `req~affected-test-selection~1` | Directory argument selects the files under it | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Static affected-test selection `req~affected-test-selection~1` | Workspace-spanning selection lists every group | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Static affected-test selection `req~affected-test-selection~1` | Global file selects the full suite | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Static affected-test selection `req~affected-test-selection~1` | Unindexed language degrades loudly | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Static affected-test selection `req~affected-test-selection~1` | Diff mode uses git changed files | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Optional affected configuration | Missing config uses defaults | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Schema records per-symbol health metrics | Nested branches are counted for a function | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Schema records per-symbol health metrics | LOC matches line span | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Hotspots join activity and health on two axes | Default window is ninety days | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Hotspots join activity and health on two axes | High-churn unhealthy file ranks above quiet clean file | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Hotspots join activity and health on two axes | Axes remain visible under combined sort | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Hotspots join activity and health on two axes | Shallow clone is announced | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Temporal coupling with graph contrast | Co-changing files without an AST edge are flagged | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Temporal coupling with graph contrast | Member and builtin calls do not put a pair in the graph | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Temporal coupling with graph contrast | Giant commits do not invent coupling | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Temporal coupling with graph contrast | File and its test are marked isTestPair | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Temporal coupling with graph contrast | Weak single co-commit is filtered | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Consolidated Compass MCP surface `req~compass-mcp-surface~1` | One explore call replaces impact and tests | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Consolidated Compass MCP surface `req~compass-mcp-surface~1` | Callees are resolved only | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Consolidated Compass MCP surface `req~compass-mcp-surface~1` | Callback callers are listed | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Consolidated Compass MCP surface `req~compass-mcp-surface~1` | File-owner nodes are hidden from find | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Consolidated Compass MCP surface `req~compass-mcp-surface~1` | Diff context covers the working tree | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Consolidated Compass MCP surface `req~compass-mcp-surface~1` | Non-git diff without paths is refused | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Consolidated Compass MCP surface `req~compass-mcp-surface~1` | Visualize is CLI-only | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Directory hash tree | Unchanged repository short-circuits | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Directory hash tree | A single changed file limits extraction | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Directory hash tree | Emptying a directory changes the root | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Stat prefilter before content hash | Matching stat skips a read | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Stat prefilter before content hash | Force bypasses the prefilter | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Embedding cache keyed by embedder input | Renaming a file recomputes nothing | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Embedding cache keyed by embedder input | Moving code between files recomputes nothing | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Embedding cache keyed by embedder input | Returning to a previous branch recomputes nothing | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Embedding cache keyed by embedder input | Identical symbols embed once | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Embedding cache keyed by embedder input | Recipe bump invalidates | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Embedding cache lifecycle | Orphans pruned on request | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Embedding cache lifecycle | Size limit evicts least recently seen | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Schema migration preserves embeddings | Existing vectors survive migration | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Schema migration preserves embeddings | Failed migration rolls back | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Per-file fragment independence | Reindexing A leaves B untouched | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Full-text index | Docstring text is searchable | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Full-text index | Subtokens make camelCase reachable from prose | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Full-text index | BM25 ordering is not inverted | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Full-text index | Missing FTS5 support degrades instead of failing | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Rank fusion | Fusion uses ranks only | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Rank fusion | Exact name match is boosted | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Rank fusion | Query shape routes the weights | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Task-relative ranking `req~task-relative-ranking~1` | Focus changes the ordering | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Task-relative ranking `req~task-relative-ranking~1` | Empty focus falls back to global importance | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Task-relative ranking `req~task-relative-ranking~1` | Generic names are penalized | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Token budget | Output respects the budget | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Token budget | A single oversized result is truncated, not dropped | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Hybrid retrieval quality gate | Golden set enforces MRR | Unchanged from canonical; full suite `npm test` 984/984 pass |
| No new runtime dependencies for hybrid retrieval | Default install has no downloads | Unchanged from canonical; full suite `npm test` 984/984 pass |
| No new runtime dependencies for hybrid retrieval | Lexical embedder remains default | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Explore resolves a file path `req~explore-file-path~2` | Exact repo-relative path returns found true and a symbol from that file | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Explore resolves a file path `req~explore-file-path~2` | Symbol-name explore is unchanged | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Explore resolves a file path `req~explore-file-path~2` | A path that matches no file still may fuzzy-match names | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Explore resolves a file path `req~explore-file-path~2` | File stem selects the matching symbol | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Explore resolves a file path `req~explore-file-path~2` | Missing stem falls through to the first function | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Explore resolves a file path `req~explore-file-path~2` | Unique basename resolves to that file | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Explore resolves a file path `req~explore-file-path~2` | Ambiguous basename lists symbols from each file | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Explore resolves a file path `req~explore-file-path~2` | Declaration-less file resolves to its file-owner node | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Explore resolves a file path `req~explore-file-path~2` | Symbol-less file without references resolves to its file-owner node | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Explore resolves a file path `req~explore-file-path~2` | Search fallback matches file paths | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Explore returns the exact symbol source `req~explore-exact-source~1` | Multibyte text before the symbol does not shift the source | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Explore returns the exact symbol source `req~explore-exact-source~1` | A leading byte-order mark does not shift the source | Unchanged from canonical; full suite `npm test` 984/984 pass |
| No-op index fast path `req~index-noop-fast-path~1` | A no-op run leaves the compact map untouched | Unchanged from canonical; full suite `npm test` 984/984 pass |
| No-op index fast path `req~index-noop-fast-path~1` | A no-op run skips global post-processing | Unchanged from canonical; full suite `npm test` 984/984 pass |
| No-op index fast path `req~index-noop-fast-path~1` | An empty compact map block is refilled on a no-op run | Unchanged from canonical; full suite `npm test` 984/984 pass |
| No-op index fast path `req~index-noop-fast-path~1` | A changed file still runs the full pass | Unchanged from canonical; full suite `npm test` 984/984 pass |
| No-op index fast path `req~index-noop-fast-path~1` | A pending per-file reindex forces the full pass | Unchanged from canonical; full suite `npm test` 984/984 pass |
| No-op index fast path `req~index-noop-fast-path~1` | Force, prune, and an explicit cache cap bypass the fast path | Unchanged from canonical; full suite `npm test` 984/984 pass |
| No-op index fast path `req~index-noop-fast-path~1` | The no-op index is not slower than main | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Session-start index refresh `req~session-start-index~1` | No index means nothing happens | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Session-start index refresh `req~session-start-index~1` | An unchanged index refreshes silently | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Session-start index refresh `req~session-start-index~1` | A changed file is picked up | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Session-start index refresh `req~session-start-index~1` | A locked database is swallowed | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Session-start index refresh `req~session-start-index~1` | The session-start run is not logged as a Compass call | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Session-start index refresh `req~session-start-index~1` | Help lists the session-start command | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Per-file reindex on edit `req~reindex-on-edit~1` | No index means nothing happens | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Per-file reindex on edit `req~reindex-on-edit~1` | An edited file is picked up in path mode | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Per-file reindex on edit `req~reindex-on-edit~1` | A hook payload re-indexes the edited file | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Per-file reindex on edit `req~reindex-on-edit~1` | Hook mode does not wait for the index | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Per-file reindex on edit `req~reindex-on-edit~1` | A per-file run leaves global state alone | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Per-file reindex on edit `req~reindex-on-edit~1` | An unchanged file writes no node or edge | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Per-file reindex on edit `req~reindex-on-edit~1` | A deleted file is removed from the index | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Per-file reindex on edit `req~reindex-on-edit~1` | Ineligible targets write nothing | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Per-file reindex on edit `req~reindex-on-edit~1` | A malformed hook payload writes nothing | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Per-file reindex on edit `req~reindex-on-edit~1` | A locked database is swallowed | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Per-file reindex on edit `req~reindex-on-edit~1` | The last edit wins under overlapping runs | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Per-file reindex on edit `req~reindex-on-edit~1` | A full run keeps a file a per-file run indexed after its walk | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Per-file reindex on edit `req~reindex-on-edit~1` | A full run drops a stored path its walk no longer yields | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Per-file reindex on edit `req~reindex-on-edit~1` | A per-file run registers the path the walk yields | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Per-file reindex on edit `req~reindex-on-edit~1` | A stale schema writes nothing | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Per-file reindex on edit `req~reindex-on-edit~1` | The per-file run is not logged as a Compass call | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Per-file reindex on edit `req~reindex-on-edit~1` | Directory hashes match a full walk | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Per-file reindex on edit `req~reindex-on-edit~1` | Help lists the reindex-file command | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Per-file reindex on edit `req~reindex-on-edit~1` | The per-edit cost stays below a full refresh | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Edge destinations survive re-extraction `req~edge-ids-survive-reindex~1` | Callers survive a full re-index of the callee file | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Edge destinations survive re-extraction `req~edge-ids-survive-reindex~1` | Callers survive a per-file reindex of the callee file | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Edge destinations survive re-extraction `req~edge-ids-survive-reindex~1` | A removed symbol leaves its callers unresolved | Unchanged from canonical; full suite `npm test` 984/984 pass |

### context-budget — 22 unchanged scenarios

| Requirement | Scenario | Verified by |
|---|---|---|
| Context cost measurement | Budget command reports every surface | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Context cost measurement | Tool schema is included in the tool's cost | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Context cost measurement | Estimator is deterministic | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Declared budget enforcement | Exceeding the budget fails the suite | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Declared budget enforcement | A single tool exceeding its cap fails at registration | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Tool definition discipline | Descriptions stay within the word cap | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Tool definition discipline | Registration rejects an oversized definition | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Exposure profiles omit tools | Default exposure registers the full set | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Exposure profiles omit tools | Minimal mode reduces the registered set | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Exposure profiles omit tools | Minimal mode persists across update | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Just-in-time workflow loading | Skill entry point does not contain the whole workflow | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Just-in-time workflow loading | Each step names its successor | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Committed compact map | Map is regenerated within markers | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Committed compact map | Map respects its token budget | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Committed compact map | Missing index omits the map | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Committed compact map | Removed markers are left alone | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Honest context-cost reporting in doctor | Doctor reports mode and cost | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Bounded MCP tool surface | Canonical tool count is gated | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Bounded MCP tool surface | Aliases are excluded from the canonical count | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Output token budget on tool responses | Brief mode stays within budget | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Output token budget on tool responses | Truncation is explicit | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Budget tests use committed ceilings | Over-budget registration fails in CI | Unchanged from canonical; full suite `npm test` 984/984 pass |

### lawbook-workflow — 128 unchanged scenarios

| Requirement | Scenario | Verified by |
|---|---|---|
| Sync reconciles built code into the delta specs | Behavior built after drafting is captured before promotion | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Every change carries a reports folder | Draft scaffolds the reports folder | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Build produces per-discipline test reports | Build records evidence of testing | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Build produces per-discipline test reports | A full-stack change ships backend, frontend, and api reports | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Build produces per-discipline test reports | A discipline beyond the common set gets its own named report | Unchanged from canonical; full suite `npm test` 984/984 pass |
| API changes carry an API discipline report | An endpoint change requires an api report | Unchanged from canonical; full suite `npm test` 984/984 pass |
| API changes carry an API discipline report | A backend report does not substitute for the api report | Unchanged from canonical; full suite `npm test` 984/984 pass |
| API changes carry an API discipline report | A change with no API surface may omit the api report | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Discipline reports follow a required structure | A discipline report carries the required sections | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Discipline reports follow a required structure | Pre-existing failures are declared honestly | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Discipline reports follow a required structure | Every delta-spec scenario is accounted for | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Verification never mutates real data without authorization | Verification is isolated from real data by default | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Verification never mutates real data without authorization | A real-data write is gated on explicit authorization | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Verification never mutates real data without authorization | Raw store commands are not run against a live store unprompted | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Verification never mutates real data without authorization | The report records how verification stayed safe | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Archive is blocked until the change is complete | Unchecked task blocks archive | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Archive is blocked until the change is complete | Missing reports block archive | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Archive is blocked until the change is complete | The reports README scaffold alone does not satisfy the gate | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Archive is blocked until the change is complete | Unsynced specs block archive | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Archive is blocked until the change is complete | A complete change archives | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Archive is blocked by direct requirement-coverage defects | Archiving blocked by uncovered requirement | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Archive is blocked by direct requirement-coverage defects | Legacy change without identifiers is not blocked | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Archive is blocked by direct requirement-coverage defects | Transitive defects do not block archiving | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Archive is blocked by direct requirement-coverage defects | Coverage gate can be disabled | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Archive reconciles drift before it can pass the gate | Drift must be reconciled and synced before archive | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Explore locates through Compass before indexing or reading code | Standalone draft refreshes the index before locating code | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Explore locates through Compass before indexing or reading code | Explore starts with compass_find, not compass_index | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Explore locates through Compass before indexing or reading code | Reading code requires a named fallback | Unchanged from canonical; full suite `npm test` 984/984 pass |
| A complete explorer brief is the planner code map | Dispatch carries the brief | Unchanged from canonical; full suite `npm test` 984/984 pass |
| A complete explorer brief is the planner code map | A complete brief is not re-investigated | Unchanged from canonical; full suite `npm test` 984/984 pass |
| A complete explorer brief is the planner code map | The brief reports how many Compass calls were made | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Draft reuses existing capabilities by exact name | A change to existing behavior reuses the canonical capability name | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Draft reuses existing capabilities by exact name | A genuinely new capability is introduced deliberately | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Draft grounds a capability delta in the current canonical spec | Updating a capability preserves its existing requirements | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Validate warns about capability divergence | Near-duplicate capability name raises a warning | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Validate warns about capability divergence | Dropping a canonical requirement raises a warning | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Validate warns about capability divergence | An exact-name delta that keeps all requirements raises no such warning | Unchanged from canonical; full suite `npm test` 984/984 pass |
| EARS pattern validation `req~ears-validate~1` | Unstructured requirement fails under strict | Unchanged from canonical; full suite `npm test` 984/984 pass |
| EARS pattern validation `req~ears-validate~1` | Lenient projects warn instead of fail | Unchanged from canonical; full suite `npm test` 984/984 pass |
| EARS pattern validation `req~ears-validate~1` | No automatic file rewrite | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Property coverage participates in validate and archive `req~ptest-archive-gate~1` | Missing ptest blocks archive | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Sync and archive report created versus updated capabilities | A new capability is reported as created | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Sync and archive report created versus updated capabilities | An existing capability is reported as updated | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Archive seals structural code anchors | Archive writes anchor JSON for a resolvable symbol | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Archive seals structural code anchors | Archive proceeds with a warning when nothing resolves | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Ceremony level is proposed from graph signals | Small single-module change proposes level 0 | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Ceremony level is proposed from graph signals | Public or global touch is never proposed as level 0 | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Ceremony level is proposed from graph signals | Docs-only targets short-circuit to level 0 | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Ceremony level is proposed from graph signals | Missing index does not assume level 0 | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Confirmed ceremony level is persisted | Missing change.json means full ceremony | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Confirmed ceremony level is persisted | Downgrade requires a reason | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Confirmed ceremony level is persisted | Promotion keeps record.md | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Artifact gates follow the confirmed level | Level 0 validates without proposal or deltas | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Artifact gates follow the confirmed level | Level 0 without reports cannot archive | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Artifact gates follow the confirmed level | Level 3 still needs design | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Artifact gates follow the confirmed level | Scope growth blocks validate | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Published laws describe level-based ceremony | Laws mention ceremony levels | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Bugfix change type | Bug draft produces the bugfix artifact | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Bugfix change type | Bug change validates without a proposal | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Bugfix change type | A level 2 bug still requires a design | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Feature draft scaffold `req~feature-draft~1` | Level-2 feature draft writes the stubs the level requires | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Feature draft scaffold `req~feature-draft~1` | A fresh draft validates at every level | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Feature draft scaffold `req~feature-draft~1` | A placeholder delta cannot be synced silently | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Feature draft scaffold `req~feature-draft~1` | Quick and bug drafts keep accepting their existing names | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Feature draft scaffold `req~feature-draft~1` | The delta starts from an existing capability spec | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Feature draft scaffold `req~feature-draft~1` | Draft without a level leaves the level unconfirmed | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Feature draft scaffold `req~feature-draft~1` | An existing change directory is refused | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Bug artifact gates follow level and type | Level 0 bug validates without proposal or deltas | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Bug artifact gates follow level and type | Missing delta when prevention requires a spec change blocks validate | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Mandatory reproduction and regression test | Missing regression test blocks archive | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Mandatory reproduction and regression test | Unreproducible bug requires an explicit marker | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Mandatory reproduction and regression test | Mitigated resolution is recorded distinctly | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Mandatory reproduction and regression test | Not-a-bug resolution still requires prevention | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Deterministic bug investigation | Stack frames outrank graph neighbours | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Deterministic bug investigation | External frames are not ranked as suspects | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Deterministic bug investigation | Unsupported language is refused explicitly | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Deterministic bug investigation | Missing index returns no suspects | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Deterministic bug investigation | Unavailable signals degrade without failing | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Prevention closes the loop | Proposed law is emitted ready to adopt | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Prevention closes the loop | Explicitly declining prevention is accepted | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Prevention closes the loop | A recurring root cause is surfaced | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Published laws describe bug change type | Laws mention bugfix workflow | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Default change loop is multi-agent | Coordinator does not implement | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Harness state is durable and deterministic | Illegal advance is rejected | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Harness state is durable and deterministic | Start initializes exploring | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Harness state is durable and deterministic | Repeated --question flags each become one open question | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Compass call log `req~compass-call-log~1` | An explore call is recorded | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Compass call log `req~compass-call-log~1` | Index calls are logged but are not evidence | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Compass call log `req~compass-call-log~1` | The log rotates at its size cap | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Compass call log `req~compass-call-log~1` | Rotation does not hide current-stage evidence | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Compass call log `req~compass-call-log~1` | A write failure never fails the tool | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Compass evidence gate on Cortex advance `req~compass-evidence-gate~1` | Strict mode blocks an explore stage with no Compass calls | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Compass evidence gate on Cortex advance `req~compass-evidence-gate~1` | Warn mode advances with a warning | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Compass evidence gate on Cortex advance `req~compass-evidence-gate~1` | Evidence since stage start satisfies the gate | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Compass evidence gate on Cortex advance `req~compass-evidence-gate~1` | Calls before the stage started do not count | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Compass evidence gate on Cortex advance `req~compass-evidence-gate~1` | Off mode and ungated stages skip the check | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Cortex ships as an MCP module | Brief maps implementing to implementer | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Archive requires harness verdicts | Archive blocked without test PASS | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Archive requires harness verdicts | Level 1+ needs review PASS | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Archive completes the harness `req~harness-archive-completes~1` | Archive moves the harness to done | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Archive completes the harness `req~harness-archive-completes~1` | An archived change is readable through Cortex | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Archive completes the harness `req~harness-archive-completes~1` | Mutating ops on an archived change are rejected | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Archive completes the harness `req~harness-archive-completes~1` | The newest archive wins | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Archive completes the harness `req~harness-archive-completes~1` | A change without a harness is blocked and gets no harness | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Archive completes the harness `req~harness-archive-completes~1` | A failed move restores the harness | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Archive completes the harness `req~harness-archive-completes~1` | The shipped workflow does not advance after archive | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Role agents ship with the workflow | Scaffold without packs still installs role agents | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Role agents ship with the workflow | Role agents list canonical tools only | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Role agents ship with the workflow | Shipped workflow texts name no alias tool | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Domain agent pack is removed | Empty catalog skips pack prompt | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Build hands off before final gates | Build step chain ends at implement hand-off | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Cortex skill coordinates the loop | Cortex dispatcher stays thin | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Cortex skill coordinates the loop | One question round covers explorer, planner, and level | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Cortex skill coordinates the loop | Explorer dispatch names symbols, not files | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Cortex status summary `req~cortex-status-summary~1` | Status returns the summary for a running change | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Cortex status summary `req~cortex-status-summary~1` | Level 0 owes only the test verdict and counts record.md | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Cortex status summary `req~cortex-status-summary~1` | Questions stage says the human owes answers | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Cortex status summary `req~cortex-status-summary~1` | A long history keeps the summary on the MCP path | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Cortex status summary `req~cortex-status-summary~1` | No harness gives a null summary | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Cortex status summary `req~cortex-status-summary~1` | CLI prints the line on stderr unless --json | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Status update interval is configurable `req~cortex-status-interval~1` | Absent key defaults to 5 | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Status update interval is configurable `req~cortex-status-interval~1` | Configured value is reported | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Status update interval is configurable `req~cortex-status-interval~1` | Zero disables updates | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Status update interval is configurable `req~cortex-status-interval~1` | Invalid values fall back to 5 | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Status update interval is configurable `req~cortex-status-interval~1` | Values above 60 are capped at 60 | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Coordinator posts status updates during a run `req~cortex-status-updates~1` | The load step sets up the timer from the summary | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Coordinator posts status updates during a run `req~cortex-status-updates~1` | The dispatch loop posts updates in the session language | Unchanged from canonical; full suite `npm test` 984/984 pass |
| Coordinator posts status updates during a run `req~cortex-status-updates~1` | Completion deletes the timer | Unchanged from canonical; full suite `npm test` 984/984 pass |
