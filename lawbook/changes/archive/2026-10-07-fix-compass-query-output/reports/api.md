# API checks — fix-compass-query-output (2026-10-07)

**Discipline:** api (MCP tool contracts) · **Change:** fix-compass-query-output
(bug, level 3) · **Date:** 2026-10-07 · **Branch:** fix/compass-query-output
(uncommitted working tree vs `main`) · **cwd:** gates in
`/Users/esneiderbravo/Projects/speclaw`; manual MCP sessions against `mkdtemp`
fixtures under `/tmp` (see "Isolation").

## Gates & results

| Check | Command | Result |
|---|---|---|
| Lint + format | `npm run check` | ✅ exit 0. "All matched files use Prettier code style!" ESLint reported 0 problems. |
| Type-check + compile | `npm run build` | ✅ exit 0. `tsc` strict, then "copy-assets: copied assets for 3 module(s)". |
| Tests + coverage | `npm test` (pretest: `tsc -p tsconfig.test.json`) | ✅ exit 0. **984 tests, 984 pass, 0 fail, 0 cancelled, 0 skipped**, 58.5 s. Coverage over all files: **88.35 % lines, 85.74 % branches, 90.57 % functions** (floor 80). `find-output.js` 100 / 93.85 / 100; `output-budget.js` 100 / 100 / 100; `mcp.js` 94.87 / 68.75 / 100; compass `register.js` 81.40 / 91.30 / 53.33. |
| Change validation | `node dist/cli/index.js lawbook validate fix-compass-query-output` | ✅ exit 0. "fix-compass-query-output is valid (3 delta spec(s))", with 107 advisory warnings: EARS style, plus one "delta drops … Task-relative ranking". That one is a false positive: the heading now carries `req~task-relative-ranking~1`, and sync copies the whole file (see `review.md`). |
| Requirement coverage | `node dist/cli/index.js coverage --change fix-compass-query-output --json`, run on an **isolated copy** of the working tree indexed with the branch CLI | ✅ exit 0. 29 identified, **29 shallow and 29 deep covered, 0 direct defects**, 0 transitive. Every new id is fully covered: `find-response-budget`, `find-exact-not-found`, `type-ref-edges`, `schema-ref-edges`, `schema-edge-membership`, `task-relative-ranking`, `compass-mcp-surface`, `bug-draft-unconfirmed`, `level-proposal-preserved`, `harness-pause-questions`, `harness-level-current`, `feature-draft`. In the real repository the same command gave 0 links, because the repo index is empty (see "Pre-existing"). |
| Law verification + lock integrity | `node dist/cli/index.js verify`, run on the isolated copy. Its `speclaw.lock`, `CLAUDE.md`, and `AGENTS.md` are byte-identical to the repo's. | ⚠️ exit 1. "1 passed · 12 failed · 0 skipped · 2 unknown". The 12 failures are all `drift~changed-semantic` on sealed anchors whose bodies this change edits on purpose (`explore` ×7, `text` ×1, `handleHarness` ×4; see `backend.md`). `integrity~advisory-mismatch~1` on `docs/compass.md` is the expected advisory. There is **no strict-path finding** for `CLAUDE.md`/`AGENTS.md` (re-accepted by the human). A `main` snapshot run the same way gives "1 passed · 0 failed · 2 unknown". The 2 unknowns are identical on both. |

## Contract under test

Transport: MCP over stdio (`node dist/cli/index.js mcp`), JSON-RPC
`tools/call`. There is no HTTP method, path, or status code. A response is
`content[0].text` with `isError` false or true. **Auth:** none. The server is
local and per process, and every tool takes `projectPath`. No permission model
changed. **Ordering:** `hits` keep ranking order; trimming always removes from
the end.

