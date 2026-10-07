# Bugfix: fix-explore-tests-and-callees

**Level:** 3 · **Type:** bug · **Severity:** high · **Ships:** 2.0.10

## 1. Observed symptom

On real repositories, `compass_explore` (default includes) and
`speclaw query affected-tests` / `compass_diff_context` give agents wrong
answers on three outputs:

1. **Affected tests are missing.** Changing a symbol that is plainly used by a
   test file reports no test (`tests: []`) or a subset that leaves out that test. Two
   kinds of test file are never selected:
   - A test file with no top-level declarations, only imports and
     `test(...)`/`describe(...)` callbacks. `test/unit/hooks.test.ts` in this
     repo is one.
   - A test file whose import of the changed module spans several lines, or
     uses a tsconfig `paths` alias such as `@/lib/x` (seen in a Next.js
     workspace, `apps/web/tsconfig.json` `"@/*"`).
2. **The suggested command is wrong.**
   - When nothing is selected, `command` is
     `npm test -- --test-name-pattern=^$`. That command runs nothing and passes,
     so it reads as "tests are green".
   - When a subset is selected, the command is `npm test -- <paths>` at the repo
     root. That is wrong in several cases:
     - In workspaces (the test lives under `apps/web/`).
     - With vitest, whose bare `vitest` starts watch mode.
     - With `node --test` scripts that already carry a glob, because then the
       full suite runs, plus coverage thresholds that fail on a subset.
3. **Callees are noisy and callers are missing.**
   - `callees` lists unresolved names with no file, such as `push`, `map`,
     `join`, and `log`. The output budget (`budgetExploreShape`) then truncates
     the list, so real project callees are cut off in favor of that noise.
   - A function that is only called from inside test callbacks or arrow
     functions shows **no callers**.
   - Member calls such as `arr.push(x)` get bound by name to an unrelated
     project symbol named `push`, which creates false callers and false impact.

## 2. Minimal reproduction

Use a temp project with `package.json` `{"scripts":{"test":"node --test"}}`:

```
src/math.ts          export function add(a: number, b: number) { return a + b; }
test/math.test.ts    import {
                       add,
                     } from "../src/math.js";
                     import { test } from "node:test";
                     test("adds", () => { add(1, 2); [1].push(2); });
```

1. Run `buildIndex(root)`.
2. Run `affectedTests(root, { files: ["src/math.ts"] })`. It returns
   `mode: "static"`, `tests: []`, and
   `command: "npm test -- --test-name-pattern=^$"`. The expected result is
   `test/math.test.ts`.
3. Run `explore(root, "add")`. `callers` is empty. The expected caller is the
   test file.
4. In the test file, `callees` of any node includes a file-less `push` entry.

## 3. Root cause

Path: `exploreRich` (`src/modules/compass/explore-rich.ts:109-123`) →
`affectedTests` (`src/modules/compass/affected.ts:102-112`) → the `impact`
recursive CTE (`src/modules/compass/query.ts:571-621`), which joins
`nodes owner ON owner.id = e.src_node_id` (`query.ts:603`).

- **RC1, calls outside a definition are ownerless.**
  - TypeScript definitions are only function, class, method, interface, type,
    and enum (`src/modules/compass/languages.ts:71-75,97-104`). A call inside an
    arrow function assigned to a `const`, or inside a test callback, therefore
    has `ownerIndex` null (`src/modules/compass/extract.ts:344`).
  - Such a call edge is stored with `src_node_id` NULL
    (`src/modules/compass/indexer.ts:475`).
  - The NULL edge is then dropped twice: by the impact CTE's inner join and by
    the callers query (`query.ts:268`).
- **RC2, imports need a declaration.** Imports are lifted to
  `fileOwner = nodeIds[0] ?? null` (`indexer.ts:471`). A declaration-less file
  such as `test/unit/hooks.test.ts` has no first node, so its import edges also
  get `src_node_id` NULL.
- **RC3, multi-line imports are truncated.** `extract.ts:347` stores only
  `node.text.split("\n")[0]`. `parseImportSpecifier` (`indexer.ts:128-131`)
  cannot find the `from "…"` specifier on that first line, so `dst_node_id`
  stays NULL. The impact import arm requires `e.dst_node_id IS NOT NULL`
  (`query.ts:594`).
- **RC4, aliases are not resolved.** `resolveImportPath` returns null for every
  non-relative specifier (`indexer.ts:153`), so tsconfig `paths`/`baseUrl`
  aliases never resolve.
- **RC5, member calls bind by name to anything.** `calleeName` drops the
  receiver (`extract.ts:96-99`). The by-name fallback (`indexer.ts:533-541`)
  then binds `x.push()` to any node named `push`. The impact CTE's by-name arm
  (`query.ts:590`) adds the same false positive at query time.
