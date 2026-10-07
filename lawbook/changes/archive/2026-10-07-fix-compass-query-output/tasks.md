# Tasks — fix-compass-query-output

Bug change, ceremony level 3 (human-confirmed), ships as **2.0.13** on branch
`fix/compass-query-output`. Root causes RC1–RC7, the fix, and the regression
tests are in `bugfix.md`; shapes and boundaries are in `design.md`. Delta specs
(full copies of the canonical files; sync overwrites them):
`specs/code-graph/spec.md`, `specs/context-budget/spec.md`,
`specs/lawbook-workflow/spec.md`. Tag every new or changed test with
`// Covers: <req id>` and every implementing function with the same comment.

- [x] Step 0: Create the feature branch (must be first). It already exists:
  `fix/compass-query-output`.

## Red first (no `src/` edit until this section is done)

- [x] 1. Write every regression test from `bugfix.md` §6 against the unchanged
  `src/`:
  - New `test/contract/compass-find-output.test.ts` (fixture with ≥40
    functions): response fits `maxTokens` 2000 and 8000 and parses as JSON;
    `tokens === estimateTokens(text)`; no `[truncated`; hits have exactly
    `name, kind, file, line`; default cap is the brief ceiling; `truncated`
    only when trimmed (256-token cap); `compass_search` alias shape
    (`req~find-response-budget~1`).
  - `test/contract/registers.test.ts`: `compass_explore` and
    `compass_diff_context` with `mode: "full"` are not cut at the brief ceiling
    (context-budget "Output token budget on tool responses").
  - `test/unit/output-budget.test.ts`: full-mode hint never names
    `mode:"full"`; `text(value)` default unchanged.
  - `test/integration/retrieval.test.ts`: worktree focus excludes unindexed
    files; explicit unindexed focus falls back to no-focus defaults
    (`req~task-relative-ranking~1`); exact not-found with `nearest`;
    multi-term OR with `terms`; concept mode unchanged
    (`req~find-exact-not-found~1`).
  - `test/integration/compass.test.ts`: the `Props` fixture: `render`/`Widget`
    callers `via: "ref"`, `main` `via: "call"`, no cross-file bare-name
    binding, impact and affected tests unchanged, built-ins and repeats add no
    edge (`req~type-ref-edges~1`).
  - `test/integration/db.test.ts`: 11 → 12 keeps embeddings, failed 11 → 12
    rolls back, 10 → 12 path, reindex after 12 adds `ref` edges with 0
    embeddings computed (`req~schema-ref-edges~1`,
    `req~schema-edge-membership~1`).
  - `test/unit/bugfix.test.ts`: a bug draft without a level is unconfirmed;
    validate names the missing `design.md`; a supplied level is confirmed
    (`req~bug-draft-unconfirmed~1`).
  - `test/unit/harness.test.ts`: pause from `implementing` and `exploring` is
    rejected byte-identically; pause from `planning` still records questions
    (`req~harness-pause-questions~1`); a level set after start governs the next
    advance; confirmed 0 still skips planning (`req~harness-level-current~1`).
  - `test/integration/cortex-questions-cli.test.ts`: `advance
    --pause-questions` from `implementing` exits non-zero, `harness.json`
    unchanged.
  - `test/unit/levels.test.ts`: empty targets propose `level: null` with
    `no-targets`; `set` and `promote` without targets keep the stored proposal;
    targets replace it (`req~level-proposal-preserved~1`).

  Build, run the new tests, and save the output to
  `reports/.red-before-fix.txt`. Every new case must fail for the reason
  `bugfix.md` §6 gives (the guard cases listed there stay green).

## Implementation — defect 1: MCP output budget (RC1)

- [x] 2. `src/shared/output-budget.ts` + `src/shared/mcp.ts`: add
  `TextBudget = OutputMode | { maxTokens: number }`; `text(value, budget =
  "brief")` and `applyTextBudget` accept it; the suffix under `full` or an
  explicit cap does not name `mode:"full"`. Leave every other `text()` call
  site unchanged.
- [x] 3. `src/modules/compass/register.ts`: `compass_explore` and
  `compass_diff_context` pass their `mode` to `text()`.
- [x] 4. New `src/modules/compass/find-output.ts`: `formatFindResponse` per
  `design.md` §1 (compact hits, whole-response cap = `maxTokens ??
  OUTPUT_BUDGET.brief`, trim order, exact `tokens`, `truncated` only when
  trimmed, no indentation). Wire `compass_find`, `compass_search`, and
  `compass_recall` to it and emit with `text(str, { maxTokens: cap })`. Do not
  change `HybridSearchResult` or `src/cli/commands/query.ts`.

## Implementation — defect 2: indexed focus (RC2)

- [x] 5. `src/modules/compass/hybrid.ts`: `resolveSearchFocus` (normalise,
  filter to `files`, report `ignored`); internal `resolvedFocus` option on
  `hybridSearch`; budget, route, and personalization from the filtered list.
  `findSymbols` passes it and the formatter reports `focusIgnored`. Do not
  touch `src/shared/git.ts` or `diff-context.ts`.

