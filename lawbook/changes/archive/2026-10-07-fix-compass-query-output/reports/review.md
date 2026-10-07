# Review — fix-compass-query-output

**Discipline:** review · **Change:** fix-compass-query-output (bug, level 3) ·
**Date:** 2026-10-07 · **Branch:** fix/compass-query-output (uncommitted working
tree vs `main`) · **cwd:** /Users/esneiderbravo/Projects/speclaw

## Current verdict: PASS (re-review after rework 1)

The first review (FAIL) is kept below as history. See "Re-review (rework 1)" at
the end for the status of each finding.

## Verdict (first review): FAIL

One spec violation. It is the same defect this change fixes: `compass_find` can
still emit invalid JSON that is cut by the generic truncation suffix. Everything
else is sound or low severity. The rework is small and targeted (see below).

## Scope reviewed

`bugfix.md`, `design.md`, `tasks.md`, the three delta specs, `LAWS.md`, and
`docs/standards/*`. I compared them with every changed and untracked file in
the working tree. I used Compass first (`compass_diff_context`,
`compass_explore`). The index is stale for the edited files: line numbers were
off and `handleHarness` was "not found". So I read the changed source directly.
I also checked the red-first evidence in `reports/.red-before-fix.txt`.

## Findings

### F1 — HIGH — `compass_find` can exceed `maxTokens` and emit invalid JSON (unbounded `focus` / `focusIgnored` / `terms`)

- **Where:** `src/modules/compass/find-output.ts` `formatFindResponse`
  (`build()` at lines 100-112, fallback at line 145); `src/modules/compass/register.ts:84`
  (`text(formatFindResponse(found), { maxTokens: found.cap })`).
