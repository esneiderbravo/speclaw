# Design — fix-explore-tests-and-callees

Level 3, bug change. The red-before-green rule applies: every regression test in
`bugfix.md` §6 is written first, and its failing output is saved to
`reports/.red-before-fix.txt` before any `src/` edit. Line references point into
the working tree at drafting time (explorer RCA).

## Decisions

| # | Decision | Source |
|---|----------|--------|
| D1 | Schema **11** adds `edges.is_member INTEGER NOT NULL DEFAULT 0`. The 10→11 migration forces a full re-extract and keeps `embedding_cache`. | human |
| D2 | The synthetic file-owner node is hidden from `compass_find` and from name-based explore by default. Explore of a **file path** may resolve to it. | human |
| D3 | This change lands first. It extracts `resolveEdges(db, fileIds?)`, which `reindex-on-edit` reuses. | human |
| D4 | Level 3. | human |
| D5 | `command: string \| null` plus `commandReason: string`. A command that runs nothing is never emitted. | coordinator |
| D6 | The runner is detected from the nearest `package.json` (`scripts.test`, then `devDependencies`/`dependencies`): `node --test`, vitest, or jest. | coordinator |
| D7 | A workspace-spanning selection returns `commands: [{ cwd, command, files }]` (always present, possibly empty). `command` is the single group's command, or a POSIX compound for several groups (§5.4). | coordinator, justified here |
| D8 | Callees list only resolved edges, plus `unresolvedCallees: { count, sample }` and a small builtin denylist as a safety net. | coordinator |
| D9 | The file-owner node is created for files with at least one orphan reference (a top-level import, or a call with no enclosing definition). **Amended in Rework 3 (N2):** also for every file with no symbol nodes and every file with an `export … from` re-export (a barrel), so an import of such a file resolves to it instead of looking like a package. Every indexed file therefore has at least one node. | planner, implementer (Rework 3) |
| D10 | Every top-level import is owned by the file-owner node, not by `nodeIds[0]` as today. A file's imports belong to the file, not to its first function. | planner |
| D11 | Import edges resolve `dst_node_id` to the target file's file-owner node when that node exists, otherwise to the target file's first node by `start_line`. The impact import arm is file-scoped (`query.ts:595-599`), so either target propagates the same way. | planner |
| D12 | The receiver is classified at extract time. No receiver column is stored (D1 allows only `is_member`). **Amended in Rework 2 (coordinator decision, 2026-10-06: within the human-approved, still-unreleased schema 11 bump; reported to the human at release):** whether an import-bound receiver is a package needs the project's alias/baseUrl config, which extract does not have, so the binding's import specifier is stored in a nullable `edges.spec TEXT` and the decision is made in `resolveEdges` (§3). No receiver name is stored. | planner, implementer (Rework 2) |
| D13 | `req~explore-file-path~1` becomes `~2`. Its old text said resolution "invents no file-level nodes", which is no longer true at the index level. `// Covers:` tags move to `~2`. | planner |
| D14 | `CLAUDE.md`/`AGENTS.md` schema mentions (`CLAUDE.md:42,152`, `AGENTS.md:105,140`) are **not** edited by agents. They are strict lock paths, so a human edits them and runs `speclaw laws accept` on a TTY (task). | human (lock rule) |
| D15 | Implementation starts after `harden-update-lock-and-cli` has a test PASS on the shared branch. | coordinator |

## 1. File-owner node (RC1, RC2) — `req~impact-id-first~1`

### 1.1 Extraction (`extract.ts`, `indexer.ts:367-494`)

- The extractor keeps reporting references with `ownerIndex` (`extract.ts:344`).
  A null owner now means "the file".
- In the per-file write (`indexer.ts:~465-480`):
  1. Count the orphan references. That is every import, plus every call whose
     `ownerIndex` is null.
  2. If the count is above 0, **or the file has no symbols, or it has an
     `export … from` re-export** (Rework 3, N2: the extractor reports JS/TS
     re-export specifiers in `Extraction.reexports`; a re-export is not an
     import reference and binds no local name), insert one node:

     | Column | Value |
     |--------|-------|
     | `kind` | `'file'` |
     | `name` | repo-relative path |
     | `start_line` | 1 |
     | `end_line` | last line |
     | `start_byte` | 0 |
     | `end_byte` | `text.length` (UTF-16, per the offset contract) |
     | `signature` | NULL |
     | `body_hash` | NULL |
     | `content_hash` | NULL |
  3. Use its id as the `src_node_id` for every orphan reference.
