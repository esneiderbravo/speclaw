# Review: fix-explore-tests-and-callees

**Discipline:** review · **Change:** fix-explore-tests-and-callees (bug, level 3, ships 2.0.10) · **Date:** 2026-10-06 · **Branch:** fix/explore-tests-and-callees · **cwd:** /Users/esneiderbravo/Projects/speclaw

## Verdict: **FAIL**

The core fix is sound. RC1–RC7 are each addressed and each has a red-then-green
test (`reports/.red-before-fix.txt`: 16 of 45 failing on the untouched `src/`;
`.green-after-fix.txt`: 45 of 45 passing). The 10→11 migration is
transactional and keeps embeddings. Consumers handle a null `command`.

Three must-fix items block a PASS:

1. A spec-mandated behavior is broken for long imports (M1).
2. One spec scenario has a test that passes without exercising anything (M2).
3. Two schema scenarios have no test at all (M3).

All three are small. Items S1–S4 are design-level weaknesses that should be
fixed in the same rework if cheap, or else tracked in a follow-up.

## How the review was done

- **Compass calls made: 3.** The calls were `compass_diff_context`,
  `compass_explore resolveImportEdges`, and `compass_find parse`.
  - The MCP server is an **old build** (2.0.9, schema 10). Its index answered
    `changedSymbols: []`, then "0 similar symbols", then `hits: []` with
    `degraded: ["no-embeddings", "focus-unindexed"]`. The index is empty or
    stale, so I could not use it.
  - The likely cause is the downgrade wipe in O1: a 2.0.9 reader treats a
    schema-11 `index.db` as stale and resets it.
  - I therefore read the changed files directly: `db.ts`, `indexer.ts`,
    `extract.ts`, `query.ts`, `affected.ts`, `affected-config.ts`,
    `explore-rich.ts`, `diff-context.ts`, `hybrid.ts`, `map.ts`,
    `visualize.ts`, `drift.ts`, `investigate.ts`, `output-budget.ts`, the CLI
    `query.ts`/`update.ts`, `docs/compass.md`, and the new and changed tests.
- **Not run by the reviewer:** gates and tests. This role has no Bash. The
  evidence above is the implementer's. Tasks 12–15 (full gates, manual checks,
  performance, discipline reports) are still open and belong to the tester.

## Must fix (blocking)

### M1. Imports longer than 1024 characters lose their specifier and bindings
- **Where:**
  - `src/modules/compass/extract.ts:444`:
    `node.text.replace(/\s+/g, " ").trim().slice(0, 1024)`.
  - `indexer.ts:220` `parseImportSpecifier` then runs on that capped text.
- **Problem:**
  - The specifier (`from "…"`) sits at the **end** of the statement. Once the
    collapsed text is longer than 1024 characters, the cap cuts it off. The
    edge never resolves, which is exactly the RC3 class of bug this change
    fixes.
  - `importBindings` also runs on the capped text, so the bindings cut off by
    the cap are lost. `ns.fn()` calls through those bindings then become
    `is_member = 1`, a false negative.
  - This is realistic in the Next.js/alias case that motivated the bug: for
    example, `import { …80 generated types… } from "@/gql/graphql"`.
- **Spec:** `req~import-resolution~1` says the indexer SHALL resolve the
  specifier. The cap must not defeat that.
- **Fix:**
  - Compute the bindings and keep the specifier from the full text, and cap
    only what is stored. For example, keep the head plus ` … ` plus the
    trailing `from "<spec>";`, or always store the `from` clause.
  - Add a unit test with an import longer than 1024 characters that still
    resolves and still yields its namespace binding.

### M2. The "Builtin globals bind only within the file" scenario has a vacuous test, and by-name arms still leak builtins
- **Vacuous test:** `test/unit/resolve-edges.test.ts:149-152` asserts that
  the `test` call edge has `dst_node_id = NULL`. The fixture defines **no**
  project function named `test`, so the assertion would also pass on the old
  code. The scenario (`src/runner.ts` defines `test`, a test file calls the
  global `test(...)`) is never exercised.
- **Leak:** `BUILTIN_GLOBALS` is applied only at resolution time
  (`indexer.ts:168`). The unresolved edge keeps `is_member = 0`, so two
  by-name arms still match it:
  - the callers query, `src/modules/compass/query.ts:300`:
    `e.dst_name = ? AND e.is_member = 0`;
  - the impact CTE, `query.ts:636`:
    `e.dst_node_id IS NULL AND e.is_member = 0 AND e.dst_name = f.node_name`.
- **Effect:** a project function named `test`, `describe`, `fetch`, `print`,
  or `len` still gets every test file as a caller and as a `by-name` impact
  dependent. That is the false-caller/false-impact symptom from bugfix §1.3,
  reintroduced through the fallback.