- **RC6, the command builder cannot say "nothing".**
  - With mode `none`, `buildTestCommand` emits a run-nothing pattern
    (`affected.ts:252-253`).
  - A subset is always run as `npm test -- <paths>` at the root
    (`affected.ts:260-262`).
  - It does not detect the runner and does not detect workspaces.
- **RC7, callees include unresolved names.** `assembleExplore` LEFT JOINs the
  callees (`query.ts:251-259`), so it returns unresolved names with no file.
  `budgetExploreShape` (`src/shared/output-budget.ts`) then truncates the real
  callees first.

These parts work correctly: `.js` → `.ts` mapping (`indexer.ts:158,176`) and
the test globs (`affected-config.ts:62-69`).

The existing fixture `test/unit/affected.test.ts:29-42` hides RC1–RC3. Its tests
declare top-level functions, and its imports fit on one line.

## 4. Blast radius

Mapped by the explorer from the confirmed root causes:

- **Indexer** (`indexer.ts`, a hotspot), meaning edge ownership, import
  resolution, and by-name resolution. Every edge is rewritten, so this needs a
  **full reindex**. The schema goes 10 → 11 with `edges.is_member`.
- **Extractor** (`extract.ts`, `languages.ts`): import text, `is_member`, and
  the receiver classification.
- **Query** (`query.ts`): the impact CTE, which has 8 `impact` callers, plus
  callers, callees, and explore.
- **Affected-tests contract.** `AffectedTestsResult.command` (`affected.ts:31`)
  is consumed by:
  - `explore-rich.ts:26,118`
  - the CLI `runQuery` (`src/cli/commands/query.ts:148`)
  - `diffContext` (`diff-context.ts:125`)
  - `investigate` (`src/modules/lawbook/investigate.ts:392`)
  - `gatherSignals` (`src/modules/lawbook/levels.ts:378`)
  - `registerCompass` (`register.ts:227`)
- **Signals.**
  - The ceremony-level signals (`affectedTests`, `blastRadiusNodes`) may rise,
    because more true dependents are now found.
  - `investigate`'s `coveringTests` grows.
  - PageRank inputs change, since edges from file nodes count as references.
  - The retrieval golden MRR may shift.
- **MCP / CLI output contract** for `compass_explore` (`callees`, the new
  `unresolvedCallees`), `compass_diff_context`, and `speclaw query
  affected-tests` (nullable `command`, `commandReason`, `commands[]`). An
  `api.md` report is owed.

## 5. Proposed fix

Full design: `design.md`. In summary:

1. **File-owner node.** Each file that has a top-level reference (an import, or
   a call with no enclosing definition) gets one synthetic node with
   `kind = 'file'` and `name` = the repo-relative path. It owns those orphan
   edges, so `src_node_id` is never NULL for a newly indexed edge. The node is
   hidden from `compass_find`, from explore name lookup, and from PageRank
   rows, FTS/`node_text`, embeddings, `node_metrics`, hotspots, the compact
   map, drift anchors, and `totals.nodes`. Explore of a **file path** whose
   file has no visible symbols resolves to it.
2. **Full import text.** The whole import statement is stored, with whitespace
   collapsed and capped at 1024 characters.
3. **Alias resolution.** Imports resolve through the nearest `tsconfig.json`
   `compilerOptions.paths`/`baseUrl` (following `extends` chains within the
   project) for each workspace.
4. **`edges.is_member`** (schema 11), with a 10→11 migration that forces a
   reindex and keeps embeddings.
   - Member calls on a receiver that is not `this`/`super` or an import binding
     of the same file are stored with `is_member = 1`.
   - They are never resolved by global name, and the impact CTE's by-name arm
     skips them.
   - A small builtin-global denylist (such as `describe`, `test`, `expect`,
     `setTimeout`) resolves only to a same-file definition.
5. **Shared `resolveEdges(db, fileIds?)`.** One helper holds all the
   resolution, call and import. `reindex-on-edit` reuses it.
6. **Callees.** Explore returns only resolved callees, plus
   `unresolvedCallees: { count, sample }`.
7. **Command.**
   - `command: string | null` plus `commandReason`. A run-nothing command is
     never emitted.
   - The runner is detected per nearest `package.json`: `node --test`,
     vitest, or jest.
   - A selection that spans workspaces adds
     `commands: [{ cwd, command, files }]`.

Discarded alternatives:
- **Teach the CTE to LEFT JOIN NULL owners.** The result would carry no node to
  report and no file for `is_test`, and callers would still be missing.
  Rejected.
- **Make arrow functions definitions.** That fixes `const f = () => …` but not
  test callbacks or top-level statements, and it floods find with anonymous
  nodes. Rejected. It may be done separately later.
- **Store the receiver text in a new column.** It would make the schema
  heavier. Classifying the receiver at extract time is enough for the
  resolution rules. Rejected (human: `is_member` only).
- **`npm test -- <paths>` for every runner.** This is wrong for vitest watch
  mode, for `node --test` scripts that carry a glob, and for workspaces.
  Rejected.