- Export a constant `FILE_NODE_KIND = "file"` from the compass barrel, so the
  filters below use one name.
- **Invariant:** after a schema-11 index, `SELECT COUNT(*) FROM edges WHERE
  src_node_id IS NULL` = 0. A test asserts this.

### 1.2 Hiding (each one has a filter and a test assertion)

| Surface | Where | Rule |
|---------|-------|------|
| `compass_find` (FTS, KNN, exact-name lists) | `search.ts` / `query.ts` find | No `node_text`, no `content_hash`, so no embedding. Exact-name SQL adds `kind <> 'file'`. |
| Explore name lookup | `query.ts` `explore` | `kind <> 'file'` in the exact and fuzzy symbol lookups. |
| Explore by path | `exploreWhenNameMisses` | If the resolved file has visible symbols, today's rule applies. If its only node is the file node, return it as primary (`found: true`, kind `file`), with callees and affected tests. |
| PageRank | rank build | The file node gets no `pagerank` row and is not a ranked symbol. Its outgoing edges count as references from its file in the file–symbol graph. |
| `node_metrics`, hotspots | indexer metrics, hotspots | No metrics row. Hotspot health ignores it. |
| `totals.nodes`, compact map (`docs/compass.md`) | index stats, map writer | `kind <> 'file'`. |
| Drift anchors / lawbook | `lawbook` drift seal | Skip `kind = 'file'` (it has no `body_hash`). |
| Impact output | `query.ts:606-620` | Kept. A file node in the closure is a real dependent. It is reported with `kind: "file"`, and `affectedTests` uses its file's `is_test`. |
| Callers | `query.ts:268` | Kept, as a `kind: "file"` entry named by its path. |

### 1.3 Impact CTE (`query.ts:571-621`)

- The owner join is unchanged. Edges are no longer NULL-owned.
- The by-name arm `(e.dst_node_id IS NULL AND e.dst_name = f.node_name)` gains
  `AND e.is_member = 0` (RC5).

## 2. Import text and alias resolution (RC3, RC4) — `req~import-resolution~1`

- `extract.ts:347`: store the whole statement, whitespace collapsed, in place
  of the first line. Bindings and the specifier are read from the **full**
  text; only the stored text is capped at 1024 characters. Past the cap, the
  stored form is the head, ` … `, and the trailing `from "…"` clause
  (`capImportText`), so the specifier still resolves (Rework 1, M1). `parseImportSpecifier` (`indexer.ts:128-131`)
  then sees `from "…"` on multi-line imports. Also handle `export … from "…"`,
  `import "x"`, and `require("x")`/`import("x")` call forms where they exist
  today.
- `resolveImportPath` (`indexer.ts:152-179`):
  1. Relative specifier: as today, including `.js`→`.ts` (`:158,176`).
  2. Otherwise, find the nearest `tsconfig.json` (or `jsconfig.json`) at or
     above the importing file, inside the project root. Read
     `compilerOptions.paths` and `baseUrl`, following a relative `extends`
     chain (max depth 5, cycle-safe, project-root bounded). Package-form
     `extends` (`"@tsconfig/node20/tsconfig.json"`), the TypeScript 5 array
     form of `extends`, and `tsconfig.*.json` siblings are **not** followed;
     their `paths` are ignored and such imports degrade to unresolved. JSON with comments
     and trailing commas is tolerated. On a parse error, the alias is skipped
     and the run does not fail.
  3. For each `paths` pattern (single `*` wildcard, longest prefix first), try
     each target substituted relative to `baseUrl` (or the tsconfig's directory
     when `baseUrl` is absent), using the same extension probing as relative
     specifiers.
  4. Bare `baseUrl` resolution (`import "lib/x"` with `baseUrl: "src"`) is tried
     last.
  5. Bare package names that resolve to no project file stay unresolved.
- The tsconfig lookup is cached per directory for the duration of one
  `resolveEdges` call. There is no new dependency: a JSONC strip is done by
  hand.

## 3. Member calls and denylist (RC5) — `req~impact-id-first~1`

At extract time, each call reference carries `member: 0 | 1 | 2` (stored as
`edges.is_member`) and `spec: string | null` (stored as `edges.spec`, schema 11):

