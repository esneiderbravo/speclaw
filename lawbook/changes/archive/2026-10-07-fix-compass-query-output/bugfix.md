# Bugfix: fix-compass-query-output

**Level:** 3 · **Type:** bug · **Severity:** normal · **Ships:** 2.0.13

Seven defects in one change (human decision). Entries 1–4 are Compass query
output; entries 5–7 are the lawbook/Cortex scaffolding that let this very change
start at a self-confirmed level 0. Every section below is numbered by defect.

## 1. Observed symptom

1. **`compass_find` returns broken, over-long output.** A `compass_find` call
   with `maxTokens: 1500` (or any value, up to 32000) returns pretty-printed
   JSON cut mid-string and ending in
   `… [truncated — use mode:"full" or narrow includes]`. The text is no longer
   valid JSON. `compass_find` has no `mode: "full"`, so the hint is wrong. The
   reported `tokens` counts only `rendered`, and each hit repeats `nodeId`,
   `signature`, and ranking `signals` that `rendered` already shows. A larger
   `maxTokens` still gets cut at about 1500 tokens. `compass_explore` and
   `compass_diff_context` with `mode: "full"` are cut at the same brief ceiling,
   and their hint tells the caller to use `mode:"full"`, which it already did.
   (Seen during this planning session: `compass_explore handleHarness` with
   `mode: "full"` came back truncated.)
2. **Worktree focus includes files that are not indexed.** In a git repository
   with tracked, modified non-code files (for example
   `lawbook/changes/<x>/bugfix.md` or `notes.md`), a `compass_find` with no
   `focus` reports those paths in `focus`. Because focus is non-empty, the
   default budget and the PageRank personalization switch to the focused
   variant even when no focus path is in the graph. An explicit `focus` naming
   an unindexed path behaves the same.
3. **Exact find never says "not found".** `compass_find` with
   `mode: "exact"` and a name no symbol has (for example `RequestDetailScreen`
   in a project that defines only `RequestDetail`) returns a non-empty list of
   fuzzy vector neighbours instead of reporting that the name does not exist.
   A multi-identifier exact query (`alpha beta`) is ANDed by the full-text
   stage, so it can miss both symbols.
4. **Types have no callers.** `compass_explore` on an interface or type alias
   (for example `Props`) that is used as a parameter type, as a variable
   annotation, or in an `extends`/`implements` clause reports `callers: []`.
   Agents conclude the type is unused.
5. **A bug draft confirms its own level.** `speclaw lawbook draft --bug <name>`
   (and `lawbook_change` action `draft` with `bug: true`) with no `--level`
   writes `change.json` with `confirmedLevel: 0` and `confirmedBy: "human"`,
   although no human confirmed anything. This change was scaffolded that way.
6. **Cortex `advance` skips planning and drops questions.** With that
   self-confirmed level 0, `cortex advance` moved the harness from `exploring`
   straight to `implementing`. The level stored in `harness.json` at `start`
   never follows a later `level set`. `advance` with `pauseForQuestions: true`
   and `openQuestions` from `implementing` moved the harness to `testing` and
   discarded the questions instead of pausing in `questions`.
7. **Stored proposal signals are all zero.** After
   `lawbook_change` action `level` mode `promote` without `paths`, this
   change's `change.json` carries `score: 0`, all-zero `signals`, and a
   `level 0` rationale next to a promotion whose reason cites a measured score
   of 23.

## 2. Minimal reproduction

All steps run in a throwaway directory (`mkdtemp`), never in this repository's
index or `harness.json`.

1. Index a fixture with at least 40 functions. Call `compass_find` through MCP
   with `query: "function"`, `mode: "concept"`, `maxTokens: 8000`. The text
   ends in `[truncated — use mode:"full" …]`, `JSON.parse` fails, and the text
   is about 1500 tokens. With a function whose source is 200 lines, call
   `compass_explore` with `mode: "full"`. The text is cut at about 1500 tokens
   with the same hint.
2. In a git fixture, index `src/a.ts`, then modify it and a committed, tracked
   `notes.md`. Call `compass_find` with no `focus`. `focus` is
   `["notes.md", "src/a.ts"]`. Call it with `focus: ["notes.md"]` only.
   `focus` is `["notes.md"]` and `budget` is the focused default (4000), not
   the no-focus default.
3. Index a fixture that defines `RequestDetail`, `alpha`, and `beta`. Call
   `compass_find` with `mode: "exact"`, `query: "RequestDetailScreen"`. The
   hits are non-empty and none is named `RequestDetailScreen`. Call it with
   `query: "alpha beta"`. At least one of `alpha` and `beta` is missing.
