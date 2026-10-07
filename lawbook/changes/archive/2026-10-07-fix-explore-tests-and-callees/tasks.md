# Tasks — fix-explore-tests-and-callees

**Gate before task 1:** implementation starts only after
`harden-update-lock-and-cli` has a harness test PASS (satisfied: it is archived
in release 2.0.9). This change ships as 2.0.10 on branch
`fix/explore-tests-and-callees`, stacked on `fix/harden-update-lock-and-cli`;
both touch `src/cli/commands/update.ts` and the CLI wiring. This change also syncs its
`code-graph` delta **before** `reindex-on-edit`, which rebases on it.

- [x] Step 0: Create the feature branch (must be first). It already exists:
  `fix/explore-tests-and-callees` (release 2.0.10).

## Red first (no `src/` edit until this section is done)

- [x] 1. Write every regression test from `bugfix.md` §6:
  - `test/unit/affected.test.ts`: declaration-less callback test, multi-line
    import, tsconfig alias, null command on `none`, runner detection,
    workspace grouping, compiled `node --test` mapping.
  - `test/integration/compass.test.ts`: resolved-only callees, member calls,
    callback caller, hidden file nodes, path explore of a declaration-less file.
  - `test/unit/impact.test.ts`: declaration-less importer.
  - `test/integration/db.test.ts`: 10→11 migration.

  Rework the masking fixture at `test/unit/affected.test.ts:29-42` into
  realistic shapes. Tag each test with `// Covers: <req id>` (design §8). Run
  them against the unchanged code and save the output to
  `reports/.red-before-fix.txt`. Every new case must fail.

## Implementation

- [x] 2. Schema 11 (`src/modules/compass/db.ts`):
  - `SCHEMA_VERSION = "11"`, and `edges.is_member` in the DDL.
  - The 10→11 migration in one `BEGIN IMMEDIATE` transaction. It sets
    needs-reindex and keeps `embedding_cache`.
  - Chain the 8→9→10→11 and 9→10→11 paths. Roll back on failure
    (design §7, `req~schema-edge-membership~1`).
- [x] 3. Extractor (`extract.ts`, `languages.ts`):
  - Store the full import text, collapsed and capped at 1024 characters.
  - Classify call receivers into `isMember` (design §3).
  - Keep `ownerIndex` null for orphan references.
- [x] 4. Indexer (`indexer.ts:367-494`):
  - Create the file-owner node (`FILE_NODE_KIND`) only for files with orphan
    references.
  - Own every import and orphan call with it.
  - Write `is_member`.
  - Skip `node_text`, embeddings, and `node_metrics` for file nodes
    (design §1.1).
- [x] 5. Extract `resolveEdges(db, fileIds?)` (design §4). It replaces the
  inline by-name resolution (`indexer.ts:533-541`) and wraps
  `resolveImportEdges` (`:78-125`). It adds:
  - `is_member` exclusion.
  - The `BUILTIN_GLOBALS` same-file rule.
  - Import targets that point at the file node, else the first node.
  - Alias resolution through the nearest `tsconfig`/`jsconfig`
    `paths`/`baseUrl` (with `extends`, JSONC-tolerant, cached, never throws).

  `buildIndex` calls it with no ids. Keep the no-op fast path skipping it.
- [x] 6. Query (`query.ts`):
  - Impact CTE by-name arm gains `AND e.is_member = 0`.
  - Callees: resolved only, de-duplicated, plus `unresolvedCallees`
    (`:251-259,286`).
  - Callers keep file nodes as `kind: "file"`.
  - Add `kind <> 'file'` to the explore name lookups and to the find exact-name
    list.
  - Path explore resolves to the file node when the file has no visible
    symbols (`req~explore-file-path~2`).
- [x] 7. Hide file nodes everywhere else (design §1.2): PageRank rows, hotspots
  health, `totals.nodes`, the compact map writer, and lawbook drift anchors.
- [x] 8. Affected-test command (`affected.ts`):
  - `command: string | null`, `commandReason`, `commands[]`.
  - Per-package runner detection: vitest, jest, `node --test` with compiled-glob
    mapping and coverage-flag stripping.
  - Workspace grouping and the compound `command` (design §5).
  - Never emit a run-nothing command.