## 6. Regression test

Each one is written **before** the fix and must fail on the current code. Its
failing output goes to `reports/.red-before-fix.txt`.

| Test | Fails today because |
|------|---------------------|
| `test/unit/affected.test.ts::selects a declaration-less test file that calls the symbol inside a test callback` | RC1/RC2: NULL `src_node_id` |
| `test/unit/affected.test.ts::selects a test file whose import spans several lines` | RC3: specifier not on the first line |
| `test/unit/affected.test.ts::resolves a tsconfig paths alias import` | RC4 |
| `test/unit/affected.test.ts::mode none yields a null command with a reason` | RC6: `--test-name-pattern=^$` |
| `test/unit/affected.test.ts::detects vitest, jest and node --test runners per package` | RC6 |
| `test/unit/affected.test.ts::groups a workspace-spanning selection into per-cwd commands` | RC6 |
| `test/unit/affected.test.ts::maps compiled node --test globs and drops coverage thresholds` | RC6 |
| `test/integration/compass.test.ts::callees list only resolved symbols and count the unresolved` | RC7 |
| `test/integration/compass.test.ts::member calls on non-project receivers do not bind by name` | RC5 |
| `test/integration/compass.test.ts::a function called only from a test callback lists that caller` | RC1 |
| `test/integration/compass.test.ts::file-owner nodes are hidden from find and name explore` | new guarantee, guards the fix |
| `test/unit/impact.test.ts::declaration-less importer appears in the reverse closure` | RC2 |
| `test/integration/db.test.ts::schema 10 migrates to 11 and forces a reindex keeping embeddings` | new schema (fails: no `is_member`) |

## 7. Prevention

- The delta spec makes these guarantees explicit and tracked by coverage:
  - `req~impact-id-first~1`, which covers orphan references and member calls.
  - `req~import-resolution~1`.
  - `req~affected-test-selection~1`.
  - `req~compass-mcp-surface~1`.
  - `req~schema-edge-membership~1`.
  - `req~explore-file-path~2`.
- The fixtures in `test/unit/affected.test.ts` move to realistic shapes:
  declaration-less tests, multi-line imports, and calls inside callbacks. They
  no longer hide the defect.
- New law: none. Ownership of an edge is a graph invariant ("no edge indexed
  under schema 11 has a NULL `src_node_id`"). It is asserted by a test, not by
  an executable law, because laws scan source, not index content.

## 8. API surface (an `api.md` report is mandatory)

| Surface | Change |
|---------|--------|
| `compass_explore` (and `speclaw query explore`) | `callees` holds resolved entries only. New `unresolvedCallees: { count: number, sample: string[] }`. `callers` may include `kind: "file"` entries. The tests block has a nullable `command`, plus `commandReason` and `commands`. |
| `compass_diff_context` | The `affectedTests` block has the same nullable `command`, `commandReason`, and `commands`. |
| `speclaw query affected-tests` (`--json` and text) | The same fields. The text mode prints `no command: <reason>` when `command` is null. |
| Retired alias `compass_affected_tests` | Delegates, so it gets the same shape. |

The consumers inside the repo are updated in this change: `explore-rich.ts`,
the CLI `runQuery`, `diffContext`, `investigate`, `gatherSignals`, and
`registerCompass`.

## 9. Scope, sequencing, risks

These are not in scope:
- Arrow functions or `const` lambdas as first-class definitions.
- Non-JS runners (pytest, go test). They keep today's logic, except that a
  command that would run nothing becomes `null` with a reason.
- Per-file incremental resolution. `reindex-on-edit` owns that, built on
  `resolveEdges`.
- Agent edits to `CLAUDE.md`/`AGENTS.md`. These are strict lock paths, so the
  edits are a human `speclaw laws accept` task.

Sequencing:
- This change ships as 2.0.10 on branch `fix/explore-tests-and-callees`,
  stacked on `fix/harden-update-lock-and-cli` (2.0.9). Implementation starts
  only after `harden-update-lock-and-cli` has a test PASS (satisfied: archived). That change also edits `src/cli/commands/update.ts` and the CLI wiring.
- This change syncs its `code-graph` delta **before** `reindex-on-edit`.
  `reindex-on-edit` rebases its `code-graph` delta on the canonical spec after
  this sync, and its `indexFiles` reuses `resolveEdges`.

Risks:
- **One forced reindex per index** on upgrade (the 10→11 migration). Embeddings
  are reused.
- **Ceremony-level signals and impact counts rise**, because the graph is now
  truthful. The CHANGELOG notes this.
- **Ranking shifts.** PageRank inputs and the retrieval MRR may move. A
  main-vs-branch `reports/performance.md` with a retrieval quality check is
  required.
- **Compound `command` strings** use POSIX `cd … &&`. Non-POSIX shells use
  `commands[]`.