4. Index `src/types.ts` (`export interface Props { id: string }`) and
   `src/view.ts` (`import type { Props } from "./types.js"; export function
   render(p: Props) { return p.id; } export class Widget implements Props { id
   = "w"; }`). Call `compass_explore` for `Props`. `callers` is empty.
5. In an initialised lawbook workspace, run `speclaw lawbook draft --bug
   dup-charge`. `change.json` holds `confirmedLevel: 0`, `confirmedBy:
   "human"`.
6. In the same workspace, run `speclaw cortex start --change dup-charge`, then
   `speclaw cortex advance --change dup-charge`. The stage is `implementing`.
   Then run `speclaw cortex advance --change dup-charge --pause-questions
   --question q1`. The stage is `testing` (level 0) and `openQuestions` is
   `[]`.
7. Run `speclaw lawbook draft --bug dup-charge-2`, then `lawbook_change` action
   `level` mode `set` with `paths` naming three source files and level 2, then
   mode `set` again with level 2 and no `paths`. The stored `score` and
   `signals` drop to zero. The first draft alone already stored a zero
   proposal with `level: 0` and no degradation marker.

## 3. Root cause

1. **RC1 — find serialises everything, then the generic text cap cuts it.**
   The `compass_find` handler (`src/modules/compass/register.ts:81-88`)
   pretty-prints the whole `HybridSearchResult` from `findSymbols`
   (`src/modules/compass/explore-rich.ts:173`) and passes it to `text()`
   (`src/shared/mcp.ts:15`) with the default `brief` mode. `applyTextBudget`
   (`src/shared/output-budget.ts:26`) cuts any text above 1500 tokens and
   appends a hint written for explore. `maxTokens` only reaches
   `fitToBudget` (`src/modules/compass/budget.ts:89`), which counts `rendered`
   alone. The `compass_explore` (`register.ts:66`) and `compass_diff_context`
   (`register.ts:109`) handlers format for their `mode` but call `text()`
   without it, so `mode: "full"` is cut at the brief ceiling. The aliases
   `compass_search`/`compass_recall` (`register.ts:144,156`) share RC1.
2. **RC2 — focus is not checked against the index.** `resolveFocus`
   (`src/modules/compass/hybrid.ts:75`) returns explicit focus as given and
   otherwise every path from `worktreeChangedFiles`
   (`src/shared/git.ts:98`). Nothing filters to the `files` table, and
   `defaultBudget(hasFocus)` (`budget.ts:145`) and the personalization read the
   unfiltered list. `worktreeChangedFiles` is also used by
   `listWorktreeChanges` (`src/modules/compass/diff-context.ts:36`), so the
   filter belongs in the focus resolver, not in `git.ts`.
3. **RC3 — exact mode only changes weights.** `mode: "exact"` sets the symbol
   route weights in `hybridSearch` (`hybrid.ts:88`); the vector KNN list is
   always fused, and the name list is `name LIKE %q%`. Nothing decides "no
   symbol has this name". `escapeFtsQuery` (`src/modules/compass/rank.ts:110`)
   ANDs the terms. The canonical `req~compass-mcp-surface~1` says mode "SHALL
   only adjust fusion weights", so the defect is in the spec as well.
4. **RC4 — no edge kind for type references.** `ExtractedRef.kind` is
   `"call" | "import"` (`src/modules/compass/extract.ts:39`); the emission
   (~`extract.ts:486-520`) never records type annotations or heritage clauses.
   `assembleExplore` (`src/modules/compass/query.ts:262`) reads callers with
   `kind = 'call'` only.
5. **RC5 — the bug scaffold always passes a level.** `scaffoldBugfix`
   (`src/modules/lawbook/bugfix.ts:184-216`) gives `scaffoldChange` a level
   function `opts.level ?? (proposal.level <= 1 ? proposal.level : 1)`, which
   is never `undefined`. `scaffoldChange`
   (`src/modules/lawbook/scaffold-change.ts:76-134`) then calls
   `setCeremonyLevel` with `confirmedBy: "human"`. With no targets the
   proposal is level 0 (RC7), so the draft self-confirms level 0.
6. **RC6 — the harness freezes the level and ignores misplaced pauses.**
   `handleHarness` (`src/modules/cortex/harness.ts:192`) reads
   `readConfirmedLevel` (`harness.ts:93`) once at `start` and stores it in
   `state.level`; `allowedAdvance` (`harness.ts:130`) and `nextAfterExplore`
   (`harness.ts:119`) route by that stored value, so a level 0 from RC5 skips
   `planning` and a later `level set` never takes effect. The pause branch
   (`harness.ts:248`) only runs when the stage is `planning`; from any other
   stage `pauseForQuestions` and `openQuestions` are silently ignored and the
   normal advance runs.
