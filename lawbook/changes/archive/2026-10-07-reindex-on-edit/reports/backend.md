# Backend checks — reindex-on-edit (2026-10-07)

Date 2026-10-07 · Branch `feat/reindex-on-edit` (ships 2.0.11; package.json still reads 2.0.10, the coordinator owns the bump) · cwd `/Users/esneiderbravo/Projects/speclaw` · manual sandbox `/tmp/rof-man.MyRY` (mktemp, `HOME` sandboxed) · Node v24.17.0 · macOS Darwin 25.5.0 (APFS, case-insensitive)

Scope: Compass `indexFiles`, the shared eligibility predicate (`classifyIndexPath`, `walkWouldYield`), `meta.post_pending`, `isCurrentIndex` / `openCurrentDb`, the full-run lock and unwalked-row rules, and the dangling `dst_node_id` fix (`detachFileNodes`) — `src/modules/compass/indexer.ts`, `src/modules/compass/db.ts`, `src/shared/paths.ts`.

**Why there is no `api.md`:** no MCP tool is added or removed (the count stays at nine), and no input schema, result shape, status, or ordering contract changes. The dangling-id fix makes `compass_impact` / `compass_explore` honor the id-first reverse reachability they already promise. There is no HTTP surface. The new CLI command is covered in `cli.md`, and the `.claude/settings.json` hook wiring in `hooks.md` (proposal "API surface", design D23).

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Lint + format | `npm run check` | ✅ exit 0 — "All matched files use Prettier code style!", ESLint clean |
| Type-check + compile | `npm run build` | ✅ exit 0 — `tsc` strict, "copy-assets: copied assets for 3 module(s)" |
| Tests + coverage | `npm test` | ✅ exit 0 — `tests 925 · pass 925 · fail 0 · cancelled 0 · skipped 0` (56.2 s); all files 87.44 % line / 84.46 % branch / 89.31 % funcs (floor 80 %) |
| Coverage, touched files | `npm test` coverage table | `indexer.js` 97.25 / 94.22 / 98.15 · `db.js` 96.09 / 82.08 / 100 · `shared/paths.js` 95.00 / 90.00 / 100 |
| Change validation | `lawbook_change` action `validate`, change `reindex-on-edit` | ✅ `valid: true`, `issues: []` (EARS style warnings only: multiple modals / passive voice) |
| Requirement coverage | `node dist/cli/index.js coverage --change reindex-on-edit --json` | ✅ summary `identified 21 · shallowCovered 21 · deepCovered 21 · directDefects 0 · transitiveDefects 0`; `req~reindex-on-edit~1` impl+utest+itest, `req~edge-ids-survive-reindex~1` impl+utest+itest, `req~index-noop-fast-path~1` impl+itest, `req~edit-reindex-hook~1` impl+utest+itest — `uncoveredTypes: []` for all four |
| Law + integrity verify | `node dist/cli/index.js verify` | ✅ exit 0 — "1 passed · 0 failed · 0 skipped · 2 unknown"; advisory `integrity~advisory-mismatch~1` on `docs/compass.md` (the intended prose edit; standards docs are advisory, the archiver re-locks); `law~compass-does-not-import-foundation~1` and `law~shared-stays-inner~1` unknown (unresolved references, same result before and after a fresh `speclaw index`) |
| Spec↔code drift | `node dist/cli/index.js drift` (after `speclaw index`; `docs/compass.md` backed up and restored, map block byte-equal to HEAD) | ✅ exit 0 — `semantic 0 · deleted 0 · moved 0 · changedCosmetic 0 · staleHash 0`, `ambiguous 11` (multi-definition names such as `main`, none a body change), `orphan 2166` (unanchored reverse inventory). No anchor needs a reseal for this change |

## Tests added / updated