- **Why:** The trim loop only shrinks `hits`, `rendered`, and `nearest`.
  `focus`, `focusIgnored`, and `terms` are always copied whole. `focus` is every
  indexed working-tree change. `focusIgnored` is every unindexed one. `terms` is
  every identifier in an exact-mode query. When those lists alone go past the
  cap, every `fits()` fails. Line 145 then returns an over-cap document, and
  `text(str, { maxTokens: cap })` cuts it and appends
  `… [truncated — narrow includes or the query]`. The result is invalid JSON
  over the cap. This breaks `req~find-response-budget~1` ("The emitted text
  SHALL always parse as JSON and SHALL NOT end with the generic truncation
  suffix", "cap the whole emitted text at `maxTokens`").
- **How easy it is to hit:** Very easy. At the schema minimum `maxTokens: 256`
  (about 1024 chars), about 20 changed indexed files with no explicit `focus`
  is enough. This branch has about 40 changed `src/`/`test/` files, so
  `compass_find` with `maxTokens: 256` in this repository would return broken
  JSON. A large refactor or a worktree with many untracked files breaks the
  default 1500 cap the same way. The comment at line 144 ("A cap below the
  bare envelope (schema minimum is 256)") assumes the envelope is constant. It
  is not.
- **Tests miss it:** `test/contract/compass-find-output.test.ts` uses
  non-git `tmpRepo` fixtures, so `focus`/`focusIgnored` are always empty.
- **Fix:** Bound these lists inside the formatter so the document always fits:
  1. After `nearest` (step 3), trim `focusIgnored`, then `focus`, then `terms`
     from the end, and set `truncated: true`.
  2. Alternatively, cap each list up front (for example 20 entries) and add a
     count field (`focusIgnoredTotal`).

  Either way, amend `req~find-response-budget~1` so the field list and the
  meaning of `truncated` include the trimmed lists. Add a regression test that
  fails first: a git fixture with about 30 modified indexed files plus
  untracked non-code files, `compass_find` with no `focus` and
  `maxTokens: 256`. The text must parse as JSON, satisfy
  `estimateTokens(text) <= 256` and `tokens === estimateTokens(text)`, and not
  contain `[truncated`. Add an exact-mode case with a long multi-identifier
  query. Save its red output next to the existing red evidence.

### F2 — LOW — `truncated` also reflects hits the search fit dropped (an implementer deviation)

- **Where:** `src/modules/compass/explore-rich.ts:224`
  (`capped: report.ranked > result.hits.length`) →
  `find-output.ts:98`.
- **Why:** `design.md` §1 and the scenario title "Truncated is reported only
  when the formatter trimmed" say only the formatter sets the flag. The code
  also sets it when `hybridSearch`'s `fitToBudget` (run at the same cap) left
  ranked candidates out. In concept mode, `ranked` includes ego-expanded
  neighbours, so almost every concept query reports `truncated: true`. The
  requirement text ("hits … removed to fit the cap") still holds, and the
  behaviour is arguably more honest.
- **Fix:** Keep the behaviour, but align the documents. Reword the scenario
  title and design §1 to say "removed to fit the cap (search fit or
  formatter)", and record this in `api.md`. No code change is needed.

### F3 — LOW — Type parameters are collected per file, not per scope

- **Where:** `src/modules/compass/extract.ts:719-721` and `:748`.
- **Why:** `typeParams` is one set for the whole file. If any function declares
  `<Props>`, every bare `Props` ref in that file that is not imported is
  dropped, including refs to a real `interface Props` defined in the same
  file. This only causes missing results (false negatives), never false
  bindings, so the "no cross-file bare-name false positive" goal holds.
  Ownership by the enclosing definition and the built-in filter are correct.
  The resolution in `src/modules/compass/indexer.ts:386-400` uses only the id,
  the resolved import binding (barrel subtree), or a same-file definition, and
  never a bare global name. Readers never match `ref` by name
  (`query.ts:345-349`).
- **Fix:** Scope type parameters to the owner index, keyed by
  `${ownerIndex}:${name}`, or add one sentence to `req~type-ref-edges~1`
  documenting the conservative drop.

### F4 — LOW — No test for the per-file reindex rule on `ref` edges

- **Where:** `req~type-ref-edges~1` says "A per-file reindex SHALL apply the
  same rules". Only `test/integration/compass.test.ts` and `db.test.ts` touch
  `ref`, and both use full indexes.
- **Why:** I read the code path and it looks right. `detach` and
  `detachedOwners` (`indexer.ts:761-767`) have no kind filter, and the ref
  UPDATE reuses `callScope`. Still, a SHALL with no test is a coverage gap.
- **Fix:** Add a test. Index the Props fixture, edit `src/types.ts` (move
  `Props` down a few lines), run the per-file reindex, and assert that
  `render`/`Widget` still list as `via: "ref"` callers, the same result as a
  full index.

### F5 — LOW — Promoting an unconfirmed change now throws (an implementer deviation)

- **Where:** `src/modules/lawbook/levels.ts:566-568` (`… use mode 'set'`).
- **Why:** The guard is reasonable. Before, `to <= undefined` let promote go
  through and record `from: undefined`. But this is a contract change in
  `lawbook_change` action `level`, and no delta spec mentions it.
- **Fix:** Add one sentence and a scenario to `req~level-proposal-preserved~1`
  (or a CHANGELOG line), and cover it in `levels.test.ts`.

### F6 — LOW — Stale "Schema **9**" sentence in `AGENTS.md`

- **Where:** `AGENTS.md:29-31` says "Schema **9** … (8→9 migrates
  embeddings)". Line 116 of the same file says schema 12.
- **Why:** It was probably stale before this change. But this change edits the
  schema notes in `AGENTS.md` (task 16), and the file now contradicts itself.
  `AGENTS.md` is a strict lock path, so the human has to run
  `speclaw laws accept AGENTS.md` anyway. Fixing it now costs no extra accept.
- **Fix:** Change it to "Schema **12** … (11→12 forces a reindex; embeddings
  reused)" in the same edit.

### F7 — LOW — The edge-query audit list is not in `reports/backend.md` yet

- **Where:** Task 10 is checked, but it says "List the audited queries in
  `reports/backend.md`", and that report does not exist yet.
- **Fix:** The tester or implementer includes the audit when writing
  `backend.md` (task 20). My audit is below and can be reused.

## Points checked and accepted