- **Fix:**
  1. Write the real scenario test: the project defines `test` in
     `src/runner.ts`, `test/x.test.ts` calls the global `test(...)` without
     importing it, and the test asserts that the edge does not point at
     `src/runner.ts`.
  2. Also assert that `compass_impact test` and `explore test` callers do not
     list `test/x.test.ts`.
  3. Skip builtin names in both by-name arms unless the edge is in the same
     file. In the CTE, add
     `AND (e.dst_name NOT IN (<builtins>) OR e.src_file_id = (SELECT file_id FROM nodes WHERE id = f.node_id))`.
     The callers query needs the same rule.

### M3. Two schema scenarios have no test
- **`req~schema-edge-membership~1` / "Reindex after migration recomputes no
  unchanged embedding"** (`Needs: impl, itest`).
  - No test runs `buildIndex` on a migrated schema-10 index, then asserts
    that every file is re-extracted (`stats.files === total`) and that
    `computed === 0`.
  - `test/integration/db.test.ts:72` stops at `openDb`.
- **"Schema 9 migrates forward without wiping embeddings… `edges.is_member`
  SHALL exist"** (requirement "Schema records test and module metadata").
  - Only `migrate9to10` is called directly (`test/unit/fts.test.ts:62`).
  - Nothing exercises the chain 9→10→11 (or 8→…→11) through `openDb`
    (`db.ts:572-583`).
- **Fix:** add both integration tests with `// Covers:` tags.

## Should fix (in this rework if cheap; otherwise a tracked follow-up)

### S1. Runner detection does not look past the nearest `package.json`
- **Where:** `affected.ts:442-498`, specifically the fallback at `:497` and
  grouping by nearest dir at `:322`.
- **Problem:** in hoisted monorepos (pnpm, turbo, or npm workspaces with
  `vitest`/`jest` only in the **root** `devDependencies` and leaf
  `package.json` files without `scripts.test`), a selected
  `packages/x/src/a.test.ts` gets `cd packages/x && node --test src/a.test.ts`.
  That is the wrong runner. It fails loudly rather than passing silently, but
  it is the "command is wrong" symptom again.
- **Fix:** when the nearest package has no `scripts.test` and no runner
  dependency, inherit the runner from the nearest ancestor `package.json` up
  to the root.