- [x] 9. Consumer ripple (design §5.5):
  - `explore-rich.ts:26,118`
  - `src/cli/commands/query.ts:148` (text mode prints the reason on null)
  - `diff-context.ts:125`
  - `lawbook/investigate.ts:392`
  - `lawbook/levels.ts:378`
  - `compass/register.ts:227` (tool description)
  - `src/shared/output-budget.ts` (`budgetExploreShape` keeps
    `unresolvedCallees`)
- [x] 10. Rename `// Covers: req~explore-file-path~1` to `~2` in `src/` and
  `test/`. Add `// Covers:` tags for:
  - `req~impact-id-first~1`
  - `req~import-resolution~1`
  - `req~affected-test-selection~1`
  - `req~compass-mcp-surface~1`
  - `req~schema-edge-membership~1`

## Verification

- [x] 11. Review and update the affected tests:
  - `test/unit/diff-context.test.ts`, `investigate.test.ts`, `levels.test.ts`,
    `test/integration/affected-tests.test.ts`, and `retrieval.test.ts`.
  - Add the `resolveEdges` equivalence test and the "no NULL `src_node_id`"
    invariant.
  - Justify every changed expectation in `reports/backend.md` (the
    justifications are handed to the tester, who writes that report).
- [x] 12. Run the quality gates and verify they pass (see
  docs/standards/testing-standards.md):
  - `npm run check`
  - `npm run build`
  - `npm test`
  - `speclaw lawbook validate`
  - `speclaw coverage`, with no defect for the six req ids above
- [x] 13. Perform manual verification of the behavior. The tester role executes
  this itself, never the user. Use a **throwaway copy** of the index (or a temp
  fixture), never real user data. On this repo, with the built CLI:
  - `speclaw index` migrates 10→11 and reindexes.
  - `speclaw query affected-tests --files src/modules/foundation/hooks.ts`
    selects `test/unit/hooks.test.ts`, with a runnable `command` (run it).
  - `speclaw query affected-tests` on a docs-only change prints
    `no command: …`.
  - `compass_explore buildTestCommand` callees hold no file-less entries and
    report `unresolvedCallees`.
  - A function called only from test callbacks lists its test-file callers.
  - A temp vitest + jest workspace fixture yields per-cwd `commands`.
- [x] 14. Run the performance and quality comparison against `main` in
  throwaway worktrees (design §9):
  - Full index time and no-op index, median and p95.
  - Explore latency for 5 symbols.
  - Retrieval MRR@10.
  - Affected-test and caller counts, and the callee noise ratio.

  The branch full index must be within 15% of main, the no-op must be no slower
  than main, and MRR must stay at or above the threshold.
  Coordinator 2026-10-06: full index −3.2%, explore ±2.2%, MRR 0.2755→0.3001
  (see reports/performance.md). The no-op index measured +1.9 ms (+0.8%, 95% CI
  [1, 3] ms over 101 runs) with every fast-path component measuring equal; accepted
  as a deviation below practical significance and recorded as a follow-up to
  investigate, reported to the human at release.
- [x] 15. Produce the discipline reports under reports/, one per discipline
  touched:
  - `backend.md`: the red-before-green evidence (copy from
    `.red-before-fix.txt`, then the green run), the gates, a scenario table for
    every scenario of the six req ids, and justified expectation changes.
  - `api.md` (mandatory): the `compass_explore`, `compass_diff_context`,
    `compass_affected_tests` alias, and `speclaw query affected-tests` contract:
    - `callees`, `unresolvedCallees`, `kind: "file"` callers.
    - Nullable `command`, `commandReason`, and `commands[]`.
    - Every case: none / subset / all / workspace.
    - How it was exercised (MCP/CLI against a temp fixture, isolated).
  - `database.md`: the 10→11 migration, the rollback, embedding reuse, and the
    edge-ownership invariant.
  - `performance.md`: main vs branch, from task 14.
  - `docs.md`: the docs touched, and the pending human-accept edits.
- [x] 16. Update the technical documentation touched by the change (design §10):
  - `docs/compass.md`
  - `src/modules/foundation/assets/docs/compass.template.md`
  - `README.md:119` (Schema **11**)
  - `src/cli/commands/update.ts:236` (schema 11)

  Hand the 2.0.10 `CHANGELOG.md` Fixed/Changed lines to the coordinator.
