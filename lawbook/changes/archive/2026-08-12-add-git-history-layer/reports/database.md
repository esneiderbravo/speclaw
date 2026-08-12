# Database checks — add-git-history-layer (2026-08-12)

Date: 2026-08-12 · Branch: `feat/git-history-layer` · Environment: local macOS,
Node v24.17.0, cwd `/Users/esneiderbravo/Projects/speclaw`

Scope: the Compass index schema (`src/modules/compass/db.ts`) — the only
persistence in the project (`node:sqlite`, `.speclaw/index.db`, gitignored, no
migrations). This change adds one table and bumps the schema version.

## Gates & results

| Check | Command | Result |
| :-- | :-- | :-- |
| Type-check + compile | `npm run build` | ✅ `tsc` strict clean |
| Tests + coverage | `npm test` | ✅ `tests 150 · pass 150 · fail 0`; `db.js` line 98.51% / branch 88.89% / funcs 100% |
| Lint + format | `npm run check` | ✅ clean |

## Schema change

- Added table `git_history_cache(query_key TEXT PRIMARY KEY, head_sha TEXT NOT
  NULL, payload TEXT NOT NULL, computed_at INTEGER NOT NULL)` to the `SCHEMA`
  string in `db.ts`.
- Added `DROP TABLE IF EXISTS git_history_cache;` to `resetSchema()` (which drops
  by explicit name, so a new table must be listed or a reset would orphan it —
  this was the specific integration risk flagged in design).
- Bumped `SCHEMA_VERSION` `"3" → "4"`, so any pre-existing index is detected as
  stale, dropped, and rebuilt on next `openDb` (the existing `isStale` path).
  `.speclaw/` is regenerable, so no data migration is required.

Access is confined to `db.ts` (schema) and the compass-module wrapper
`git-history-cache.ts` (reads/writes), honoring "never scatter `node:sqlite`
access outside `compass/db.ts`" — the wrapper goes through `openDb`, not a raw
connection.

## Tests added / updated

- `test/integration/git-history-cache.test.ts`:
  - **cache hit at same HEAD** — after the first `cachedChurn`, the stored
    `payload` is overwritten with a sentinel via a raw `DatabaseSync`; the second
    call returns the sentinel, proving it read the row rather than recomputing.
  - **invalidation on HEAD move** — a new commit changes HEAD; `cachedChurn`
    recomputes (`src/a.ts` count 1 → 2), and `cachedCoChanges` likewise (1 → 2).
  - **reset drops+rebuilds the table** — populate the cache, force staleness by
    setting `meta.schema_version = '0'`, reopen: the table exists again and is
    empty, and the version is re-stamped to the current `SCHEMA_VERSION`.
- Existing `test/integration/db.test.ts` (version stamp, reopen-preserves-data,
  stale-rebuild) continues to pass against the bumped version.

## Spec-scenario coverage

| Scenario (delta spec) | Verified by |
| :-- | :-- |
| Persistent cache · A repeated query at the same HEAD is served from cache | `git-history-cache.test.ts` "serves a repeated query from the cache at the same HEAD" |
| Persistent cache · A new commit invalidates the cache | `git-history-cache.test.ts` "recomputes after a new commit moves HEAD" (+ co-change variant) |
| Persistent cache · dropped/rebuilt on schema reset (from the requirement text) | `git-history-cache.test.ts` "git_history_cache table is dropped and rebuilt on a schema reset" |

## Pre-existing / unrelated failures

None.

## Pending manual steps

None. The cache round-trip (populate → hit → invalidate) was also exercised in
the agent's throwaway-repo manual run, which writes only to a temp
`.speclaw/index.db` under `os.tmpdir()` — never a real store (Rule 6 / testing
standard).

## Verdict

✅ Schema addition, version bump, and reset behavior are correct, isolated to
`db.ts` + the compass wrapper, and covered by integration tests.