| Tool | Input (unchanged schemas) | Response contract after this change |
|---|---|---|
| `compass_find` | `projectPath, query, mode: exact\|concept, limit?, focus?, maxTokens? (256–32000)` | Compact JSON, no indentation: `{mode, found?, terms?, rendered, hits:[{name,kind,file,line}], nearest?, focus, focusIgnored?, degraded?, termsTotal?, focusTotal?, focusIgnoredTotal?, tokens, budget, truncated?}`. The cap is `maxTokens ?? 1500` and covers the **whole emitted text**. The text always parses as JSON, never ends in the generic `[truncated …]` suffix, and `tokens === estimateTokens(text)`. There is no `nodeId`, `signature`, `signals`, or `route`. `truncated: true` appears only when content was removed to fit the cap, **either by the search fit (`result.capped`) or by the formatter** (F2: kept on purpose and documented). Trim order: `focusIgnored` → `focus` → `terms` (longest fitting prefix; the matching `…Total` holds the original length) → hits with their rendered blocks → the last `rendered` → `nearest` → as a last resort, the last hit. Exact mode: `terms` is always present; a match gives `found: true`; no match gives `found: false`, `hits: []`, `rendered: ""`, and `nearest` (≤5). |
| `compass_search` (deprecated alias of exact) / `compass_recall` (deprecated alias of concept) | `projectPath, query, limit?` | Same shape and cap as `compass_find`. The deprecation prefix counts toward the cap and toward `tokens`. |
| `compass_explore` | unchanged | Each entry in `callers` carries `via: "call"\|"ref"` (one entry per caller; `call` wins). `mode: "full"` is passed to `text()`, so the emitted text uses the 4500 ceiling, not 1500. |
| `compass_diff_context` | unchanged | `mode: "full"` is passed to `text()` (4500 ceiling). |
| `cortex` `advance`/`rework` | unchanged | They re-read the confirmed level from `change.json` (unconfirmed → 3) and store it in `state.level`. `pauseForQuestions` outside `planning` gives `isError: true`, text `pauseForQuestions is only valid from stage planning (current: <stage>)`, and no write. |
| `lawbook_change` `draft` (`bug: true`, no `level`) | unchanged | `change.json` holds the proposal and `changeType: "bug"`, with no `confirmedLevel`/`confirmedBy`/`confirmedAt`. An empty target set gives `level: null` and `degraded: ["no-targets"]`. |
| `lawbook_change` `level` `set`/`promote` | unchanged | With no targets, the stored proposal is kept (`level`, `score`, `signals`, `rationale`, `degraded`). With targets, a fresh measurement replaces it. `promote` on an unconfirmed change gives `isError: true`, "no confirmed level to promote — use mode 'set'", and `change.json` stays byte-identical. |

## Manual verification (stdio MCP session, built `dist/`)

Fixture `/tmp/fcq-fixture.*`: a git repo with 46 TS files, including
`src/types.ts` (`interface Props`), `src/view.ts` (`render(p: Props)`,
`class Widget implements Props`, `function wrap<Props>(x: Props)`), and
`src/other.ts` (its own local `interface Props`). It also has
`src/request.ts` (`RequestDetail`, `alpha`, `beta`), 40 modules with 2
functions each, and `src/big.ts` (a 224-line function). The fixture was indexed
with the branch CLI, then 31 indexed files were modified, and 30 untracked
`notes/*.txt` files plus an untracked `notes.md` were added. Results (`est` =
`ceil(chars/4)`):