- **Trim algorithm (except F1).** `emit` writes `tokens` last and repeats until
  the value is stable, so `tokens === estimateTokens(text)`, prefix included.
  Output is `JSON.stringify` with no indentation. Hits are dropped together
  with their rendered blocks. `renderHits` re-renders the kept prefix
  identically, because hybrid hits have no excerpt. When one hit is left,
  `rendered` is shortened, with a fallback to `""` if the escaped length still
  overflows. Then `nearest` is trimmed. Within the envelope assumption the cap
  holds and the JSON is valid.
- **`text()` opt-in budget.** It defaults to `brief`, so the other ~32 call
  sites keep their behaviour. The full or explicit-cap suffix never names
  `mode:"full"`. `compass_explore` and `compass_diff_context` pass their `mode`.
  `src/shared` still imports nothing from modules (`law-shared-stays-inner-1`).
- **Focus (RC2).** `resolveSearchFocus` normalises paths, keeps only those in
  `files`, and reports dropped inputs as given. Budget, route, and
  personalization use the filtered list. `git.ts` and `diff-context.ts` are
  untouched. Removing `resolveFocus` is fine: nothing references it.
- **Exact mode (RC3).** Results come from `name IN (terms)` plus a
  post-ranking equality filter, and exact ids are always seeded. Multi-term
  queries are ORed. `nearest` follows the designed order, has at most 5
  entries, and excludes file-owner nodes. Two notes: `nearestSymbols` scans
  every node, which costs time on large indexes; and dotted terms (`Foo.bar`)
  never equal a stored name. Neither blocks this change.
- **Edge-query audit.** Every `FROM edges` / `JOIN edges` is pinned or
  harmless:
  - Kind `call`: `hybrid.ts:365,439`, `map.ts:36`, `visualize.ts:70`,
    `indexer.ts:326,1569`, `query.ts:314,323,972`.
  - `call`/`import`: `hotspots.ts:237,256` and impact (`query.ts:707`; an
    explicit `ref` kind matches no arm).
  - Import only: `indexer.ts:439`.
  - `detach` and `detachedOwners` (`indexer.ts:761-767`) correctly have no
    kind filter, because refs must re-resolve.
  - `foundation/deps.ts` and `foundation/graph.ts` now default to
    `DEFAULT_EDGE_KINDS = ["call","import"]`. Before this change only those
    two kinds existed, so existing laws evaluate exactly as before. Laws with
    explicit `edgeKinds` are unchanged.
  - `countTotals` (`indexer.ts:1493`) now counts refs. `bugfix.md` §4
    expected this ("Edge totals in index stats grow"), and `indexNextStep`
    does not print edges. Accepted.
- **Migration 11→12.** One `BEGIN IMMEDIATE` sets needs-reindex with a reason
  naming schema 12 (an earlier reason in the same chain is kept), stamps
  `"12"`, and rolls back to `"11"` on failure. The chains 8/9/10 → 12 and the
  pre-release-11 path (no `spec`) both reach `migrate11to12`. speclaw 2.0.12
  or older will rebuild a schema-12 index from scratch. That is documented in
  `docs/compass.md`, the template, `CLAUDE.md`, `AGENTS.md`, and the
  `update.ts` 2.0.13 notes.
- **Two transports.** `exploreRich` (MCP) and the CLI `speclaw explore` both
  pass `includeRefs: true`. `investigate.ts` and `levels.ts` keep the default.
  Find intentionally differs between MCP and CLI (human decision; the CLI
  `HybridSearchResult` and the sealed anchor are unchanged). The logic lives
  in `src/modules/compass`, and the handlers stay thin.
- **RC5–RC7.** `scaffoldBugfix` passes `opts.level` through unchanged and the
  header prints `unconfirmed`. The harness re-reads the level on `advance` and
  `rework` (unconfirmed → 3) and rejects `pauseForQuestions` outside
  `planning` before any write. `no-targets` gives `level: null`. `set` and
  `promote` without targets keep the stored proposal.