- This conforms to design §5.3 ("no scripts.test and no known dependency →
  `node --test`"), so it is a design gap. Amend the design line if you fix it.

### S2. `node --test` token parsing confuses flag values with test globs
- **Where:** `affected.ts:394-396` (`isTestPositional`) and `:459-460`.
- **Flag values:** any token containing `/` or `*`, or ending in a JS/TS
  extension, counts as a positional glob. Two failures follow:
  - `node --import ./register.mjs --test 'test/**/*.test.ts'` keeps
    `--import` with no value and treats `./register.mjs` as a test glob.
  - In `--test-coverage-lines 80` (space-separated), the coverage flag is
    dropped but `80` stays behind.
- **Directory positionals:** a directory positional such as
  `node --test test/` has the last segment `""`. Every file is then classified
  as a `helper` (`mapOntoGlobs`, `:422-427`), so the result is
  `command: null` with the reason "no runnable test file" even though tests
  were selected.
- **Fix:**
  - Consume the values of known value-taking flags (`--import`, `--require`,
    `-r`, `--loader`, `--experimental-loader`, `--env-file`,
    `--test-reporter`, `--test-reporter-destination`, and the spaced
    `--test-coverage-*` and `--test-name-pattern`).
  - Treat a directory positional (no glob, no extension) as "matches
    everything under it".

### S3. Package-namespace receivers still bind globally (residual false callers)
- **Where:** `extract.ts:465-467`. Any receiver that is an import binding gets
  `is_member = 0`, including **package** imports.
- **Concrete case in this repo:** `path.parse(...)` (`query.ts:247`, with
  `import path from "node:path"`) binds by name to
  `src/modules/compass/parser.ts:32 parse`, so `pickPrimary` becomes a false
  caller of `parse`. `fs.readFileSync`, `path.join`, and similar calls do the
  same against any same-named project function.
- **Fix:** classify bindings that come from bare specifiers (no `.`/`/`
  prefix, `node:` scheme, or a non-alias package name) as foreign, so they get
  `is_member = 1`. Alias-prefixed specifiers can stay `0`.
- This matches design §3 as written, so the follow-up needs a design note.

### S4. Downgrade and pinned-MCP ping-pong wipes the embedding cache
- **Where:** `db.ts:296-303` (behavior of the *old* binary).
- **Problem:** any ≤2.0.9 binary (including an MCP entry pinned at
  `@2.0.9`, or a stale global CLI) that opens a schema-11 index sees
  `ver !== "10"`, so `isStale` returns true and `resetSchema` runs. That drops
  `embedding_cache` too. The next 2.0.10 open recreates the database. The
  empty MCP index observed during this review fits that pattern.
- **Fix:** the old code cannot change. Document the hazard:
  - add a sentence to the 2.0.10 `MIGRATIONS` entry (`update.ts:298-310`)
    and to `docs/compass.md`: "run `speclaw update` so the pinned MCP entry
    moves to 2.0.10; an older speclaw opening this index rebuilds it from
    scratch";
  - include the same line in the CHANGELOG lines handed to the coordinator.

## Observations (non-blocking)

- **O1. Migration correctness.** This part is good.
  - `migrate10to11` (`db.ts:512-544`) is one `BEGIN IMMEDIATE` transaction:
    it adds the column if missing, sets `needs_reindex` and `reindex_reason`,
    stamps `11`, and rolls back on error. The rollback test uses a forced
    `RAISE(ABORT)` trigger.
  - `buildIndex` treats `needs_reindex` as force (`indexer.ts:519`), so every
    file is re-extracted. The cache lookup (`:715`) reuses vectors.
  - `isStale` now also requires `is_member` for a schema-11 stamp
    (`db.ts:307-313`).
  - The 8→9→10→11 chain is sequential, with each step committed, so a failure
    in a later step leaves the earlier stamp intact.
- **O2. Hidden file-owner nodes.** I audited every `FROM nodes` / `JOIN nodes`
  in `src/`. The filters are present in:
  - find (LIKE list `hybrid.ts:180`, metadata `:206`, `search` `query.ts:80`);
  - explore name lookup (`query.ts:414`) and impact symbol seeds (`:791`);
  - totals (`indexer.ts:871`), the map count (`map.ts:25`), PageRank rows
    (`indexer.ts:925`), and hotspots (`hotspots.ts:100`);
  - visualize (`visualize.ts:64,71`), drift (`drift.ts:131`), and investigate
    (`investigate.ts:90`).

  They are safely excluded elsewhere:
  - FTS, `node_text`, embeddings: the file node has no `node_text` row and a
    NULL `content_hash`.
  - Metrics: no `insMetrics` call.
  - Anchors: `anchors.ts:167` already restricts kinds.
  - `drift.ts:142` (lookup by `norm_hash`): `norm_hash` is NULL for file
    nodes.
  - `hybrid.ts` ego expansion may add a file-node id. It never becomes a hit,
    because it has no metadata (comment at `:201`).

  No leaks found.
- **O3. resolveEdges.**
  - The full and scoped modes are equivalent on the fixture
    (`test/unit/resolve-edges.test.ts:58`).
  - The dangling reset (`indexer.ts:140-143`) is correct, and the scoped
    re-point is tested.
  - Caveat: in scoped mode, a reset edge whose name is defined only outside
    `fileIds` (the target file was deleted) stays NULL until a full pass.
    That is acceptable for `reindex-on-edit`, but note it in that design.
  - Spec tension: the reset updates `edges` rows owned by *other* files. That
    literally contradicts the scenario "Reindexing A leaves B untouched"
    (requirement "Per-file fragment independence"). Clarify in the canonical
    spec that `dst_node_id` is a resolution cache, outside the guarantee.
- **O4. Alias resolution.** Covered:
  - nearest `tsconfig.json`/`jsconfig.json`, bounded by the root;
  - relative `extends` (depth 6 with a cycle guard);
  - JSONC handling, longest-prefix ordering, and `baseUrl` that falls back to
    the declaring config's directory;
  - parse failure that disables aliases only.

  Not handled (acceptable, should be documented): package `extends`
  (`@tsconfig/...`), the TypeScript 5 array form of `extends`, and
  `tsconfig.*.json` siblings. One cosmetic issue: the trailing-comma regex in
  `stripJsonComments` (`indexer.ts:385`) also rewrites `,}` inside string
  literals.
- **O5. The default `test` target globs (`**/src/**`, `**/test/**`,
  `**/tests/**`) do not over-select tests.** They only stop filtering *seed*
  files. Tests are still reached only through the graph. Side effects:
  - "not indexed" warnings for non-code seeds under those paths;
  - the pre-existing loose `**/` regex (`affected-config.ts:117-121`, where
    `**/test/**` also matches `contest/`).

  Still not admitted: root-level `lib/**` and `app/**` (Next.js without
  `src/`). Those changes are filtered out and now report a null command with
  "no test file is reachable", which is misleading. Consider an `**`-minus-
  ignore default for the `test` target in a follow-up.
- **O6. Shell safety.** All paths and cwds go through `shellQuote`
  (`affected.ts:525-528`, which quotes `*`, `?`, spaces, and quotes). Script
  flags are re-quoted after `shellSplit`. The compound
  `(cd … && …) && (…)` is POSIX-only, as documented.
- **O7. Null-safety of `.command` consumers.** These handle null:
  - the CLI text mode (`cli/commands/query.ts:171-176`) and JSON mode
    (passthrough);
  - `explore-rich.ts:132-138` and `diff-context.ts:134-141`;
  - the alias description (`register.ts:217`).

  `investigate.ts` and `levels.ts` do not read `.command`; only test counts
  are used.
- **O8. Member-call trade-off.** Design §3 classifies `svc.run()` and
  `this.db.query()` (any non-`this`/non-import receiver) as
  `is_member = 1`. Instance-method callers through locals and parameters
  therefore disappear from `callers` and from the call arm of impact.
  Affected-test selection mostly survives through the file-scoped import arm.
  Say this explicitly in `docs/compass.md:66-74` and `api.md` ("method calls
  on local/parameter receivers are not bound").
- **O9. Blast radius not listed in bugfix §4.**
  - `src/modules/foundation/graph.ts:29-37` and `deps.ts:45` (law cycle and
    dependency checks) consume resolved import edges.
  - Multi-line and alias imports are now visible, so
    `speclaw verify`/`laws check` may report new truthful edges (and
    `import type` edges) in this repo and in consumers.
  - The tester should run `speclaw verify` and record the result in
    `backend.md`.
- **O10. Accepted deviations.**
  - **History kept.** `update.ts:236` was left alone, because it belongs to
    the historical 1.0.0 migration text. A new 2.0.10 `MIGRATIONS` entry was
    added (`:298-310`) instead of editing history. That is correct. Record it
    in `docs.md` as a deviation from design §10.
  - **Resolver location.** `resolveEdges` derives the project root from the
    database path (`indexer.ts:181-185`) rather than taking a parameter. That
    is fine, but `reindex-on-edit` D16 should note it.
- **O11. Covers tags.**
  - `// Covers:` tags exist for all six requirement ids in `src/` and the
    tests.
  - `req~explore-file-path~1` is gone from `src/` and `test/`. It remains
    only in the canonical spec until sync (task 18).
  - Once M2 and M3 are done, run `speclaw coverage` to confirm that no
    scenario of the six ids is reported as a defect.
- **O12. Performance.** `resolveEdges` adds one full-table dangling-reset
  scan per non-no-op run. It also re-parses every still-unresolved import
  (bare packages) on each run; the cost is bounded by cached per-directory
  config lookups and in-memory probes. The no-op fast path still skips
  `resolveEdges`. Expect a small cost for full indexing. Task 14 must show it
  is within the 15% budget.

## Rework guidance (for `cortex rework`)

1. **M1:** in `extract.ts:444`, preserve the specifier and bindings when
   capping. Add a test with an import longer than 1024 characters that still
   resolves.
2. **M2:**
   - Replace the vacuous assertion with the real builtin-global scenario test.
   - Exclude builtin names from the by-name arms in `query.ts:300` and
     `query.ts:636` unless the edge is in the same file, and assert this in
     impact and callers.
3. **M3:** add integration tests for the reindex after the 10→11 migration
   (all files re-extracted, `computed === 0`) and for the 9→11 chain through
   `openDb` (`is_member` exists, cache rows kept).
4. **S1–S4:** fix them now, or record each as an explicit follow-up in
   `tasks.md`/`design.md`. If deferred, S4 (the documentation line) is the
   minimum.
5. Then hand back for re-review. Tasks 12–15 remain the tester's.

---

## Rework 1 — re-review

**Date:** 2026-10-06 · **Scope:** tasks.md R1–R8, red evidence
`reports/.red-rework1.txt` (5 of 28 failing on the pre-rework `src/`).

### Verdict: **FAIL** (one blocking item, R6/S3)

M1, M2, M3, S1, S2, S4 and R8 are resolved. The S3 fix over-reaches: it
classifies common project alias specifiers as packages, which turns a false
positive into a false negative. Details in N1.

**Compass calls made: 1** (`compass_explore capImportText` returned "No exact
symbol", because the MCP build is still the old 2.0.9 index). After that I read
the files directly. Gates and tests were not run (this role has no Bash).

### Verified

- **M1 (R1), resolved.** `extract.ts:499-508`:
  - `importBindings` and `importSpecifier` read the full collapsed text. Only
    `capImportText` (`:171-178`) bounds what is stored.
  - Cap arithmetic: `head (1024 − tail − 3) + " … " (3 UTF-16 units) + tail`
    is exactly 1024.
  - If the tail is missing or longer than 512, the code falls back to a plain
    slice. That fallback only matters for Python (whose module is at the head)
    or for pathological specifiers.
  - The stored tail keeps `from "<spec>"`, so `importSpecifier(edge.dst_name)`
    in `indexer.ts:221` still parses it.
  - Test: `resolve-edges.test.ts:185-223` uses 121 names with `client` past
    the cap, and asserts the stored length, the trailing `from` clause, the
    resolution, and `is_member = 0`. It failed on the old code.
- **M2 (R2), resolved.**
  - Both by-name arms carry the same-file exception: the callers query at
    `query.ts:303-307` (the third bind parameter is `best.id`) and the impact
    CTE at `:651-653` (`f.node_id`). Both are correct.
  - `BUILTIN_SQL_LIST` (`indexer.ts:106`) is built from a constant literal
    array, so there is no injection surface.
  - The real scenario test (`resolve-edges.test.ts:225-266`) asserts the edge
    rows, the explore callers, and the impact. On the old code it failed at
    the callers assertion.
- **M3 (R3), resolved.** `test/integration/db.test.ts`:
  - `:124-152` rewinds a built index to schema 10, then asserts `files === 3`,
    `unchanged === 0`, `computed === 0`, `fromCache === first.computed`, and
    that the marker is cleared.
  - `:155-197` rewinds to the schema-9 shape and opens it with `openDb`. It
    asserts the schema version, that `is_member` exists, that `node_text`
    exists, the marker, and that the cache count is unchanged. A
    `resetSchema` wipe would fail the cache assertion, so the test
    discriminates.
- **S1 (R4), resolved.** `affected.ts:410-432` `inheritedRunner`:
  - It applies only when the leaf has no `scripts.test` and no runner
    dependency.
  - The nearest declaring ancestor wins, and only the vitest/jest dependencies
    are merged in.
  - The reason names the source package.
  - The test covers the root and the nearest-ancestor cases.
- **S2 (R5), resolved.** `affected.ts:440-487` `splitNodeTestArgs`:
  - Value flags keep their value. The `=` form stays a single token.
  - Coverage flags are dropped together with their value.
  - A directory positional becomes `<dir>/**`.
  - The test covers `--import ./register.mjs`, `--test-coverage-lines 80`, and
    `test/`.
  - Minor, non-blocking:
    - Unknown value flags (for example `--watch-path x`) still misparse.
    - With a `<dir>/**` glob, every selected file is "test-shaped", so a
      selected helper under that directory is passed to `node --test`
      explicitly. That is harmless: it runs zero tests.
- **S4 (R7), resolved.** The hazard and the "run `speclaw update`" line are in:
  - `update.ts:306-310` (the 2.0.10 agent prompt);
  - `docs/compass.md:108-112`;
  - `compass.template.md:47-49`.
- **R8, resolved.**
  - The local/parameter receiver trade-off is in `docs/compass.md:77-79`.
  - The delta spec (`:684`) names `dst_node_id` as a resolution cache.
  - Design §2 notes that `extends` forms are not followed.

### N1 (blocking). `isPackageSpecifier` classifies resolvable project aliases as packages

- **Where:**
  - `src/modules/compass/extract.ts:189-193` decides the classification at
    extract time, without the tsconfig.
  - `:502-505` adds such bindings to `packageBindings`.
  - `:527` then forces `is_member = 1` on calls through them.
- **The bad cases.** The resolver in the same change (`indexer.ts:277`,
  `AliasResolver.candidates`) resolves these imports to project files, yet
  calls through their bindings are now foreign:
  - Scoped-looking `paths` aliases, for example `"@app/*": ["src/app/*"]`
    (common in Angular and NestJS) or `"@myorg/core": ["libs/core/src/index.ts"]`
    (Nx). `import * as svc from "@app/services/user"; svc.getUser()` loses
    `getUser`'s caller.
  - Single-segment `baseUrl` modules or exact `paths` keys, for example
    `import * as utils from "utils"` with `baseUrl: "src"`.
  - In both cases the import edge resolves, but `svc.getUser()` /
    `utils.fmt()` get `is_member = 1`. The callers and the impact call arm
    lose them.
  - This contradicts the stated over-approximation policy (`query.ts:291-293`)
    and the S3 guidance ("non-alias package name … alias-prefixed specifiers
    can stay 0").
- **Correctly classified as project code:** `~/x`, `#internal`, `@/x`,
  relative paths, and multi-segment bare paths. These match the unit test at
  `resolve-edges.test.ts:293-300`.
- **Not regressed:** affected-test selection, which uses the file-scoped
  import arm.
- **Fix (pick one):**
  - (a) Defer the package decision to resolution. Store the receiver's
    binding-specifier status on the edge, or keep `is_member = 0` at extract
    time. Then in `resolveEdges`, mark a call as foreign only when its
    receiver's import edge stayed unresolved (a true package).
  - (b) Give `extract` a predicate built from `AliasResolver`, so that a
    specifier matching a `paths` key or resolving under `baseUrl` is project
    code.
- **Tests and docs:**
  - Add a test with `"paths": { "@app/*": ["src/app/*"] }` and
    `import * as svc from "@app/svc"; svc.run()`: `run`'s callers must include
    the caller.
  - Add a test with `baseUrl: "src"` and `import * as utils from "utils"`.
  - Amend design §3 and delta spec `:34-35` to say "package = unresolved by
    the project's alias/baseUrl config", not "scoped or single-segment".

### Observations (non-blocking)

- **O13.** The builtin same-file rule also drops an *explicitly imported*
  project function named like a builtin (`import { fetch } from "./http"`).
  This is the pre-existing design (§4) and is acceptable, but note it in
  `docs/compass.md`.
- **O14.** The red run stops at the first failing assertion in each test.
  Whether the impact assertion in R2 fails on the old CTE is shown by reading
  the code, not by observation.

### Rework guidance

1. Fix N1 as above (option (a) is preferred because it reuses the resolver),
   with the two alias tests.
2. Record red-before-green for the new tests in `reports/.red-rework2.txt`.
3. Hand back for re-review. Tasks 12–15 remain the tester's.

---

## Rework 2 — re-review

**Date:** 2026-10-06 · **Scope:** tasks.md RW1–RW5, red evidence
`reports/.red-rework2.txt` (3 of 10 failing on the post-Rework-1 `src/`: the
`@app/*`/`@myorg/core` test, the `baseUrl` test, and the O13 test).

### Verdict: **FAIL** (one blocking item, N2: pure re-export barrels)

The mechanism is right, and the cases that were tested are handled. RW1 (option
(a)), RW2, RW3 and RW5 are correct. The remaining problem: the Nx
`@myorg/core` case that motivated N1 still loses its callers in its
**realistic** form, a pure `export * from` barrel. The fixture hides this
because its `index.ts` defines `boot` itself.

**Compass calls made: 1** (`compass_explore resolveEdges` → "No exact symbol";
the MCP build is still 2.0.9). Files were read directly. Gates and tests were
not run (no Bash). No green run for Rework 2 is recorded under `reports/` yet;
the tester owes it.

### Verified

- **Ordering (RW1).** `resolveEdges` (`indexer.ts:150-204`) runs these steps in
  order:
  1. the dangling reset;
  2. `resolveImportEdges` (all unresolved imports, every pass);
  3. the call pass.

  `importTarget` is a correlated subquery against same-file import edges with
  `i.spec = edges.spec` that already resolved. Its effects:
  - `is_member = 2` binds only when an import target exists;
  - the import target is preferred in `ORDER BY`;
  - when the name is absent there, it falls back to a same-file match, then
    to the lowest id.

  `path.parse()` / `_.parse()` stay NULL (asserted at
  `resolve-edges.test.ts:293-306`).
- **Scoped passes.** `srcFiles` holds the files whose import was resolved
  **in this pass**. That set covers every case:
  - a new file that satisfies an old import;
  - a re-extracted target, because its importers' import edges dangle, get
    reset, and are re-resolved, so those importers enter `srcFiles`;
  - the importing file itself.

  The placeholder order `[...ids, ...importScope, ...ids]` matches the SQL
  text. The `> 10 000` fallback runs unscoped, which is correct but slower.
  `ids = []` produces `IN (NULL)`, which is harmless. The test at `:350-371`
  runs a scoped pass on an unrelated file and still binds `boot`/`getUser`.
- **Spec matching per file.** `bindingSpecs` is a per-file `Map`. A duplicate
  local binding is a TS compile error, so last-wins is moot. Two imports with
  the same `spec` (`import type {X}` + `import * as a` from `"./a"`) resolve to
  the same file, so `ORDER BY i.id LIMIT 1` is deterministic and gives the
  same answer either way.
- **O13 (RW3).** A bare call keeps `is_member = 0` and gets the binding's
  `spec` (`extract.ts:530`). The builtin guard admits
  `n.file_id = importTarget`. A global `fetch()` with no import stays NULL, and
  the query-time by-name arms keep the same-file rule. The test at `:394-414`
  covers explore and impact.
- **Python unaffected.** `spec` is always NULL for Python (`extract.ts:500`).
  Receivers bound by an import get `0`, others `1`, which is unchanged from
  Rework 1. Python import edges still never resolve (`importSpecifier` needs
  quotes); that is pre-existing and out of scope.
- **Consumers of `is_member`.** Only the two by-name fallbacks read it:
  - `query.ts:304`;
  - `query.ts:653`.

  Both use `= 0`, so values 1 and 2 are excluded alike. The spec text at
  `:26` ("other than 0") agrees.
- **Migration (RW2).** It is idempotent and safe:
  - `migrate10to11` adds each column only when missing (`db.ts:538-543`);
  - `isStale`/`openDb` route an `"11"` stamp without `spec` to the same step
    (`:309`, `:593`) instead of wiping;
  - `needs_reindex` is set, so `spec` gets filled by re-extraction;
  - `idx_edges_srcfile` comes from `CREATE INDEX IF NOT EXISTS` in the DDL,
    which re-runs after migrating.

  Tests cover 10→11, 9→10→11, and the pre-release schema-11 path with the
  cache kept (`db.test.ts:99-118`, `:220`).

### N2 (blocking). An import of a node-less file (pure re-export barrel) is treated as a package

- **Where:**
  - `indexer.ts:761`: a file gets a file-owner node only when it has orphan
    refs.
  - `export … from` is not an import node (`languages.ts:78,107`), so a barrel
    `libs/core/src/index.ts` containing only `export * from "./lib/core";` has
    **zero nodes**.
  - `resolveImportEdges` (`indexer.ts:262-263`) does map the specifier to that
    project file, but `target.get(fileId)` is undefined, so the import edge
    stays NULL.
  - `importTarget` is then NULL, so every `core.boot()` (`is_member = 2`) is
    left unbound.
- **Effect:** `import * as core from "@myorg/core"; core.boot()` (and relative
  `import * as api from "./api"` over `api/index.ts`) loses `boot`'s callers in
  explore and impact. On `main` and before Rework 1 these calls were bound by
  name, so this is a regression. It is also the exact Nx case N1 named.
- **Spec and design conflict:**
  - Delta spec `:36-39` defines a package as an import that "no relative,
    `paths`, or `baseUrl` resolution maps to a project file". This barrel
    *does* map to a project file.
  - Design §3 (`design.md:137-139`) claims "a barrel that re-exports still
    falls back to the name match". That holds only for barrels with their own
    nodes.
- **Fix (cheapest first):**
  - (a) Give a file-owner node to every indexed file with no symbols (or with
    a re-export), so the import resolves to it. `importTarget` is then the
    barrel, and the by-name fallback binds `boot` in `lib/core.ts`, which is
    what design §3 already describes.
  - (b) Alternatively, treat `export_statement` nodes with a `source` as
    import refs. This also makes barrels transitive for the file-level import
    arm, which helps affected-test selection.
- **Test:** change or add a fixture where `libs/core/src/index.ts` is
  `export * from "./lib/core";` and `boot` lives in `libs/core/src/lib/core.ts`.
  Assert that `load` is a caller of `boot` in explore and impact, for both the
  namespace import and a relative `./api` barrel. Record the red result for
  this test.

### Observations (non-blocking)

- **O15. Call-pass cost.**
  - `importTarget` is correlated and appears three times per candidate: in
    the outer `WHERE`, in the inner `WHERE`, and in `ORDER BY`. It also runs
    for calls whose `spec` is NULL, where it can never match.
  - `idx_edges_srcfile` keeps each evaluation to one file's imports. Even so,
    the cost is roughly calls × candidates × imports-per-file.
  - A cheap guard is
    `CASE WHEN edges.spec IS NULL THEN NULL ELSE (…) END`, or
    `edges.spec IS NOT NULL AND` before the subquery.
  - Task 14 must show the full-index time is within the 15% budget.
    `resolveImportEdges` still re-probes every package import on each scoped
    pass (O12). That matters for `reindex-on-edit`.
- **O16.** `hotspots.ts:245-257`, the coupling `in_graph` by-name fallback,
  ignores `is_member`. As a result, `path.parse()` still marks `use.ts` ↔
  `parser.ts` as "in graph". This heuristic is pre-existing from Rework 0.
  Add `AND e.is_member = 0` in a follow-up.
- **O17.** Bare calls to a binding from a package
  (`import { parse } from "yaml"; parse()`) still bind by name to a project
  `parse`. Design §3 states this explicitly and keeps it out of scope.
  Accepted.

### Rework guidance

1. Fix N2 with (a) or (b), add the barrel test(s), and record red-before-green
   in `reports/.red-rework3.txt`.
2. Correct design §3's barrel sentence to match the behavior.
3. Optionally guard `importTarget` on `edges.spec IS NOT NULL` (O15).
4. Hand back for re-review. Tasks 12–15 remain the tester's.

---

## Rework 3 — re-review

**Date:** 2026-10-06 · **Scope:** tasks.md RW3-1..RW3-5, red evidence
`reports/.red-rework3.txt` (5 of 34 failing on the post-Rework-2 `src/`), green
evidence `reports/.green-rework3.txt` (34 of 34; full `npm test` 869/869 per
its header).

### Verdict: **PASS**

N2 is fixed using option (a). O15 and O16 are addressed. The earlier fixes
(M1, M2, N1, and O13) are unchanged and their tests still pass in the green run.
I found no correctness, regression, or spec-contract defect. Everything below
is a follow-up.

**Compass calls made: 1** (`compass_explore resolveEdges` → "No exact symbol";
the MCP server is still the old build). I read the files directly. I did not
run gates or tests (this role has no Bash). Tasks 12–15 still belong to the tester.

### Verified

- **N2 (RW3-1).**
  - `extract.ts:523-526` collects `export … from` sources into
    `Extraction.reexports`. This applies to JS/TS only (Python is skipped).
    Plain `export function` has no `source`, so it is ignored.
  - `indexer.ts:780` creates the file-owner node when
    `refs.some(isOrphan) || symbols.length === 0 || reexports.length > 0`.
  - `resolveImportEdges` prefers the file-owner node (`:251`). A barrel import
    therefore resolves, and `importTarget` becomes the barrel.
  - The red run shows both barrel tests failing on a NULL import. The green
    run shows them passing.
- **Binding order** (`indexer.ts:202-216`):
  1. the import target;
  2. a definition under the target's directory (`underTargetDir`), only when
     `edges.spec IS NOT NULL`;
  3. a definition in the same file;
  4. the lowest id.

  This matches delta spec `:42-44` and design §3/D9. The directory test is
  correct:
  - `rtrim(p, replace(p,'/',''))` gives the directory with its trailing `/`;
  - the prefix compare includes that `/`, so `libs/core2/` does not match
    `libs/core/`.
- **No wrong bindings beyond the old name match.** The subtree tier only
  reorders candidates that the old query could already pick. The name, the
  `kind <> 'file'` check, and the builtin guard are all unchanged. The tier
  applies only to calls that carry an import `spec`. For such a call:
  - a same-file definition with the same name is either a TS redeclaration
    conflict (a bare call), or not the target at all (`ns.x()`);
  - so losing the same-file tie-break costs nothing.
  - The old lowest-id pick was arbitrary. The red output shows it binding
    `boot()` to the decoy `src/legacy/boot.ts`.
- **No file-node leakage.** The new file nodes (barrels, symbol-less modules)
  have no `node_text`, embedding, or metrics. Every `nodes` consumer still
  filters `kind <> 'file'`; I re-checked with a grep:
  - `hybrid.ts:180,206,327`, `query.ts:81,234,427,811`, `indexer.ts:184,206,917,971`;
  - `map.ts:25`, `visualize.ts:64,71`, `hotspots.ts:101,253`;
  - `diff-context.ts:59`, `drift.ts:131`, `investigate.ts:90`.

  `stats.nodes` counts only symbols. The extended leakage test checks
  search, find, `graphData`, and the compact map with a barrel and a
  symbol-less module, and it fails red. Barrels own no call edges, so they
  cannot appear as callers.
- **Impact through files that have both symbols and re-exports.** Imports of
  such a file now point at its file-owner node instead of its first symbol.
  The impact import arm (`query.ts:659-665`) matches by `dn.file_id`, so the
  result does not change.
- **Explore of a symbol-less file** (`query.ts:355-366`). It returns the
  file-owner node with `found: true`, kind `file`, and the message "declares
  no symbols; resolved to its file-owner node". This matches the new delta
  scenario `:956-962`. A path with no node at all keeps the old fallback.
- **O15 (RW3-3).** `importTarget` is wrapped in `CASE WHEN edges.spec IS NULL`.
  The `is_member = 2` arm checks `edges.spec IS NOT NULL`, and the directory
  tier is guarded the same way.
- **O16 (RW3-4).** The `hotspots.ts:248-260` by-name fallback now requires
  `is_member = 0`, a non-builtin name, and a non-file node. The test failed
  red (`inGraph: true`) and passes green.
- **Docs and spec.** These match the code:
  - design D9 and §3, including the documented limits (out-of-directory
    re-exports, and barrels that are not transitive for the impact import
    arm);
  - delta spec `:17-19`, `:33`, and `:42-44`, and the scenarios `:113-126`
    and `:956-962`;
  - `docs/compass.md:62,76-78`.

### Follow-ups (non-blocking)

- **F1. Root-level and Windows paths.** If the import target has no `/`
  (a root-level file such as `index.ts`), its directory is `""`. The whole
  repo then counts as "under the target", so the order falls to the lowest
  id. Stored `\` paths behave the same way. This is no worse than before;
  the same-file tie-break argument above applies.
- **F2. Builtin names through a barrel.** In
  `import { fetch } from "./barrel"; fetch()`, the call stays unbound. The
  builtin guard admits only the import-target file, not its subtree. This is
  conservative and matches spec `:46-48`.
- **F3. Barrels and the impact import arm.** Re-exports from outside the
  barrel's directory, and passing through barrels in the impact import arm,
  are still unhandled. Both are documented in design §3. Option (b) from the
  N2 guidance (re-exports as import refs) is the follow-up, and it helps
  affected-test selection.
- **F4. Scoped passes leave bound edges alone.** A scoped pass re-binds only
  NULL and dangling edges. A better candidate added later, such as a new
  definition under a barrel subtree, does not re-rank an edge that is
  already bound. The scoped and full results can differ until the next full
  index. Note this in `reindex-on-edit`.
- **F5. Cost of `underTargetDir`.** `underTargetDir` evaluates `importTarget`
  again for each candidate of a spec-bearing call. Task 14 (performance,
  15% budget) must cover it.
- **Carried open items:** O12 (package imports are re-probed on each scoped
  pass) and O17 (bare calls to package bindings) remain open.

### Next

Hand back to the coordinator for `cortex advance`. Tasks 12–19 remain:

- tester: gates, manual checks, performance, and discipline reports;
- human: the strict-path accept;
- then sync and archive.