| Call | Observed |
|---|---|
| `compass_find` concept, default cap | 1471 est ≤ 1500, valid JSON, no suffix, `tokens` 1471 exact, hit keys `name,kind,file,line`, 41 hits, `truncated: true`, `focus: []` with `focusTotal: 31` |
| `compass_find` concept, `maxTokens: 256` | 237 ≤ 256, valid JSON, `tokens` exact, 6 hits, `truncated: true`, `focusTotal: 31` |
| `compass_find` concept, `maxTokens: 1500` / `8000` | 1471 ≤ 1500, and 1890 ≤ 8000 with all 31 focus paths kept and no `truncated` |
| `compass_find` `focus: ["notes.md"]` | `focus: []`, `focusIgnored: []` + `focusIgnoredTotal: 1` (the list was trimmed first to fit 1500; see O1) |
| `compass_find` exact `RequestDetailScreen` | `found: false`, `hits: []`, `terms: ["RequestDetailScreen"]`, `nearest[0] = RequestDetail (src/request.ts:1)`, 5 entries |
| `compass_find` exact `RequestDetail` / `alpha beta` | `found: true`, 1 hit with no `nearest` / `found: true`, 2 hits, `terms: ["alpha","beta"]` |
| `compass_find` exact, 60 identifiers, `maxTokens: 256` | 225 ≤ 256, valid JSON, `terms: []` + `termsTotal: 60`, `focusTotal: 31`, 5 hits, `truncated: true` |
| `compass_search` / `compass_recall` | same compact shape, `tokens` exact, within 1500. `compass_search` runs exact mode, so prose gives `found: false` + `nearest` (it was already exact on `main`). |
| `compass_explore src/types.ts` | resolves to `Props`, `callers: [render (src/view.ts:3) via "ref", Widget (src/view.ts:7) via "ref"]`; `otherUse` (local `Props`) is not listed |
| `compass_explore bigFunction` `mode: "full"` | 2369 est (> 1500, < 4500), no `[truncated` suffix. **But** `truncated: [{field: "symbol.source", omitted: 104, hint: "use mode:\"full\" or omit source from include"}]`; see finding **T2** |
| `compass_explore handleHarness` `mode: "full"` (the case observed in `bugfix.md` §1.1, on the isolated repo copy) | `symbol.source` omitted 52 of 172 lines, `hint: "use mode:\"full\" or omit source from include"`; see **T2** |
| `compass_find` default focus, minimal fixture (tracked `notes.md` modified, untracked `todo.md`) | `focus: ["src/a.ts"]`, `focusIgnored: ["notes.md"]`. The untracked `todo.md` is in neither list; see finding **T1** |
| `lawbook_change` draft `bug: true` (no level) | `{level: null, score: 0, degraded: ["no-targets"]}`, no `confirmed*` fields |
| `lawbook_change` level `set 2` + 3 paths → `set 2` without paths → `promote 3` without paths | stored `score 8, filesTouched 3` after the first call; proposal **kept** after both target-less calls (`confirmedLevel` 2 → 3) |
| `lawbook_change` level `promote` on an unconfirmed bug draft | `isError: true` "has no confirmed level to promote — use mode 'set'"; `change.json` byte-identical |
| `lawbook_change` level `propose`, no targets | `proposal.level: null` |
| `cortex` start on confirmed 0 → `level set 2` → `advance` | `stage: planning`, `level: 2` |
| `cortex` advance `pauseForQuestions` from `planning` | `stage: questions`, `openQuestions: ["Which ledger?", "Refund, or void?"]` |
| `cortex` advance `pauseForQuestions` from `implementing` | `isError: true` "pauseForQuestions is only valid from stage planning (current: implementing)"; `harness.json` byte-identical |
| `cortex` confirmed 0, advance from `exploring` | `implementing` (still skips planning) |

## Tests added / updated (contract-relevant)

All of them are green in the run above. "Red" means the failure is recorded in
`reports/.red-before-fix.txt` against unchanged `src/` (HEAD 5854270).

- `test/contract/compass-find-output.test.ts` (new): fits `maxTokens` 2000/8000
  with valid JSON; no-`maxTokens` fits 1500; `truncated` only when trimmed;
  `compass_search` shape; 256-token cap over a worktree with 30 modified + 30
  untracked files; 256-token cap with a 60-identifier exact query. Red quotes:
  > `✖ compass_find response fits maxTokens and stays valid JSON … AssertionError [ERR_ASSERTION]: maxTokens 2000`
  > `✖ compass_find without maxTokens fits the brief ceiling … SyntaxError: Unexpected token '…', ..."ignals":`
  > `✖ compass_search alias uses the same compact shape … SyntaxError: Bad control character in string literal in JSON at position 5948`
  > rework 1: `✖ compass_find fits a 256-token cap over a worktree with many changes … "src/features/billing-module-22/reques … [truncated — narrow includes or the query]"`
- `test/contract/registers.test.ts`: `compass_explore`/`compass_diff_context`
  `mode full is not cut at the brief ceiling`. Red:
  > `✖ compass_explore mode full is not cut at the brief ceiling … AssertionError [ERR_ASSERTION]: 1500`
- `test/unit/output-budget.test.ts`: full-mode hint, explicit cap, `text()`
  default. Red:
  > `✖ full-mode truncation hint does not suggest mode full … actual: false, expected: true`
- `test/unit/find-output.test.ts` (new, 9 cases): formatter trim order,
  prefixes, totals, last-resort drop. These are rework coverage; no red is
  recorded for them.
- Harness / CLI / levels / bugfix tests: see `backend.md` and `cli.md`.

## Spec-scenario coverage (contract scenarios)