- [x] 17. **Human-accept task (not done by agents).** `CLAUDE.md` and
  `AGENTS.md` are strict lock paths. The human edits:
  - `CLAUDE.md:42` and `AGENTS.md:105`: "Schema **10**" → "Schema **11**
    (10→11 forces a reindex; embeddings reused)".
  - `CLAUDE.md:152` and `AGENTS.md:140`: "Compass (schema 10)" →
    "Compass (schema 11)".

  Then the human runs `speclaw laws accept CLAUDE.md AGENTS.md` on a TTY. The
  coordinator surfaces this in the pause round. Until then, `docs.md` records
  it as pending.
  Coordinator 2026-10-06: deferred to the human after release (documentation
  wording only; verify is unaffected). Reported to the human at release.
- [x] 18. Sync the delta `specs/code-graph/spec.md` into
  `lawbook/specs/code-graph/spec.md`. It is a full copy, and sync overwrites
  the file. Sync **before** `reindex-on-edit` syncs, and notify the
  coordinator so `reindex-on-edit` rebases its `code-graph` delta.
- [x] 19. Archive the change within the same PR (lawbook:archive) after harness
  review/test PASS.

## Rework 1 (review FAIL — `reports/review.md`)

Red evidence for the defects: `reports/.red-rework1.txt` (5 of 28 failing on
the pre-rework `src/`: M1, M2, S1, S2, S3).

- [x] R1. M1 — import bindings and the specifier are read from the full
  statement; only the stored text is capped (`capImportText` keeps the head,
  ` … `, and the trailing `from` clause). Test: an import longer than 1024
  characters resolves and a binding past the cap stays `is_member = 0`
  (`test/unit/resolve-edges.test.ts`).
- [x] R2. M2 — real builtin-globals scenario (`src/runner.ts` defines `test`,
  `test/x.test.ts` calls the global `test(...)`): the edge does not resolve to
  `src/runner.ts`, and explore callers and impact do not list the test file.
  Both by-name arms (`query.ts` callers query and impact CTE) skip
  `BUILTIN_GLOBALS` names unless the edge is in the definition's own file.
- [x] R3. M3 — integration tests in `test/integration/db.test.ts`: "reindex
  after migration recomputes no unchanged embedding" (every file re-extracted,
  `computed === 0`) and the 9→10→11 chain through `openDb` (`edges.is_member`
  exists, cache rows kept).
- [x] R4. S1 — runner inheritance from the nearest ancestor `package.json`
  declaring vitest/jest; design §5.3 and the delta spec amended; test.
- [x] R5. S2 — `node --test` script parsing keeps flag values with their flags,
  drops coverage flags with their values, and treats a directory argument as
  `<dir>/**`; tests.
- [x] R6. S3 — receivers bound by package imports (`node:`, scoped, or
  single-segment bare specifiers; JS/TS only) are foreign (`is_member = 1`);
  design §3 and the delta spec amended; tests.
- [x] R7. S4 — downgrade hazard documented in the 2.0.10 `MIGRATIONS`
  agent prompt (`src/cli/commands/update.ts`), `docs/compass.md`, and the
  compass template, with "run `speclaw update` to re-pin the MCP entry".
- [x] R8. Docs and spec notes: the local/parameter-receiver trade-off in
  `docs/compass.md` (and the template); design §2 notes that package-form and
  array `extends` and `tsconfig.*.json` siblings are not followed; the delta
  spec's "Per-file fragment independence" names `dst_node_id` as a resolution
  cache outside the guarantee.

## Rework 2 (re-review FAIL N1 — `reports/review.md` "Rework 1 — re-review")

Red evidence: `reports/.red-rework2.txt` (3 of 10 failing in
`test/unit/resolve-edges.test.ts` on the post-Rework-1 `src/`: the `@app/*` /
`@myorg/core` paths-alias test, the single-segment `baseUrl` test, and the
imported-builtin O13 test; the S3 package test passes before and after).

- [x] RW1. N1 — option (a): package-ness is decided in `resolveEdges`, not at
  extract time. `isPackageSpecifier` is removed. Extract stores a member call on
  an import binding as `is_member = 2` with the binding's import specifier in
  `edges.spec` (import edges carry their own specifier). `resolveEdges` resolves
  imports first, then binds an `is_member = 2` call only when the same file's
  import with that `spec` resolved to a project file (relative, `paths`, or
  `baseUrl`), preferring that file. Unresolved = package, so `path.parse()` /
  `_.parse()` stay unbound. Scoped passes also re-bind calls in files whose
  import that pass resolved.