## Implementation — defect 3: exact mode (RC3)

- [x] 6. `findSymbols` + `hybridSearch` internal `exactNames` option per
  `design.md` §3: term split, `name IN (terms)` list, exact-only hits,
  `found`/`terms`, `nearest` (contained names → case-insensitive/subtoken →
  KNN, ≤5, no file-owner nodes). Concept mode and the CLI unchanged.

## Implementation — defect 4: `ref` edges and schema 12 (RC4)

- [x] 7. `src/modules/compass/extract.ts`: `ExtractedRef.kind` adds `"ref"`;
  emit de-duplicated refs for TS/JS type annotations (incl. generic
  arguments) and `extends`/`implements` clauses; skip built-in type names;
  qualified names follow the `is_member`/`spec` rules of `design.md` §4.
- [x] 8. Edge resolution (full index and `speclaw reindex-file` paths): refs
  resolve only by id → resolved import binding (barrel rules) → same-file
  definition; never by bare global name. By-name fallbacks of explore callers
  and impact skip `kind = 'ref'`.
- [x] 9. `src/modules/compass/query.ts`: `explore(..., { includeRefs })`
  default `false`; callers carry `via` when refs are on (one entry per caller,
  `call` wins). `exploreRich` and the CLI `speclaw explore`
  (`src/cli/commands/query.ts`) pass `true`. Leave `lawbook/investigate.ts` and
  `lawbook/levels.ts` on the default.
- [x] 10. Audit every `FROM edges` query (Compass, hotspots/coupling, map,
  visualize, indexer, affected, diff-context, pagerank): any without a kind
  filter gets an explicit `call`/`import` filter so refs change nothing
  outside explore callers. List the audited queries in `reports/backend.md`.
- [x] 11. `src/modules/compass/db.ts`: `SCHEMA_VERSION = "12"`;
  `migrate11to12` in one `BEGIN IMMEDIATE` (needs-reindex reason names schema
  12; rollback keeps `"11"`); chain 10 → 11 → 12 and the pre-release-11 path.
  Update the `"11"` literals in the tests listed in `bugfix.md` §4.

## Implementation — defects 5–7: lawbook and Cortex (RC5–RC7)

- [x] 12. `src/modules/lawbook/bugfix.ts`: `scaffoldBugfix` passes
  `opts.level` unchanged (no fallback); `bugfixTemplate` prints
  `**Level:** unconfirmed` when no level was supplied; unconfirmed artifacts are
  `bugfix.md` + `tasks.md`.
- [x] 13. `src/modules/cortex/harness.ts`: re-read `readConfirmedLevel` on
  `advance`/`rework`, route with it, store it in `state.level`; evaluate
  `pauseForQuestions` first and reject it outside `planning` with no write.
  Confirm the CLI (`src/cli/commands/cortex.ts`, `lawbook.ts` alias) exits
  non-zero on the error.
- [x] 14. `src/modules/lawbook/levels.ts` + `quick.ts`: `no-targets`
  degradation and `level: null` for an empty target set; `handleLevel`
  measures only when targets are given; `set`/`promote` without targets keep
  the stored proposal fields; with targets they store the fresh one.

## Release and docs

- [x] 15. Bump to **2.0.13** following commit f3d5d3b (`git show --stat
  f3d5d3b`): `package.json`, `package-lock.json`, `CHANGELOG.md` (`### Fixed`
  entries for all seven defects, noting schema 12 and the MCP find shape), and
  a `2.0.13` entry in the `src/cli/commands/update.ts` migration notes (schema
  12 forces one reindex with embeddings reused; pin every speclaw and the MCP
  entry to 2.0.13; `compass_find` compact shape; explore callers `via`).
- [x] 16. Update the technical documentation touched by the change:
  - `docs/compass.md` and
    `src/modules/foundation/assets/docs/compass.template.md` (keep every
    `{{placeholder}}` and `speclaw init` marker): schema 12, pin to 2.0.13, the
    `compass_find` response (`found`/`terms`/`nearest`, `focusIgnored`,
    `maxTokens` caps the whole response), `via` on explore callers.
  - `docs/cortex.md`: pause only from `planning`; level re-read on advance;
    bug drafts start unconfirmed.
  - `CLAUDE.md` and `AGENTS.md`: schema **11** → **12** notes (12 forces a
    reindex; embeddings reused) and the 2.0.13 pin. These are strict lock
    paths: after the edit, the **human** runs `speclaw laws accept CLAUDE.md`
    and `speclaw laws accept AGENTS.md` on an interactive TTY. No agent runs
    `laws accept` or `laws lock --force`.
  - `src/cli/lib/help.ts` where `--pause-questions` or `search` output is
    described.

## Rework 1 (review FAIL, `reports/review.md`)