| Spec | Scenario | Verified by |
|---|---|---|
| context-budget | Full mode is not cut at the brief ceiling | `registers.test.ts` ×2 ✅; manual: explore `bigFunction` full 2369 est, no `[truncated` suffix ✅. The source *field* is still capped at 120 lines (T2). |
| context-budget | A full-mode truncation hint is truthful | `output-budget.test.ts` ✅ for the `text()` suffix. **T2:** the `budgetExploreShape` field hint under `mode:"full"` still says `use mode:"full"` (manual). |
| context-budget | text() keeps its default | `output-budget.test.ts` "text() keeps its brief default…" ✅ |
| context-budget | The response fits maxTokens and stays valid JSON | contract fits-2000/8000 + 256 cases ✅; manual 256/1500/8000 ✅ |
| context-budget | Hits are compact | contract ✅; manual hit keys `name,kind,file,line` ✅ |
| context-budget | The default cap is the brief ceiling | contract "without maxTokens" ✅; manual `budget: 1500` ✅ |
| context-budget | Truncated is reported only when content was removed to fit the cap | contract "reports truncated only when it trimmed" + unit "a capped search result is reported truncated even when it fits" ✅; manual 8000 shows no `truncated` ✅ |
| context-budget | Context lists are trimmed to fit a small cap | contract 256 worktree/exact cases + unit trim cases ✅; manual `focusTotal 31`, `termsTotal 60` ✅ |
| context-budget | Aliases use the same shape | contract `compass_search` ✅; manual search + recall ✅ |
| context-budget | The CLI search output is unchanged | manual: `speclaw search --json` keys identical to 2.0.12 (see `cli.md`) ✅ |
| code-graph | Find always runs hybrid; exact mode also filters to exact names | `retrieval.test.ts` exact cases ✅; manual ✅ |
| code-graph | A missing name is reported with the nearest names | `retrieval.test.ts` ✅; manual `RequestDetailScreen` → `nearest[0] RequestDetail` ✅ |
| code-graph | An existing name is found without nearest | `retrieval.test.ts` ✅; manual ✅ |
| code-graph | Multi-term exact queries are an OR of identifiers | `retrieval.test.ts` ✅; manual `alpha beta` ✅ |
| code-graph | Concept mode keeps fuzzy results | `retrieval.test.ts` golden-set MRR gate (unchanged, green) ✅ |
| code-graph | Worktree focus excludes unindexed files | `retrieval.test.ts` ✅, but with a **tracked** `notes.md`. ❌ **T1:** the scenario says *untracked* `notes.md` → `focusIgnored ["notes.md"]`; manually an untracked file is absent. |
| code-graph | Explicit unindexed focus falls back to no-focus defaults | `retrieval.test.ts` ✅; manual `focus: []` ✅ (`focusIgnored` trimmed at the default cap, O1) |
| code-graph | Focus defaults to the working state (changed) | `retrieval.test.ts` worktree case ✅; manual `focus` = 31 indexed changed files at 8000 ✅ |
| code-graph | An interface lists its users as ref callers | `compass.test.ts` ✅; manual `via "ref"` ✅ |
| lawbook-workflow | A pause from implementing is rejected / A pause from exploring is rejected | `harness.test.ts` ✅; manual MCP + CLI, `harness.json` byte-identical ✅ |
| lawbook-workflow | A pause from planning records the questions | `harness.test.ts` "harness start/status/advance…" ✅; manual MCP ✅ |
| lawbook-workflow | A level set after start governs the next advance | `harness.test.ts` ✅; manual MCP → `planning`, level 2 ✅ |
| lawbook-workflow | Set / Promote without targets keeps the stored proposal; Targets replace the stored proposal with a measurement; Promote on an unconfirmed change is rejected | `levels.test.ts` ✅; manual MCP ✅ |
| lawbook-workflow | A bug draft without a level is unconfirmed | `bugfix.test.ts` ✅; manual MCP ✅ |

The other scenarios of the three delta specs are mapped in `backend.md`,
`database.md`, and `cli.md`. The 285 scenarios that did not change are listed
in the appendix of `backend.md`.

## Findings