- **Delta-spec heading rename ("Task-relative ranking" → with
  `req~task-relative-ranking~1`).** The validate warning is a false positive.
  `requirementHeaders` (`engine.ts:175`) compares raw heading text, and that
  text now includes the id. `specSync` (`engine.ts:406-442`) copies the whole
  delta file over the canonical one (`copyFileSync`), so sync neither loses
  nor duplicates the requirement. The anchor slug strips backticks
  (`anchors.ts:367-375`), so the sealed `requirementId: "task-relative-ranking"`
  anchors in `lawbook/anchors/code-graph.json` still match. No fix is needed
  before archive. Say so in the archive or test report, and check that the
  canonical `lawbook/specs/*` did not change since the draft (task 21).
- **Red-first evidence.** `reports/.red-before-fix.txt` was recorded with
  `src/` untouched at HEAD 5854270. All 26 regression cases fail for the
  reasons `bugfix.md` §6 gives (truncated invalid JSON, `1500` ceiling,
  `callers: []`, schema 11, self-confirmed level, silent advance, zero
  proposal). The listed guard tests stayed green.
- **Hygiene.** The comments state constraints. `// Covers: req~…` tags follow
  the repo convention, and there are no ticket ids. The new exports have TSDoc
  with `@param`/`@returns`. The code reads like its neighbours. Version is
  2.0.13 in `package.json`; `update.ts` has its 2.0.13 notes; CHANGELOG has
  entries for the defects.

## Rework guidance (to reach PASS)

1. Fix F1 in `find-output.ts`: bound or trim `focus`, `focusIgnored`, and
   `terms` so the cap and valid JSON hold for any input. Amend
   `req~find-response-budget~1` to match. Add the git-fixture regression test
   (`maxTokens: 256`, many changed files) and record its red output first.
2. Fix the low items in the same pass if cheap (F3 doc or code, F4 test, F5
   spec sentence, F6 `AGENTS.md` line). F2 and F7 are documentation for the
   tester's reports.
3. Re-run `npm run check`, `npm run build`, `npm test`, and
   `lawbook validate fix-compass-query-output`.

---

## Re-review (rework 1)

**Date:** 2026-10-07 · **Verdict: PASS**

Method: `compass_diff_context` over the reworked files came first. It returned
no changed symbols and no blast radius, because the index is still stale for
uncommitted edits, as in the first review. So I read the reworked source,
tests, delta specs, `design.md`, `tasks.md` (R1–R7), and the red evidence
directly. I did not run the gates myself (the reviewer has no shell). The
tester owns tasks 18–20.

### Finding status

| # | Status | Evidence |
|---|--------|----------|
| F1 HIGH | **Resolved** | `find-output.ts` `formatFindResponse` step 1 trims `focusIgnored` → `focus` → `terms`. Each list keeps its longest fitting prefix (`largestFitting`, binary search), and each trimmed list reports `focusIgnoredTotal` / `focusTotal` / `termsTotal`. This happens before any hit is dropped. The remaining steps run in order: hits (with their blocks) → shorten the last `rendered` → `nearest` → last-resort hit drop. `tokens` is still written last by `emit`. Tests: contract `compass_find fits a 256-token cap over a worktree with many changes` (git fixture: 30 modified indexed files plus 30 untracked `.txt`; asserts `focusTotal >= 30` and more than one hit) and `… with a long exact-mode query` (60 terms, `termsTotal` 60). Unit tests cover the list order, prefix retention, "context lists cut before any hit", and the last-resort drop. |
| F2 LOW | **Resolved** | The scenario is retitled "Truncated is reported only when content was removed to fit the cap". The requirement text says "whether by the search fitting its ranked candidates to the cap or by the formatter". `design.md` lines 104-108 match. (The tester still records this in `api.md`.) |
| F3 LOW | **Resolved (code)** | `extract.ts` now records `typeParamScopes` as `{name, start, end}` over the declaration that owns the `<…>` list (`node.parent?.parent`). It filters a bare name only when its position falls inside that range, and filters before the `(owner, name)` de-dup. `req~type-ref-edges~1` adds a matching sentence and the scenario "A type parameter shadows a name only in its own declaration". Tests in `test/unit/extract-refs.test.ts` cover a nested arrow inside the generic, a sibling function, a file-level annotation, and a same-file `interface Props` next to `class Box<Props>`. |
| F4 LOW | **Resolved** | `test/integration/compass.test.ts` "a per-file reindex resolves ref edges like a full index". It moves `Props` and calls `indexFiles` on `types.ts`, then edits `view.ts` and calls `indexFiles` again. It asserts the `ref` callers and that the resolved `ref` rows (`owner -> file:name`) equal those of a full index. The scenario was added to the spec. |
| F5 LOW | **Resolved** | `req~level-proposal-preserved~1` adds the IF/THEN sentence and the scenario "Promote on an unconfirmed change is rejected". `test/unit/levels.test.ts:288` asserts the `use mode 'set'` error and that `change.json` is byte-identical. The test matches `levels.ts:566-568`. |
| F6 LOW | **Resolved** | `AGENTS.md:29-31` and `:116-117` both say schema **12** (11→12 forces a reindex; embeddings reused). `CLAUDE.md` is consistent (lines 42/45/133/177). The human re-accepted the lock. |
| F7 LOW | Open, not blocking | This is the tester's task R7 (it goes in `backend.md` under task 20). |