- `test/integration/edge-ids.test.ts` (new, `// Covers: req~edge-ids-survive-reindex~1`): callers survive a full re-index and a per-file reindex of the callee file (`bar` stays bound to the new `foo` id, impact `exact`); a removed symbol leaves its callers unresolved (full and per-file); a removed file leaves no dangling destination (full and per-file). **TDD:** red before `detachFileNodes` (below: the old edge silently re-bound to a reused rowid, `bar → added`), green after.
- `test/unit/index-files.test.ts` (new, `req~reindex-on-edit~1`, `req~edge-ids-survive-reindex~1`, `req~index-noop-fast-path~1`): edited body + new symbol; unchanged file writes no node/edge and no marker; deleted file removed with no dangling id; ineligible paths (outside, `node_modules`, `README.md`, oversize) write nothing; `classifyIndexPath` agrees with the walk; stale/missing index writes and creates nothing; PageRank, `indexed_at`, and the compact map untouched; ancestor `dir_hashes` equal a fresh full walk; resolution equals a fresh full index; a never-seen file is added. Rework tests: A1 full run absorbs a later per-file write; A4 file-level `coverage_links` removed (per-file and full); A6 `indexFiles` writes nothing when a full reindex is flagged while it waits; B1 full run keeps a file a per-file run indexed after its walk; B2 a full run that cannot take the lock closes its connection and rethrows; R2-1 case-only rename / directory replaced by a symlink dropped, case-variant path registered under the walk's spelling, symlinked-directory guard; `walkWouldYield` unit cases. **TDD:** each rework test was red first (outputs below).
- `test/integration/index-noop.test.ts` (updated): "a pending per-file reindex forces the full pass, then the fast path returns".

### Red-before-green evidence (verbatim; source files removed after embedding)

`reports/.red-dangling.txt` — dangling / reused `dst_node_id` (defect, D2):

```text
# Red-before-green: req~edge-ids-survive-reindex~1 (before detachFileNodes)
# 2026-10-07T12:53:02Z · branch feat/reindex-on-edit · HEAD 95cb789 · node v24.17.0
# cmd: npx tsc -p tsconfig.test.json && node --test dist-test/test/integration/edge-ids.test.js

✖ callers survive a full re-index of the callee file (53.265708ms)
✖ a removed symbol leaves its callers unresolved (16.0835ms)
✔ a removed file leaves no dangling destination (15.270167ms)
ℹ tests 3
ℹ suites 0
ℹ pass 1
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 315.896667

✖ failing tests:

test at dist-test/test/integration/edge-ids.test.js:70:1
✖ callers survive a full re-index of the callee file (53.265708ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    {
  +   dst: 3,
  +   name: 'added'
  -   dst: 4,
  -   name: 'foo'
    }
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/edge-ids.test.js:78:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: { dst: 3, name: 'added' },
    expected: { dst: 4, name: 'foo' },
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at dist-test/test/integration/edge-ids.test.js:83:1
✖ a removed symbol leaves its callers unresolved (16.0835ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    {
  +   dst: 3,
  +   name: 'added'
  -   dst: null,
  -   name: null
    }
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/edge-ids.test.js:89:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: { dst: 3, name: 'added' },
    expected: { dst: null, name: null },
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
```

`reports/.red-a1.txt` — Rework 1 (A1 lock race, A4 coverage links, A6 currency re-check). **A4 is pre-existing on the full-run path:** HEAD's `buildIndex` removal was a bare `DELETE FROM files WHERE id = ?` (`git show HEAD:src/modules/compass/indexer.ts`, line 825), so file-level `coverage_links` leaked before this change; this change fixes it on both paths:

```text
# Rework 1 red evidence (before the fix) — 2026-10-07T13:18:33Z
# cmd: npx tsc -p tsconfig.test.json && node --test --test-name-pattern="absorbs|coverage links|flagged while" dist-test/test/unit/index-files.test.js
# A1 = 'a full run absorbs…'; A4 = 'removing a file drops…'; A6 = 'indexFiles writes nothing when…'
# A4 full-run path pre-existing: HEAD buildIndex removal is a bare 'DELETE FROM files WHERE id = ?' (git show HEAD:src/modules/compass/indexer.ts, line 825)
✖ a full run absorbs a per-file write that lands after it starts (48.925625ms)
✖ removing a file drops its file-level coverage links (per-file and full run) (22.393042ms)
✖ indexFiles writes nothing when a full reindex is flagged while it waits (905.384041ms)
ℹ tests 3
ℹ suites 0
ℹ pass 0
ℹ fail 3
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1070.916333

✖ failing tests:

test at dist-test/test/unit/index-files.test.js:213:1
✖ a full run absorbs a per-file write that lands after it starts (48.925625ms)
  Error: UNIQUE constraint failed: files.path
      at writeFileFragment (file:///Users/esneiderbravo/Projects/speclaw/dist-test/src/modules/compass/indexer.js:571:35)
      at buildIndex (file:///Users/esneiderbravo/Projects/speclaw/dist-test/src/modules/compass/indexer.js:736:19)
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/index-files.test.js:218:11)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3) {
    code: 'ERR_SQLITE_ERROR',
    errcode: 2067,
    errstr: 'constraint failed'
  }

test at dist-test/test/unit/index-files.test.js:246:1
✖ removing a file drops its file-level coverage links (per-file and full run) (22.393042ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + [
  +   {
  +     name: 'file-level',
  +     node_id: null
  +   }
  + ]
  - []
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/index-files.test.js:259:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [ { name: 'file-level', node_id: null } ],
    expected: [],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/index-files.test.js:265:1
✖ indexFiles writes nothing when a full reindex is flagged while it waits (905.384041ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  false !== true
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/index-files.test.js:290:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }
```