- **T1 (MEDIUM, spec ≠ behaviour; doc fix).** Scenario "Worktree focus excludes
  unindexed files" (and `bugfix.md` §2 step 2, §6 row 2) says an **untracked**
  `notes.md` lands in `focusIgnored`. Worktree focus comes from
  `worktreeChangedFiles` (`git diff --name-only --diff-filter=ACMR HEAD`), which
  never lists untracked files. `design.md` §2 keeps `git.ts` unchanged on
  purpose. The test passes only because it commits `notes.md` first. Observed:
  tracked+modified `notes.md` → `focusIgnored ["notes.md"]`; untracked
  `todo.md` → absent. Red evidence confirms this: even on `main` the actual
  focus was `['notes.md','src/a.ts']` only because the file was tracked.
  Remedy: change the scenario wording to "tracked, modified `notes.md`" and add
  "untracked files are not part of worktree focus", and correct `bugfix.md`
  §2/§6 to match. Alternatively, include untracked files, which is a design
  change. No code change is needed for the wording fix.
- **T2 (MEDIUM, the symptom in `bugfix.md` §1.1 is only partly fixed).** Under
  `mode: "full"`, `budgetExploreShape` (`src/shared/output-budget.ts:79-106`)
  still caps `symbol.source` at 120 lines and lists at 40, with the hints
  `use mode:"full" or omit source from include` /
  `use mode:"full" or narrow with include`. The caller already used full mode,
  so this is the same untruthful hint §1.1 reports. The case §1.1 cites,
  `compass_explore handleHarness` `mode:"full"`, still omits 52 of 172 lines.
  The requirement wording ("IF the emitted text is cut … the truncation hint
  SHALL NOT suggest `mode:"full"`") only covers the `text()` suffix. But the
  same requirement says each `truncated` entry carries "a hint to widen the
  request", and this hint widens nothing. Remedy: make the entry hints
  mode-aware (no `mode:"full"` under full; e.g. "omit source from include" /
  "narrow with include"), with a unit case in `output-budget.test.ts` that
  fails first, and a requirement sentence covering truncation entries.
  Optional: let full mode size the source by the 4500 ceiling instead of 120
  lines.
- **O1 (LOW, not blocking; design trade-off).** `findSymbols` hands the full
  cap to `hybridSearch`, so `rendered` already fills the budget, and the
  formatter then trims `focusIgnored`/`focus` first. At the default 1500 cap,
  any query with plenty of hits returns `focus: []` and `focusIgnored: []` with
  only the `…Total` counts. Even a single explicit unindexed path
  (`focusIgnored` ≈ 12 chars) is dropped while 41 hits remain. This is
  spec-compliant ("no hit is removed while any list holds an entry"), but the
  focus diagnostics rarely survive. Consider reserving envelope room when
  fitting the search.

## Isolation

Every manual call ran against `mkdtemp` fixtures under `/tmp`
(`fcq-fixture.*`, `fcq-fix11.*`, `fcq-old.*`, `fcq-focus.*`, `fcq-lawbook.*`)
or against `/tmp/fcq-covcopy.*`, an rsync copy of the working tree without
`.speclaw/`, `.git`, `dist`, or `node_modules`. Each fixture had its own
throwaway `.speclaw/index.db` and `harness.json`. No MCP or CLI call in this
section used this repository's `projectPath`. One gate run did touch the
repository's derived index; see "Pre-existing / unrelated failures".

## Pre-existing / unrelated failures

- **The repository's own Compass index is empty** (schema 11,
  `needs_reindex=1`, 0 edges, 0 `coverage_links`, checked read-only). The cause
  is two index versions alternating. `.mcp.json` runs this repo's
  `dist/cli/index.js mcp`, and the long-lived MCP server process loaded the
  pre-change (schema 11) code. Any branch CLI run on the repo (implementer
  runs, and my `coverage` gate run at 12:39:39 local) stamps the index to 12.
  The old server then treats 12 as unknown and rebuilds an empty schema-11
  shell; my Compass MCP calls at 12:39:50 and 12:43:15 match the index mtime.
  It was already empty before my run: `review.md` reports stale or "not found"
  Compass results. This is a derived cache, not user data, and I made no other
  writes. It is the documented "mixed versions rebuild from scratch"
  behaviour, not a defect of this change. To recover: restart the MCP server
  so it loads the new `dist`, then run `node dist/cli/index.js index`
  (coordinator/human decision).
- Validate's 107 advisory warnings are pre-existing EARS style issues, plus the
  known false positive above.

## Pending manual steps

None for this discipline. All checks were executed by the tester.

## Verdict

**PASS**: every MCP contract in this change behaves as specified; T1 and T2 are resolved (see Rework 2).

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