| Call shape | `is_member` | `spec` |
|------------|-------------|--------|
| `f()` | 0 | the import specifier when `f` is an import binding of this file, else NULL |
| `this.f()` / `super.f()` | 0 | NULL |
| JS/TS `ns.f()` where `ns` is an import binding of this file (default, namespace, or named) | 2 (Rework 2) | that binding's import specifier |
| any other `recv.f()` (including chains `a.b.f()`, `x[0].f()`, call results) | 1 | NULL |
| Python `self.f()` / `cls.f()` | 0. Other attribute calls on a module imported in this file: 0. Else: 1. | NULL |

Import edges carry their own specifier in `spec` (JS/TS; NULL for Python).

**What is a package (Rework 2, N1).** Extract does not decide it. A specifier is
a package when its import edge stays **unresolved after relative, `paths`, and
`baseUrl` resolution** (§2) — i.e. it maps to no indexed project file. The
Rework 1 rule (`node:`, scoped `@scope/x`, or a single-segment bare name)
misclassified scoped-looking `paths` aliases (`@app/*`, Nx `@myorg/core`) and
single-segment `baseUrl` modules (`utils`), so it is removed
(`isPackageSpecifier` is gone).

Resolution in `resolveEdges` (imports are resolved **first**, so call binding
can see them). A call's *import target* is the file of the node that the same
file's import edge with the call's `spec` resolved to (NULL when `spec` is NULL
or that import is unresolved):

- `is_member = 1` edges are never resolved by name. `dst_node_id` stays NULL.
- `is_member = 2` edges resolve only when their import target exists; then by
  name with the import target preferred.
- **Barrels (Rework 3, N2).** An import of a file that has no symbols or that
  re-exports (`libs/core/src/index.ts` = `export * from "./lib/core";`, or
  `api/index.ts` with only re-exports) resolves to that file's file-owner node
  (§1.1), so the import target exists and `core.boot()` / `api.x()` bind. The
  name is not defined in the barrel, so the binding falls back by name with
  this order: the import target itself; then a definition **under the import
  target's directory** (`libs/core/src/…`), which stands in for "reachable
  through the barrel's re-exports" without storing them; then a same-file
  definition; else the lowest id. Re-export specifiers are not stored or
  followed, so a barrel that re-exports from outside its own directory gets the
  plain name match (the pre-Rework-1 behavior). Re-exports are also not import
  edges, so the file-level import arm of impact does not pass through a barrel
  (callers through it are found via the call edge). Package receivers (`path.parse()`, `_.parse()`) keep
  `dst_node_id` NULL and, like `is_member = 1`, never match the query-time
  by-name arms (`is_member = 0` only).
- `is_member = 0` edges whose `dst_name` is in `BUILTIN_GLOBALS` resolve only
  to a definition **in the same file or in the import target** (Rework 2, O13:
  `import { fetch } from "./http"; fetch()` binds to `src/http.ts`'s `fetch`,
  while an un-imported global `fetch()` stays unbound):
  `describe, it, test, expect, beforeEach, afterEach, beforeAll, afterAll,
  setTimeout, setInterval, clearTimeout, clearInterval, queueMicrotask,
  parseInt, parseFloat, require, structuredClone, fetch, print, len, isinstance,
  super`.