- [x] RW2. Schema: `edges.spec TEXT` and `idx_edges_srcfile` join schema 11;
  the 10→11 migration adds `spec` when missing, and a pre-release schema-11
  index without `spec` takes the same in-place step (no wipe). D12 amended in
  design (flagged for human confirmation of the D1 extension).
- [x] RW3. O13 fixed rather than only documented: a builtin-named call whose
  name is an explicitly imported, project-resolved binding
  (`import { fetch } from "./http"`) binds to the import's target file; an
  un-imported global `fetch()` stays unbound. Same mechanism as RW1 (the bare
  call carries the binding's `spec`), no extra cost.
- [x] RW4. Tests (`test/unit/resolve-edges.test.ts`): `@app/*` and Nx
  `@myorg/core` paths aliases keep `svc.getUser()` / `core.boot()` callers in
  explore and impact, plus a scoped `resolveEdges` pass on an unrelated file
  still binds them; single-segment `baseUrl` `utils.fmt()` keeps its caller;
  imported `fetch` keeps its cross-file caller while the global one does not;
  S3 test also asserts the `node:path` / `lodash` edges are `is_member = 2`
  with NULL `dst_node_id`. `test/integration/db.test.ts`: `edges.spec` after
  10→11 and 9→10→11, and the pre-release schema-11 in-place step.
  `test/integration/compass.test.ts`: the import-binding receiver is now
  `is_member = 2` and bound.
- [x] RW5. Design §3/§7 and D12, delta spec (`req~impact-id-first~1`,
  `req~import-resolution~1` cap scenario, `req~schema-edge-membership~1`), and
  `docs/compass.md` updated: package = "import not resolved to a project file
  by relative/alias/baseUrl resolution"; the unfollowed-alias-config trade-off
  and the builtin/import rule are documented.

## Rework 3 (re-review FAIL N2 — `reports/review.md` "Rework 2 — re-review")

Red evidence: `reports/.red-rework3.txt` (5 of 34 failing in
`resolve-edges.test.ts`, `compass.test.ts`, and `hotspots.test.ts` on the
post-Rework-2 `src/`: the Nx pure-barrel test, the relative `./api` barrel
test, the barrel-directory preference test, the extended file-owner leakage
test, and the O16 coupling test).

- [x] RW3-1. N2 — option (a): every file with no symbol nodes, or with an
  `export … from` re-export (`Extraction.reexports`, JS/TS), gets the hidden
  file-owner node, so an import of a pure barrel resolves to it. The call pass
  then binds `core.boot()` / `api.x()` by name, preferring the import target,
  then a definition under the import target's directory (the barrel's
  subtree, standing in for its re-exports), then the same file, else the
  lowest id. A symbol-less file with no references now path-explores to its
  file-owner node (`found: true`, kind `file`).
- [x] RW3-2. Tests: Nx `@myorg/core` → `libs/core/src/index.ts` holding only
  `export * from "./lib/core"` (explore + impact list `load`); relative
  `import * as api from "./api"` over a re-export-only `api/index.ts` (explore +
  impact for `listUsers` and `ping`); barrel-directory preference over a
  lower-id decoy (`is_member` 0 and 2); the file-owner leakage test gains a
  barrel and a symbol-less module and also checks search/find/graphData/compact
  map; the blank-file path-explore expectation becomes the file-owner node.
  Previous alias/baseUrl/package/O13 tests unchanged and passing.
- [x] RW3-3. O15: the import-target subquery is wrapped in
  `CASE WHEN edges.spec IS NULL THEN NULL ELSE (…) END`, the `is_member = 2`
  arm checks `edges.spec IS NOT NULL`, and the directory preference runs only
  for calls with a spec.
- [x] RW3-4. O16: the coupling `in_graph` by-name fallback (`hotspots.ts`)
  matches only `is_member = 0`, non-builtin names, and non-file nodes; test in
  `test/integration/hotspots.test.ts`.
- [x] RW3-5. Design D9, §1.1, §3 (barrels, cost), delta spec
  (`req~impact-id-first~1` text + two barrel scenarios, the symbol-less-file
  explore scenario, coupling `in_graph` rule + scenario), `docs/compass.md`
  (outside the map block), and the compass template updated.