### Trim-order change (coordinator request): accepted

- **Invariants hold.** Fitting is monotone in each list length, and the
  `…Total` field appears for every `k < len`, so the binary search is sound.
  `fitsAt(len)` is already known to be false, so no list is ever marked
  trimmed without losing an entry. `truncated` is set only once a step
  actually runs. Output is always `JSON.stringify` (valid JSON), and `fits()`
  enforces `estimateTokens(out) <= cap`. `tokens === estimateTokens(text)`
  holds through `emit`. The only path that can return an over-cap document is
  the final `?? emit(...)`. That path needs a prefix plus an empty envelope
  bigger than the cap. The real alias prefix is about 70 characters, so this
  cannot happen at any `maxTokens >= 256` the schema accepts.
- **Known trade-off (a tight exact-not-found answer empties `terms` before
  `nearest`): acceptable.** `terms` only echoes the caller's own query, which
  the agent already holds, and `termsTotal` keeps the count. `nearest` is the
  only new information in a not-found answer. Keeping it over the echo is the
  right priority, and it matches the requirement sentence "A hit SHALL NOT be
  removed while any of those three lists still holds an entry". The unit test
  "nearest entries are dropped from the end once the context lists are empty"
  pins this behaviour.

### Red evidence

`reports/.red-before-fix.txt` has the section "rework 1 / F1 — red before fix".
Both new contract tests fail there for the right reason: the generic
`… [truncated — narrow includes or the query]` suffix on cut JSON, with
`find-output.ts` unchanged since the review. It is followed by a "green after
fix" run with 11/11 passing. Satisfied.

### New observation (non-blocking)

- **N1 — LOW — The spec order omits the last-resort hit drop.**
  `req~find-response-budget~1` lists the removal order as lists → hits →
  `rendered` → `nearest`. But `formatFindResponse` step 5 (and `design.md`
  step 5) can also drop the last hit when a prefix plus one hit still exceeds
  the cap. No real input can reach this (see above), and the unit test "a
  prefix larger than the bare envelope drops the last hit" covers it. Optional:
  append "; and, as a last resort, the remaining hit" to the order sentence
  before sync. This does not block the change.

### Regressions

None found. `register.ts` still passes `found.cap` to
`text(..., { maxTokens })`. The trim rework is confined to
`find-output.ts`. The F3 change only narrows which `ref` edges are dropped, so
it can only add true refs: resolution and readers are unchanged, and no
reader matches by name. The `levels.ts` guard only affects promote on
unconfirmed changes. Compass could not compute a blast radius for the
uncommitted edits (stale index). The tester's full `npm test` run (task 18)
is the authoritative regression gate.

### Remaining before archive (not review blockers)

R7 / F7 audit into `backend.md`; tasks 18–21 (gates, manual verification,
discipline reports including `api.md` with the F2 note, spec sync). N1 is
optional.