7. **RC7 — an empty target set is scored as a measured level 0, and `set`
   overwrites the stored proposal.** `gatherSignals`
   (`src/modules/lawbook/levels.ts:330`) returns all-zero signals with no
   degradation marker when `paths` and `symbols` are both empty, and
   `proposeLevel` (`levels.ts:276`) turns that into `level: 0, score: 0`, the
   "small level from ignorance" the canonical ceremony requirement forbids.
   `handleLevel` (`src/modules/lawbook/quick.ts:67`) recomputes the proposal
   from the call's (possibly empty) targets for every mode, and
   `setCeremonyLevel` (`levels.ts:494`) spreads that fresh proposal over the
   stored one. `promoteCeremonyLevel` (`levels.ts:523`) does not recompute: it
   keeps the previous record, so in this change the zeros it kept came from the
   target-less bug scaffold. The coordinator's report that promote recomputes
   zero signals is corrected here: promote preserves whatever was stored, and
   the stored value was already the empty-target zero proposal.

## 4. Blast radius

From the explorer brief (Compass) and the planner's Compass reads of entries
5–7.

- **RC1:** `text()` has ~32 call sites; its default stays `brief`, so only the
  four handlers that opt in change (`compass_find`, `compass_search`,
  `compass_recall`, `compass_explore`, `compass_diff_context`). The CLI
  (`src/cli/commands/query.ts` `runQuery`, `speclaw search|recall`, `--json`)
  uses `hybridSearch` directly and keeps `HybridSearchResult` unchanged; the
  sealed anchor `explain-output-includes-ranking-signals`
  (`lawbook/anchors/cli.json`) stays valid. Tests:
  `test/integration/compass.test.ts:445-452`,
  `test/integration/retrieval.test.ts:65`,
  `test/unit/{budget-fit,rank,fts,output-budget,index-files}.test.ts`,
  `test/contract/registers.test.ts` (canonical surface and schema size;
  `compass_find`'s input schema does not change).
- **RC2:** `resolveFocus` callers in `hybrid.ts`; the CLI `search` focus values
  change (unindexed paths drop out), the shape does not. `diff-context.ts` is
  untouched.
- **RC3:** `findSymbols` and `hybridSearch` (an internal option only); concept
  mode and the CLI are unchanged.
- **RC4:** `extract.ts`, edge resolution (`resolveEdges`, full and per-file
  reindex), `assembleExplore`, `SCHEMA_VERSION` (`src/modules/compass/db.ts:278`)
  and the migration chain. Every `kind = 'call'` filter (`hybrid.ts`,
  `map.ts:36`, `visualize.ts:70`, `indexer.ts:321,368,1542`, `query.ts:913`,
  `hotspots.ts`) and `impact`'s default `call`+`import` (`query.ts:563`) stay
  as they are. Any `edges` query without a kind filter would start seeing
  `ref` rows and must be pinned. `explore()` is also called by
  `lawbook/investigate.ts:110,241` and `lawbook/levels.ts:342`; refs are opt-in
  so their scores do not move. Edge totals in index stats grow. The literal
  `"11"` appears in `CLAUDE.md`, `AGENTS.md`, `docs/compass.md`,
  `src/modules/foundation/assets/docs/compass.template.md`,
  `src/cli/commands/update.ts`, the code-graph spec, and the tests
  `test/integration/{compass,db,hotspots,affected-tests,git-history-cache}.test.ts`
  and `test/unit/{metrics,fts,embedding-cache,drift}.test.ts`. Schema 12
  forces one reindex (embeddings reused); speclaw 2.0.12 or older opening a
  schema-12 index rebuilds it from scratch.
- **RC5:** `scaffoldBugfix` callers `runSpec` (`src/cli/commands/lawbook.ts:140`)
  and `handleLawbookChange` (`src/modules/lawbook/change-tool.ts:95`); tests
  `test/integration/bugfix-flow.test.ts`, `test/unit/bugfix.test.ts:52,83`,
  `test/unit/feature-draft.test.ts:151,227`. An unconfirmed bug draft
  validates under level-3 rules (needs `design.md`) until a level is set.
- **RC6:** `handleHarness` callers `runCortex` (CLI), the `cortex` MCP tool, and
  the deprecated `lawbook_change` action `harness` alias; `buildStatusSummary`
  reads `state.level` for `pendingVerdicts`. Tests `test/unit/harness.test.ts`,
  `test/integration/cortex-questions-cli.test.ts`.
- **RC7:** `gatherSignals`/`proposeLevel` callers: `handleLevel`,
  `scaffoldChange` (quick, bug, feature drafts). Draft records with no targets
  now store `level: null` plus `degraded: ["no-targets"]`. Tests
  `test/unit/levels.test.ts`, `test/unit/feature-draft.test.ts`.

## 5. Proposed fix

Full design in `design.md`. In short:

1. **MCP find formatter + truthful text budget.** A new MCP-only formatter
   turns the `findSymbols` result into `{ rendered, hits: [{name, kind, file,
   line}], tokens, budget, focus, … }`. The whole serialised response is capped
   at `maxTokens` (default: the brief ceiling, 1500); hits and `rendered` are
   trimmed to fit; `tokens` counts the emitted text; `truncated: true` appears
   only when the formatter trimmed. `text()` gains an opt-in budget argument
   (`OutputMode | { maxTokens }`), default unchanged. `compass_explore` and
   `compass_diff_context` pass their `mode`; a full-mode truncation hint never
   suggests `mode:"full"`. The aliases use the same formatter.
2. **Indexed focus only.** A focus resolver filters explicit and git-derived
   focus to paths in the `files` table, reports dropped paths in
   `focusIgnored`, and feeds the filtered list to the budget, route, and
   personalization (empty → no-focus defaults).
3. **Exact not-found.** In exact mode `findSymbols` splits the query into
   identifier `terms` (OR), restricts hits to symbols whose name equals a term,
   and when none exists returns `found: false`, `hits: []`, `rendered: ""`,
   and up to five `nearest`.
4. **`ref` edges, schema 12.** The extractor emits de-duplicated `ref` edges
   for TS/JS type annotations and `extends`/`implements` clauses, resolved by
   id → import binding → same-file name only. `compass_explore` (and its CLI
   twin) lists them among callers with `via: "ref"` (calls `via: "call"`);
   nothing else reads them. Schema 11 → 12 migrates in place and forces one
   reindex.
5. **Unconfirmed bug drafts.** Without a supplied level the bug scaffold
   records the proposal and `changeType: "bug"` with no `confirmedLevel`,
   `confirmedBy`, or `confirmedAt`; `bugfix.md` says `Level: unconfirmed`.
6. **Harness guards.** `advance`/`rework` re-read the confirmed level from
   `change.json` (unconfirmed → 3) and store it before routing.
   `pauseForQuestions` from any stage other than `planning` is rejected with an
   error and `harness.json` stays byte-identical.
7. **No level from no targets; `set` keeps the stored proposal.** Empty
   targets yield `level: null` with `degraded: ["no-targets"]`. `set` and
   `promote` without targets keep the stored proposal fields; with targets they
   store the fresh measurement.

Discarded alternatives:
- **Raise `text()`'s default budget.** Changes ~32 call sites and the declared
  output budget. Rejected (human decision: opt-in only).
- **Change `HybridSearchResult` and the CLI `--json`.** Rejected (human
  decision: MCP only; CLI anchor stays sealed).
- **Filter focus inside `worktreeChangedFiles`.** Would also change
  `compass_diff_context`'s changed-file list. Rejected.
- **Count `ref` edges in impact, affected tests, PageRank, hotspots.** Rejected
  (human decision: refs only in explore callers).
- **Resolve refs by bare global name.** Generic type names (`Props`, `State`)
  would bind across unrelated files. Rejected.
- **Honor `pauseForQuestions` from every stage.** `questions` returns to
  `planning`, which would re-plan from `implementing` or later. Rejected; the
  shipped Cortex flow pauses from `planning` only, and an error is the honest
  answer elsewhere.

## 6. Regression test

Each test below is written **before** the fix and must fail on the current
code. The failing output goes to `reports/.red-before-fix.txt`.

| # | Test | Fails today because |
|---|------|---------------------|
| 1 | `test/contract/compass-find-output.test.ts::compass_find response fits maxTokens and stays valid JSON` (fixture with ≥40 functions; `maxTokens` 2000 and 8000: text parses as JSON, `estimateTokens(text) <= maxTokens`, no `[truncated`, `tokens === estimateTokens(text)`, every hit has exactly `name, kind, file, line`) | RC1: cut at ~1500 with the explore hint, invalid JSON, hits carry `nodeId`/`signature`/`signals` |
| 1 | `…::compass_find without maxTokens fits the brief ceiling` and `…::compass_search alias uses the same compact shape` | RC1 |
| 1 | `test/contract/registers.test.ts::compass_explore mode full is not cut at the brief ceiling` (source >1500 and <4500 tokens) and the same for `compass_diff_context` | RC1: `text()` called without `mode` |
| 1 | `test/unit/output-budget.test.ts::full-mode truncation hint does not suggest mode full` | RC1: one hint for every mode |
| 2 | `test/integration/retrieval.test.ts::worktree focus excludes unindexed files` (git fixture: modified `src/a.ts`, tracked, modified `notes.md`; `focus` is `["src/a.ts"]`, `focusIgnored` is `["notes.md"]`) and `…::explicit unindexed focus falls back to no-focus defaults` (`focus: ["notes.md"]` → `focus: []`, `budget` equals the no-focus default) | RC2 |
| 3 | `test/integration/retrieval.test.ts::exact find for a missing name reports not found with nearest` (`RequestDetailScreen` → `found: false`, `hits: []`, `rendered: ""`, `nearest[0].name === "RequestDetail"`, ≤5 entries) and `…::multi-term exact query ORs identifiers` (`alpha beta` → both, `terms: ["alpha","beta"]`) | RC3 |
| 4 | `test/integration/compass.test.ts::explore lists type references as callers via ref` (Props fixture: `render` and `Widget` with `via: "ref"`; a call caller has `via: "call"`; a file that names `Props` without importing it is absent; `impact` for `Props` is unchanged) | RC4 |
| 4 | `test/integration/db.test.ts::schema 11 migrates to 12 and keeps embeddings` and `…::failed 11 to 12 migration rolls back` | RC4: schema is 11 |
| 5 | `test/unit/bugfix.test.ts::bug draft without a level is not self-confirmed` (`change.json` has `changeType: "bug"` and no `confirmedLevel`/`confirmedBy`/`confirmedAt`; validate applies level-3 bug rules) | RC5 |
| 6 | `test/unit/harness.test.ts::pauseForQuestions outside planning is rejected` (from `implementing` and `exploring`: throws naming `planning`; `harness.json` byte-identical) | RC6: silent advance |
| 6 | `test/unit/harness.test.ts::advance follows the level confirmed after start` (start at confirmed 0, then `change.json` set to 2; `advance` from `exploring` → `planning`, `state.level` 2) | RC6: level frozen at start |
| 6 | `test/integration/cortex-questions-cli.test.ts::advance --pause-questions from implementing exits non-zero` | RC6 |
| 7 | `test/unit/levels.test.ts::empty targets propose no level` (`level: null`, `degraded` has `no-targets`) | RC7 |
| 7 | `test/unit/levels.test.ts::set without targets keeps the stored proposal` and `…::promote without targets keeps the stored proposal` | RC7: `set` overwrites with zeros |

Guards that must stay green with no edit:
- `test/unit/harness.test.ts`: the existing planning → questions pause and the
  illegal-advance cases.
- `test/integration/cortex-questions-cli.test.ts`: repeated `--question` from
  `planning`.
- `test/unit/feature-draft.test.ts`: feature drafts with and without a level.
- `test/integration/retrieval.test.ts`: the golden-set MRR gate (concept and
  exact-hit queries).
- `test/unit/output-budget.test.ts`: brief-mode behavior of `applyTextBudget`.

## 7. Prevention

The delta specs make each guarantee explicit and coverage-tracked (all
`Needs: impl, utest` or `itest`, `Status: approved`):

- `code-graph`: `req~compass-mcp-surface~1` amended (exact mode restricts hits;
  explore callers carry `via`); new `req~find-exact-not-found~1`,
  `req~type-ref-edges~1`, `req~schema-ref-edges~1`; "Task-relative ranking"
  amended (indexed focus, `focusIgnored`); "Schema records test and module
  metadata" and `req~schema-edge-membership~1` moved to schema 12.
- `context-budget`: "Output token budget on tool responses" amended (`mode`
  honored, truthful hint, opt-in `text()` budget); new
  `req~find-response-budget~1`.
- `lawbook-workflow`: "Ceremony level is proposed from graph signals" amended
  (no targets → no level); new `req~bug-draft-unconfirmed~1`,
  `req~level-proposal-preserved~1`, `req~harness-pause-questions~1`,
  `req~harness-level-current~1`; the `req~feature-draft~1` scenario that froze
  the bug draft output is narrowed.

New law: none. These are output-contract and control-flow defects. A
path/deps/graph law cannot express "the serialised MCP response fits
`maxTokens`" or "a scaffold never writes `confirmedBy: human`", so the spec
scenarios and their regression tests carry the prevention.