- [x] R1. F1: red first, then fix. Regression tests in
  `test/contract/compass-find-output.test.ts` (git fixture with 30 modified
  indexed files plus 30 untracked files; a 60-identifier exact query; both at
  `maxTokens` 256) failed with invalid JSON cut by the generic suffix; output
  appended to `reports/.red-before-fix.txt` under "rework 1 / F1".
  `formatFindResponse` now trims `focusIgnored`, `focus`, then `terms`
  **before** any hit, rendered block, or `nearest` entry (coordinator
  follow-up: the context lists matter less than the payload; longest fitting
  prefix, `focusIgnoredTotal` / `focusTotal` / `termsTotal` when cut,
  `truncated: true`), with a last-resort drop of the final hit. Unit cases in `test/unit/find-output.test.ts`. Amended
  `req~find-response-budget~1` (new scenario "Context lists are trimmed to fit
  a small cap") and `design.md` §1; `docs/compass.md` and `CHANGELOG.md`.
- [x] R2. F2: `truncated` covers the search fit too; scenario retitled
  "Truncated is reported only when content was removed to fit the cap" and
  `design.md` §1 step 3 explains `result.capped`. No code change.
- [x] R3. F3: type parameters scoped to their declaring node in
  `src/modules/compass/extract.ts` (filtered before de-duplication); two cases
  in `test/unit/extract-refs.test.ts`; `req~type-ref-edges~1` sentence and
  scenario "A type parameter shadows a name only in its own declaration".
- [x] R4. F4: `test/integration/compass.test.ts` "a per-file reindex resolves
  ref edges like a full index" (`indexFiles` on `src/types.ts` then
  `src/view.ts` vs a full index of the same tree); scenario added to
  `req~type-ref-edges~1`.
- [x] R5. F5: `req~level-proposal-preserved~1` sentence and scenario "Promote on
  an unconfirmed change is rejected"; test in `test/unit/levels.test.ts`;
  CHANGELOG line.
- [x] R6. F6: `AGENTS.md` schema sentence now says schema 12 (11→12 forces a
  reindex; embeddings reused). Strict lock path: the **human** runs
  `speclaw laws accept AGENTS.md` (and `CLAUDE.md`) on an interactive TTY.
- [x] R7. F7 (tester): include the edge-query audit from `reports/review.md` in
  `reports/backend.md` (task 20).

## Verification

- [x] 17. Review and update the affected tests. Expected moves, each justified
  in the hand-off to the tester: edge totals and the schema literal; tests that
  asserted `proposal.level === 0` for an empty target set; the bug-draft
  `change.json` fields in `test/unit/feature-draft.test.ts:227` and
  `test/integration/bugfix-flow.test.ts`; `test/integration/compass.test.ts:445-452`
  if it read find hit fields that the MCP shape drops. Must stay green
  unchanged: the retrieval golden-set MRR gate, `test/contract/registers.test.ts`
  canonical surface and schema size (input schemas do not change), and the
  guards listed in `bugfix.md` §6.
- [x] 18. Run the quality gates and verify they pass (see
  docs/standards/testing-standards.md):
  - `npm run check`
  - `npm run build`
  - `npm test` (80% line/function/branch floor)
  - `node dist/cli/index.js lawbook validate fix-compass-query-output`
  - `node dist/cli/index.js coverage` with no direct defect for any `req~` id
    in the three delta specs
- [x] 19. Perform manual verification of the behavior — the tester role executes
  this itself, never the user. Use `mkdtemp` fixture repos only, never this
  repository's `.speclaw/index.db`, `harness.json`, or `speclaw.lock`. With
  the built CLI and a stdio MCP session (`node dist/cli/index.js mcp`) on the
  fixtures:
  - `bugfix.md` §2 steps 1–7 each show the fixed behavior.
  - `compass_find` with `maxTokens` 1500/8000: valid JSON within the cap;
    `compass_explore` `mode: "full"` on a 200-line function is not cut at 1500.
  - Open a fixture index built by the 2.0.12 CLI (schema 11) with the branch:
    stamp 12, one full re-extract, `embeddings computed: 0`, `ref` edges present.
  - `speclaw search <q> --json` output keys identical to the 2.0.12 CLI on the
    same fixture.
- [x] 20. Produce the discipline reports under reports/ — one per discipline
  touched (see `reports/README.md` and the `spec-reports-disciplines` rule):
  `api.md` (required: MCP tool contract — every tool response shape and error
  this change governs, how it was exercised, isolation), `backend.md` (red
  evidence from `.red-before-fix.txt`, then green; the edge-query audit),
  `database.md` (schema migrations, rollback, cache reuse, edge counts),
  `cli.md` (explore `via`, cortex exit code, bug draft, search `--json`
  unchanged). Every `#### Scenario` of the three delta specs appears in a
  coverage table.
- [x] 21. Sync the delta specs into `lawbook/specs/` (full copies: first check
  the canonical files have not changed since this draft) and archive the change
  within the same PR (lawbook:archive) after harness review/test PASS.