`reports/.red-b1.txt` — Rework 2 (B1 full run deleting a child's row, B2 leaked connection on `SQLITE_BUSY`):

```text
# Rework 2 red evidence (before the fix) — 2026-10-07T13:25:44Z
# cmd: npx tsc -p tsconfig.test.json && node --test --test-name-pattern="after the walk|cannot take the lock" dist-test/test/unit/index-files.test.js
# B1 = 'a full run keeps a file a per-file run indexed after the walk' (the full run deleted the child's row: 0 !== 1)
# B2 = 'a full run that cannot take the lock closes its connection and rethrows' (BEGIN IMMEDIATE outside try: connection left open)
# Seams (BuildIndexOptions.hooks.afterWalk / onOpen) were added first with no behavior change, then these tests ran red.
✖ a full run keeps a file a per-file run indexed after the walk (53.716375ms)
✖ a full run that cannot take the lock closes its connection and rethrows (16.2015ms)
ℹ tests 2
ℹ suites 0
ℹ pass 0
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 319.203333

✖ failing tests:

test at dist-test/test/unit/index-files.test.js:245:1
✖ a full run keeps a file a per-file run indexed after the walk (53.716375ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  0 !== 1
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/index-files.test.js:258:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/index-files.test.js:266:1
✖ a full run that cannot take the lock closes its connection and rethrows (16.2015ms)
  AssertionError [ERR_ASSERTION]: the connection is closed after SQLITE_BUSY
  
  true !== false
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/index-files.test.js:286:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: true,
    expected: false,
    operator: 'strictEqual',
    diff: 'simple'
  }
```

`reports/.red-r2-1.txt` — Rework 3 (R2-1 case-only rename / symlinked directory kept forever):

```text
# Rework 3 red evidence (before the fix) — 2026-10-07T13:32:10Z
# cmd: npx tsc -p tsconfig.test.json && node --test --test-name-pattern="case-only rename|replaced by a symlink|case-variant path|symlinked directory registers|after the walk" dist-test/test/unit/index-files.test.js
# R2-1: unwalked rows kept when classifyIndexPath is eligible under a spelling/route the walk never yields

✔ a full run keeps a file a per-file run indexed after the walk (64.0505ms)
✖ a full run drops the old row of a case-only rename (20.097542ms)
✖ a full run drops rows under a directory replaced by a symlink (22.705083ms)
✖ indexFiles registers a case-variant path under the walk's spelling (18.4095ms)
✔ indexFiles through a symlinked directory registers the real path (19.242ms)
ℹ tests 5
ℹ suites 0
ℹ pass 2
ℹ fail 3
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 381.578333

✖ failing tests:

test at dist-test/test/unit/index-files.test.js:353:1
✖ a full run drops the old row of a case-only rename (20.097542ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  0 !== 1
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/index-files.test.js:364:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/index-files.test.js:373:1
✖ a full run drops rows under a directory replaced by a symlink (22.705083ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  0 !== 1
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/index-files.test.js:385:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/unit/index-files.test.js:392:1
✖ indexFiles registers a case-variant path under the walk's spelling (18.4095ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    [
  +   'LIB/Other.ts'
  -   'lib/other.ts'
    ]
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/index-files.test.js:400:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [ 'LIB/Other.ts' ],
    expected: [ 'lib/other.ts' ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
```

All of these tests pass in the tester's full run (`npm test`, 925/925), e.g. `✔ a full run drops the old row of a case-only rename (27.0 ms)`, `✔ a full run drops rows under a directory replaced by a symlink (19.3 ms)`.

## Manual verification (built CLI, throwaway repo under `/tmp`, sandboxed `HOME`)

Isolation: every write went to `mktemp -d /tmp/rof-man.XXXX` (repo, `HOME`, a `speclaw` wrapper → `dist/cli/index.js`), with `SPECLAW_NO_UPDATE_NOTIFIER=1`, `SPECLAW_NO_SELF_UPDATE=1`, `npm_config_registry=http://127.0.0.1:9/`. The only reads of the throwaway index used a read-only `node:sqlite` connection (`{ readOnly: true }`). The repo's own index was rebuilt once with `speclaw index` for `drift`; `docs/compass.md` was backed up first and restored after (sha1 `ff0319b2…`, mtime unchanged, map block `diff`-equal to HEAD).

| Step | Observed |
|------|----------|
| Fixture `src/a.ts` `foo`, `src/b.ts` `bar → foo`; `init --yes --agents claude` | exit 0, `.speclaw/index.db` built, `meta` = `fts5, schema_version 11, indexed_at` |
| Append `addedSymOne` to `a.ts`, Edit payload through the hook | symbol in `nodes` after ~500 ms; `meta.post_pending = 1`; `indexed_at` unchanged; `docs/compass.md` sha+mtime unchanged; no `compass-calls.jsonl` created |
| `speclaw explore addedSymOne` | `function addedSymOne src/a.ts:4-6`, callee `foo` |
| Dangling fix: `speclaw impact foo` after the per-file re-extract of `a.ts` | `depth 1 [exact]: bar (src/b.ts:2)`, `[exact]: addedSymOne`; `dst_node_id` not in `nodes` → `0` |
| Path mode on `$S/outside/o.ts`, `node_modules/x.ts`, `README.md`, `src/huge.ts` (2,857,780 B > 1,500,000 cap), `../outside/o.ts`, `src/nonexistent.ts` | each exit 0, 0 B out/err; fingerprint (files/nodes/edges counts, every `path:hash`, every `meta` row) identical |
| Deleted `src/c.ts` (hook) and `nb.py` (path mode) | rows removed (`files` = `src/a.ts`, `src/b.ts`), their symbols gone, `dangling 0` |
| `speclaw index` after the per-file runs | `post_pending` gone, `indexed_at` bumped, `pagerank` 0 → 4 rows, `docs/compass.md` rewritten (mtime 1791380545 → 1791380629); second `index` takes the fast path |
| Case-only rename `src/Case.ts` → `src/case.ts` + hook edit | two rows until the full run (review follow-up C1, non-blocking); `speclaw index` → single row `src/case.ts`, `caseSym` ×1; `index --force` → still single row |
| Concurrency: 3× `speclaw index --force` in a loop while 40 hook edits fire every 50 ms (20 new files, 20 edited) on a 123-file fixture | `full1/2/3 rc=0`, no `SQLITE_BUSY`/error in the log; all 40 symbols present, 20 new `files` rows; final `index` is a no-op (`143 unchanged · root unchanged`), `dangling 0` |
| No index | hook, path mode, and direct hook mode: exit 0, 0 B out/err, no `.speclaw/` created |

## Spec-scenario coverage — `code-graph` delta (141 scenarios)

### Added or amended by this change (31)

| Requirement | Scenario | Verified by |
|-------------|----------|-------------|
| Per-file fragment independence (amended) | Reindexing A leaves B untouched | `edge-ids.test.ts` (B's edge re-pointed, B's rows untouched); `indexFiles resolution matches a fresh full index`; full suite |
| `req~index-noop-fast-path~1` (amended) | A no-op run leaves the compact map untouched | `index-noop.test.ts` (unchanged suite, green) |
| `req~index-noop-fast-path~1` | A no-op run skips global post-processing | `index-noop.test.ts` (green) |
| `req~index-noop-fast-path~1` | An empty compact map block is refilled on a no-op run | `index-noop.test.ts` (green) |
| `req~index-noop-fast-path~1` | A changed file still runs the full pass | `index-noop.test.ts` (green) |
| `req~index-noop-fast-path~1` | **A pending per-file reindex forces the full pass** (new) | `index-noop.test.ts` "a pending per-file reindex forces the full pass, then the fast path returns"; manual: `post_pending` cleared, PageRank 0 → 4, map rewritten, second run no-op |
| `req~index-noop-fast-path~1` | Force, prune, and an explicit cache cap bypass the fast path | `index-noop.test.ts` (green) |
| `req~index-noop-fast-path~1` | The no-op index is not slower than main | `performance.md` metric A (branch vs main) |
| `req~reindex-on-edit~1` | No index means nothing happens | `reindex-file.test.ts` "without an index is silent and creates nothing"; `index-files.test.ts` stale/missing; manual no-index row |
| `req~reindex-on-edit~1` | An edited file is picked up in path mode | `reindex-file.test.ts` "path mode picks up an edit and a new function silently"; `index-files.test.ts` "picks up an edited body and a new symbol" |
| `req~reindex-on-edit~1` | A hook payload re-indexes the edited file | `reindex-file.test.ts` "hook mode re-indexes the payload's file in the background"; manual Edit/Write/MultiEdit/NotebookEdit (`cli.md`) |
| `req~reindex-on-edit~1` | Hook mode does not wait for the index | `reindex-file.test.ts` "hook mode does not wait for a locked index"; `reindex-file-cli.test.ts` "hook mode spawns the detached child and returns" |
| `req~reindex-on-edit~1` | A per-file run leaves global state alone | `index-files.test.ts` "leaves PageRank, indexed_at, and the compact map alone"; manual (compass.md sha+mtime, `indexed_at`) |
| `req~reindex-on-edit~1` | An unchanged file writes no node or edge | `index-files.test.ts` "on an unchanged file writes no node or edge and sets no marker" |
| `req~reindex-on-edit~1` | A deleted file is removed from the index | `index-files.test.ts` "removes a deleted file…"; manual deleted-file row |
| `req~reindex-on-edit~1` | Ineligible targets write nothing | `index-files.test.ts` "skips ineligible paths"; `reindex-file.test.ts` "ignores ineligible targets and malformed payloads"; manual fingerprint rows |
| `req~reindex-on-edit~1` | A malformed hook payload writes nothing | `reindex-file.test.ts` (malformed payloads); `reindex-file-cli.test.ts` "ignores bad payloads…"; manual garbage/empty/array/2 MB rows (`cli.md`) |
| `req~reindex-on-edit~1` | A locked database is swallowed | `reindex-file.test.ts` "path mode swallows a locked database" |
| `req~reindex-on-edit~1` | The last edit wins under overlapping runs | `reindex-file.test.ts` "the last edit wins when a run waits for the lock"; `index-files.test.ts` A1 test |
| `req~reindex-on-edit~1` | A full run keeps a file a per-file run indexed after its walk | `index-files.test.ts` B1 test (red in `.red-b1.txt`); manual concurrency row |
| `req~reindex-on-edit~1` | A full run drops a stored path its walk no longer yields | `index-files.test.ts` case-only rename + symlinked-directory tests (red in `.red-r2-1.txt`); manual case-only rename row |
| `req~reindex-on-edit~1` | A per-file run registers the path the walk yields | `index-files.test.ts` "registers a case-variant path under the walk's spelling", symlinked-directory guard, `walkWouldYield` units |
| `req~reindex-on-edit~1` | A stale schema writes nothing | `index-files.test.ts` "on a stale or missing index writes nothing"; A6 test (red in `.red-a1.txt`) |
| `req~reindex-on-edit~1` | The per-file run is not logged as a Compass call | `reindex-file.test.ts` "is not logged as a Compass call"; manual (no `compass-calls.jsonl`) |
| `req~reindex-on-edit~1` | Directory hashes match a full walk | `index-files.test.ts` "directory hashes equal a full walk and spare non-ancestors" |
| `req~reindex-on-edit~1` | Resolution matches a full index | `index-files.test.ts` "resolution matches a fresh full index" |
| `req~reindex-on-edit~1` | Help lists the reindex-file command | `reindex-file.test.ts` "help lists reindex-file and its --help prints usage"; e2e per-command help table; manual (`cli.md`) |
| `req~reindex-on-edit~1` | The per-edit cost stays below a full refresh | `performance.md` (C < A, D < B main) |
| `req~edge-ids-survive-reindex~1` | Callers survive a full re-index of the callee file | `edge-ids.test.ts` (red in `.red-dangling.txt`) |
| `req~edge-ids-survive-reindex~1` | Callers survive a per-file reindex of the callee file | `edge-ids.test.ts`; manual `impact foo` → `bar [exact]` |
| `req~edge-ids-survive-reindex~1` | A removed symbol leaves its callers unresolved | `edge-ids.test.ts` full + `indexFiles` variants (red in `.red-dangling.txt`) |

### Inherited from the canonical spec, text unchanged (110)

| Requirement (unchanged text) | Scenarios | Verified by |
|---|---|---|
| Id-first reverse reachability `req~impact-id-first~1` | Id-resolved edge is preferred over name match; Name-resolved results are flagged; Import-only dependent is found; Declaration-less importer is found; Calls in callbacks have an owner; Member calls on foreign receivers are not bound by name; Builtin globals bind only within the file; Package-namespace receivers are foreign; Scoped-looking paths aliases are project code; Pure re-export barrels are project code; A call through a barrel prefers the barrel's subtree; Single-segment baseUrl modules are project code; An imported project function named like a builtin binds across files; Restricting edge kinds excludes imports; A cyclic graph terminates | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Import resolution `req~import-resolution~1` | Multi-line import resolves; An import longer than the cap still resolves; tsconfig paths alias resolves per workspace; Malformed tsconfig does not fail indexing | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Grouped blast-radius output | Large blast radius is summarised; Flat format is available on request; Ambiguous symbol name is announced | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Global files never report empty impact | Touching tsconfig is repo-wide; Test-only change is empty for build target | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Schema records test and module metadata | Schema 7 database is rebuilt on open; Schema 9 migrates forward without wiping embeddings; Test files are marked at index time | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Schema 11 edge membership migration `req~schema-edge-membership~1` | Schema 10 migrates to 11 and keeps embeddings; A schema-11 index without edges.spec migrates in place; Reindex after migration recomputes no unchanged embedding; Failed 10 to 11 migration rolls back | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Static affected-test selection `req~affected-test-selection~1` | Only reachable tests are selected; Nothing selected yields no command; Vitest package gets a non-watch command; Compiled node test layout is mapped; Hoisted runner is inherited; Node test flag values stay with their flags; Directory argument selects the files under it; Workspace-spanning selection lists every group; Global file selects the full suite; Unindexed language degrades loudly; Diff mode uses git changed files | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Optional affected configuration | Missing config uses defaults | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Schema records per-symbol health metrics | Nested branches are counted for a function; LOC matches line span | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Hotspots join activity and health on two axes | Default window is ninety days; High-churn unhealthy file ranks above quiet clean file; Axes remain visible under combined sort; Shallow clone is announced | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Temporal coupling with graph contrast | Co-changing files without an AST edge are flagged; Member and builtin calls do not put a pair in the graph; Giant commits do not invent coupling; File and its test are marked isTestPair; Weak single co-commit is filtered | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Consolidated Compass MCP surface `req~compass-mcp-surface~1` | One explore call replaces impact and tests; Callees are resolved only; Callback callers are listed; File-owner nodes are hidden from find; Find always runs hybrid with mode as weights only; Diff context covers the working tree; Non-git diff without paths is refused; Visualize is CLI-only | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Directory hash tree | Unchanged repository short-circuits; A single changed file limits extraction; Emptying a directory changes the root | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Stat prefilter before content hash | Matching stat skips a read; Force bypasses the prefilter | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Embedding cache keyed by embedder input | Renaming a file recomputes nothing; Moving code between files recomputes nothing; Returning to a previous branch recomputes nothing; Identical symbols embed once; Recipe bump invalidates | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Embedding cache lifecycle | Orphans pruned on request; Size limit evicts least recently seen | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Schema migration preserves embeddings | Existing vectors survive migration; Failed migration rolls back | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Full-text index | Docstring text is searchable; Subtokens make camelCase reachable from prose; BM25 ordering is not inverted; Missing FTS5 support degrades instead of failing | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Rank fusion | Fusion uses ranks only; Exact name match is boosted; Query shape routes the weights | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Task-relative ranking | Focus changes the ordering; Focus defaults to the working state; Empty focus falls back to global importance; Generic names are penalized | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Token budget | Output respects the budget; A single oversized result is truncated, not dropped | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Hybrid retrieval quality gate | Golden set enforces MRR | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| No new runtime dependencies for hybrid retrieval | Default install has no downloads; Lexical embedder remains default | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Explore resolves a file path `req~explore-file-path~2` | Exact repo-relative path returns found true and a symbol from that file; Symbol-name explore is unchanged; A path that matches no file still may fuzzy-match names; File stem selects the matching symbol; Missing stem falls through to the first function; Unique basename resolves to that file; Ambiguous basename lists symbols from each file; Declaration-less file resolves to its file-owner node; Symbol-less file without references resolves to its file-owner node; Search fallback matches file paths | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Explore returns the exact symbol source `req~explore-exact-source~1` | Multibyte text before the symbol does not shift the source; A leading byte-order mark does not shift the source | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Session-start index refresh `req~session-start-index~1` | No index means nothing happens; An unchanged index refreshes silently; A changed file is picked up; A locked database is swallowed; The session-start run is not logged as a Compass call; Help lists the session-start command | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |

## Pre-existing / unrelated failures

None failing. Noted: the full-run `coverage_links` leak for removed files (A4) is pre-existing at HEAD (see `.red-a1.txt` header) and is fixed by this change. `verify`'s two `unknown` law results come from unresolved references in the repo index and are unchanged by a fresh `speclaw index`; they are not failures (exit 0).

## Pending manual steps

None. Review follow-ups C1 (a hook edit on a case-renamed file leaves the old spelling until the next full run — observed in the manual run and converged by it) and C2 (no NFC/NFD filename test) remain non-blocking.

## Verdict

PASS