- The by-name fallbacks at query time (the explore callers query and the impact
  CTE's unresolved arm) apply the same-file builtin rule (Rework 1, M2). They
  only see unresolved edges, so an import-target binding made above is served
  by the id arm.
- All other `is_member = 0` edges: prefer the import target, then a
  definition under the import target's directory, then a same-file
  definition, else the lowest-id node with that name.
- **Cost (Rework 3, O15).** The correlated import-target subquery is wrapped in
  `CASE WHEN edges.spec IS NULL THEN NULL ELSE (…) END` and the
  `is_member = 2` arm checks `edges.spec IS NOT NULL` first, so calls without a
  spec (most local calls) never run it; the directory preference is likewise
  evaluated only for calls with a spec.
- Bare calls to a binding of an unresolved (package) import are **not** made
  foreign: `import { parse } from "pkg"; parse()` keeps today's by-name rule.
  Changing it would drop callers whenever alias config is unreadable (below),
  and it is outside N1's scope.
- **Scoped passes:** `resolveEdges(db, fileIds)` also re-binds calls in every
  file whose import that pass resolved (a new file can turn a package into a
  project import), so a pending `is_member = 2` call is not left behind. Past
  10 000 bind parameters the call pass runs unscoped.
- **Trade-off (alias config not followed):** when the receiver's import is a
  project alias the resolver cannot see (package-form or array `extends`,
  `tsconfig.*.json` siblings — §2), the import stays unresolved, so member
  calls through it are treated as package calls and produce no caller. The
  file-level import arm is unaffected (it is unresolved either way).
- Python bindings never get a `spec` (absolute Python imports are often project
  modules), so Python attribute calls keep the Rework 1 behavior.
- **Trade-off:** calls on local or parameter receivers (`svc.run()`,
  `this.db.query()`) are `is_member = 1` and produce no caller for a project
  method of that name. `docs/compass.md` states this.

## 4. `resolveEdges(db, fileIds?)` — the shared helper (D3)

```ts
/** Resolve call and import edges. With fileIds, only edges owned by those files
 * plus NULL edges whose dst_name is defined in those files; otherwise every
 * edge whose dst_node_id is NULL. */
export function resolveEdges(db: DatabaseSync, fileIds?: number[]): { calls: number; imports: number };
```

- It replaces the inline call resolution (`indexer.ts:533-541`) and wraps
  `resolveImportEdges` (`:78-125`) with alias support (§2).
- `buildIndex` calls it with no `fileIds`. The no-op fast path
  (`req~index-noop-fast-path~1`) still skips it.
- It is exported from `indexer.ts` (not from the public barrel) for
  `reindex-on-edit`'s `indexFiles` (its design D16). That design rebases on
  this signature.
- Unit test: running it with and without `fileIds` on an unambiguous fixture
  gives the same `dst_node_id`s as a full index.

## 5. Affected-test command (RC6) — `req~affected-test-selection~1`

### 5.1 Contract (`affected.ts:31`)

```ts
interface AffectedTestCommand { cwd: string; command: string; files: string[] } // cwd repo-relative, "." for root
interface AffectedTestsResult {
  // …existing fields unchanged…
  command: string | null;
  commandReason: string;               // always set; why this command (or why null)
  commands: AffectedTestCommand[];     // [] when command is null
}
```

### 5.2 Rules

| Mode | Result |
|------|--------|
| `none` | `command: null`, `commands: []`, `commandReason`: "no test file is reachable from the change". |
| `all` (global match) | Root `npm test` (or the detected root runner's full command), with `commandReason` naming the global pattern. |
| `subset` | Group the selected files by the nearest `package.json` directory at or above each file (bounded by the project root). Build one command per group (§5.3). |
| No `package.json` anywhere / non-JS | Today's ecosystem default. If it would run nothing, `null` plus a reason. |

### 5.3 Runner detection per package

The runner is read from `scripts.test`, then from `devDependencies` and
`dependencies`:

- **vitest** (the script mentions `vitest`, or the dependency is present and the
  script is absent or mentions it): `npx vitest run <files>`. `run` avoids
  watch mode.
- **Inherited runner** (Rework 1, S1): a package with no `scripts.test` and no
  vitest/jest dependency inherits the runner of the nearest ancestor
  `package.json` (up to the root) that declares vitest or jest — the hoisted
  monorepo layout. The command still runs in the leaf's `cwd`, and
  `commandReason` names the ancestor.
- **jest** (the script mentions `jest`, or the dependency is present):
  `npx jest --runTestsByPath <files>`.
- **node --test** (the script starts with `node` and contains `--test`):
  1. Rebuild the script from its tokens.
  2. Keep `node` and the flags; a value-taking flag keeps its separate value
     (`--import ./register.mjs`, `--test-reporter spec`). Drop
     `--experimental-test-coverage` and every `--test-coverage-*` flag
     together with its value (`--test-coverage-lines 80`), because thresholds
     fail on subsets.
  3. Drop the positional globs and append the files. A directory positional
     (`test/`, no glob character and no file extension) is the glob
     `test/**`: it matches every file under it, none of them a helper.
  4. When a positional glob does not match a selected source path, map the path
     as `<first glob segment>/<path with .ts|.tsx|.mts|.cts → .js|.js|.mjs|.cjs>`
     and accept it if it matches the glob (the compiled-tests layout, e.g.
     `dist-test/test/**/*.test.js`). Prefix `npm run pretest && ` when a
     `pretest` script exists.
  5. A selected file whose basename no glob's last segment can match (a helper
     such as `test/helpers/fixtures.ts` against `*.test.js`) is left out, with
     a note: the script never runs it, not even in a full run, and its
     dependent tests are already selected through the closure. If every file
     in the group is such a helper, the group has no command.
  6. If a test-shaped file cannot be mapped, the group's command is `npm test`
     (the full suite, a safe superset), with the reason stated.
- **Unrecognized script**: `npm test -- <files>`, with `commandReason` saying
  the arguments are forwarded and may run the full suite (still a superset).
- **No `scripts.test`**, no known dependency, and no ancestor declaring vitest
  or jest: for a JS package, `node --test <files>`.

Paths in each command are relative to that group's `cwd` and quoted with the
existing quoting helper.

### 5.4 `command` with several groups (D7 justification)

- With one group, `command` = that group's command, prefixed with `cd <cwd> && `
  when `cwd` is not `.`.
- With several groups, `command` =
  `(cd <cwd1> && <cmd1>) && (cd <cwd2> && <cmd2>)`.

Why: existing consumers (agents, CLI text mode, `explore-rich`) run `command`
from the repo root. A compound string stays executable there and still covers
the whole selection, so nothing silently narrows. Structured consumers and
non-POSIX shells use `commands[]`. Picking only the first group was rejected,
because it would drop tests and break the superset guarantee.

### 5.5 Consumer ripple

| Consumer | Change |
|----------|--------|
| `explore-rich.ts:26,118` | Pass the new fields through. The budgeted shape keeps `commandReason`. |
| CLI `runQuery` (`src/cli/commands/query.ts:148`) | Text: print `command`, or `no command: <reason>`. JSON: the new fields. |
| `diffContext` (`diff-context.ts:125`) | Pass the fields through. |
| `investigate` (`lawbook/investigate.ts:392`) | Null-safe. |
| `gatherSignals` (`lawbook/levels.ts:378`) | Null-safe. Counts are unchanged in meaning. |
| `registerCompass` (`register.ts:227`) | The tool description mentions the nullable `command`. |

## 6. Callees (RC7) — `req~compass-mcp-surface~1`

- `assembleExplore` (`query.ts:251-259,286`) returns callee rows only where
  `dst_node_id IS NOT NULL`. The rows are de-duplicated by node id.
- A second count query feeds `unresolvedCallees: { count, sample }`: up to 10
  distinct `dst_name`s, ordered by frequency then name.
- `budgetExploreShape` (`src/shared/output-budget.ts`) keeps `unresolvedCallees`
  (it is small) and truncates `callees` as today. The real callees are no
  longer crowded out.

## 7. Schema 11 migration — `req~schema-edge-membership~1`

`db.ts`:

- `SCHEMA_VERSION = "11"`. The `edges` DDL gains
  `is_member INTEGER NOT NULL DEFAULT 0` and (Rework 2) `spec TEXT`, plus
  `idx_edges_srcfile ON edges(src_file_id, kind)` for the import-target lookup.
- Opening `"10"`: in one `BEGIN IMMEDIATE` transaction, run
  `ALTER TABLE edges ADD COLUMN is_member INTEGER NOT NULL DEFAULT 0` and
  `ALTER TABLE edges ADD COLUMN spec TEXT` (each only when missing), set the
  needs-reindex marker with the reason
  `"schema 11 adds file-owner nodes, member-call flags and full import text; reindex required"`,
  and stamp `"11"`.
  - The next `buildIndex` treats every file as changed (a force re-extract).
  - `embedding_cache` is untouched, so unchanged symbols reuse their vectors.
  - On failure, the transaction rolls back and the stamp stays `"10"`.
- Opening `"11"` whose `edges` lacks `spec` (an index built by this branch
  before Rework 2): the same 10→11 step adds it in place and sets the marker;
  no wipe, embeddings kept.
- Opening `"9"`: run 9→10 then 10→11. Opening `"8"`: run 8→9→10→11. Older
  versions: recreate, as today.
- Tests (`test/integration/db.test.ts`):
  - 10→11 adds the column, stamps 11, sets needs-reindex, and keeps the cache
    rows.
  - A forced failure rolls back to 10.

## 8. Tests

| File | Cases |
|------|-------|
| `test/unit/affected.test.ts` | `bugfix.md` §6 rows. Also rework the fixture `:29-42` so tests are declaration-less, imports span several lines, and calls sit in callbacks. Add a `tsconfig` alias fixture and a workspace fixture (`apps/web/package.json` with vitest, `packages/core/package.json` with jest). |
| `test/integration/compass.test.ts` (`:38` explore suite) | Callees are resolved only, with `unresolvedCallees.count` > 0 and no `push`/`map`. A callback caller is listed. Member calls are not bound. File nodes are hidden from find and name explore. Path explore of a declaration-less file resolves to its file node (`req~explore-file-path~2`). |
| `test/unit/impact.test.ts` (`:73`) | A declaration-less importer variant. The by-name arm ignores `is_member = 1`. |
| `test/integration/affected-tests.test.ts` | CLI `--json`: the new fields. Text mode prints the reason on null. |
| `test/integration/db.test.ts` | §7. |
| `test/integration/retrieval.test.ts` | The golden MRR@10 is still at or above the threshold. Record the branch value. |
| `test/unit/diff-context.test.ts`, `investigate.test.ts`, `levels.test.ts` | Update the expectations that change because more dependents are found or `command` can be null. Each changed expectation is justified in `backend.md`. |
| `resolveEdges` unit (in `test/unit/affected.test.ts` or a new `test/unit/resolve-edges.test.ts`) | §4 equivalence, and the "no NULL `src_node_id`" invariant. |

Covers tags:
- `// Covers: req~impact-id-first~1`
- `req~import-resolution~1`
- `req~affected-test-selection~1`
- `req~compass-mcp-surface~1`
- `req~schema-edge-membership~1`
- `req~explore-file-path~2` (renamed from `~1` in `src/` and the tests)

## 9. Performance and quality (`reports/performance.md`)

Use throwaway worktrees of `main` and the branch under `os.tmpdir()`, each built
with `npm ci && npm run build`. No real user data is touched.

| Metric | Method |
|--------|--------|
| Full index time (`speclaw index --force`) on this repo | 3 warm-ups, then ≥10 runs. Report the median and p95. |
| No-op `speclaw index` | ≥20 runs. The branch median must be ≤ main's (`req~index-noop-fast-path~1`). |
| Explore latency (`speclaw query explore <sym>` for 5 fixed symbols: `buildIndex`, `affectedTests`, `impact`, `explore`, `resolveImportPath`/`resolveEdges`) | ≥20 runs each. Report the median and p95. |
| Retrieval quality | `retrieval.test.ts` golden MRR@10, main vs branch. The branch must stay at or above the configured threshold. A drop larger than 0.02 from main must be explained. |
| Result quality | For the 5 symbols: the affected-test count and callers count on main vs branch, and the callee noise ratio (unresolved / total). |

Budget: the full index time on the branch may not exceed main's by more than
15% (file nodes and alias lookups). Going over the budget is a FAIL that the
tester reports.

## 10. Docs

- `docs/compass.md`:
  - Schema 11 and the 10→11 forced reindex.
  - File-owner nodes and that they are hidden.
  - The callees/`unresolvedCallees` contract.
  - The affected-test command contract (`command` nullable, `commandReason`,
    `commands`, runner detection).
- `src/modules/foundation/assets/docs/compass.template.md`: the same user-facing
  notes.
- `README.md:119`: "Schema **11**".
- `src/cli/commands/update.ts:236`: "schema 11" (after
  `harden-update-lock-and-cli` lands).
- The 2.0.10 `CHANGELOG.md` lines (Fixed and Changed) are handed to the
  coordinator.
- **Human-accept task (D14):**
  - `CLAUDE.md:42` "Schema **10**" → "**11** … (10→11 forces a reindex;
    embeddings reused)".
  - `CLAUDE.md:152` and `AGENTS.md:140` "Compass (schema 10)" → "(schema 11)".
  - `AGENTS.md:105`: the same as `CLAUDE.md:42`.
  - Then run `speclaw laws accept CLAUDE.md AGENTS.md` on a TTY.

## 11. Risks

- **Old indexes.** Every 2.0.7 index migrates and reindexes once. The cost is
  bounded by the embedding cache.
- **Signal inflation.** Ceremony levels may rise for the same diff, because the
  graph is now truthful. This is called out in the CHANGELOG.
- **A file node in impact output** may surprise consumers that assume every
  node is a symbol. `kind: "file"` is explicit, and `api.md` documents it.
- **tsconfig parsing.** It is best-effort and never throws. An unresolved alias
  degrades to today's behavior.
- **Downgrade ping-pong.** speclaw 2.0.9 or older (an MCP entry pinned at
  `@2.0.9`, a stale global CLI) sees a schema-11 stamp as incompatible and
  wipes the index, embedding cache included; the next 2.0.10 run rebuilds it.
  The old binaries cannot change, so the 2.0.10 `MIGRATIONS` agent prompt,
  `docs/compass.md`, and the template tell users to run `speclaw update` to
  re-pin the MCP entry (Rework 1, S4).
