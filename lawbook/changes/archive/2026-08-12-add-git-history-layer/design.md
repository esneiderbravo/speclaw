# Design — shared git-history layer

## Approach

Split the piece across two layers so it respects speclaw's strictly-enforced
inward-dependency rule (`docs/standards/architecture.md`: **`src/shared/*` must
not import from `modules/`**):

1. **Pure engine — `src/shared/git-history.ts`.** Stateless functions that
   shell out to git with the existing `spawnSync` pattern from
   `src/shared/git.ts`. No DB, no caching, no module imports. Every function is
   fail-soft: a repo with no commits, a path with no history, or a missing git
   binary yields an empty result, never a throw — matching `isGitRepo`'s
   best-effort contract.

2. **Persistence — the compass module.** The HEAD-keyed cache for the two
   expensive scans lives with the DB it uses. The compass module may import
   `shared`; `shared` may not import compass. So the cache table is added to
   `src/modules/compass/db.ts` and a thin `src/modules/compass/git-history-cache.ts`
   wraps `churn`/`coChanges` with read-through caching.

This is the one place the roadmap needed correcting: it suggested putting the
API in `shared` **and** writing to the Compass DB from there, which would invert
the dependency arrow. Splitting engine (shared) from cache (compass) keeps both
layers legal and matches the existing rule "business logic never leaks into
persistence."

### Engine API (`src/shared/git-history.ts`)

```ts
interface CommitTouch { sha: string; ts: number; added: number; deleted: number; }
interface CoChange     { a: string; b: string; count: number; }
interface ChurnResult    { shallow: boolean; byPath: Map<string, number>; }
interface CoChangeResult { shallow: boolean; pairs: CoChange[]; }

function headSha(projectPath: string): string | null;
function isShallowRepo(projectPath: string): boolean;
function logForPath(projectPath: string, relPath: string,
                    opts?: { since?: string; until?: string }): CommitTouch[];
function churn(projectPath: string,
               opts?: { since?: string; pathspec?: string[] }): ChurnResult;
function coChanges(projectPath: string,
                   opts?: { since?: string; minSupport?: number }): CoChangeResult;
function lastTouch(projectPath: string, relPath: string): string | null;
```

Underlying git commands (all with `-C <p>`, `-c core.quotePath=false`, `--`
before paths, NUL-delimited `%x00` format markers):

| Function | git |
| :-- | :-- |
| `headSha` | `git … rev-parse HEAD` |
| `isShallowRepo` | `git … rev-parse --is-shallow-repository` |
| `logForPath` | `git … log --format=%x00%H%x00%ct%x00 --numstat <since..until> -- <path>` |
| `churn` | `git … log --numstat --format=%x00 [--since=<date>] -- <pathspec>` → sum per path |
| `coChanges` | `git … log --name-only --format=%x00 [--since=<date>]` → group by commit → pairs |
| `lastTouch` | `git … log -1 --format=%H -- <path>` |

`logForPath` bounds history with a **revision range** (`since..until`, exact —
drift's `<sha>..HEAD`); `churn`/`coChanges` bound it with a **date window**
(`--since=<date>`, approximate — hotspots' "last 90 days"). The two mechanisms
differ because `--since` is a soft traversal filter, not a hard boundary, and so
is unfit for the exact range drift needs.

Records are delimited by NUL format markers (`%x00`), never by splitting on `\n`
+ spaces, so paths with spaces are safe; `-c core.quotePath=false` keeps
non-ASCII paths as raw UTF-8 rather than git's default octal-escaped, quoted
form. `--numstat` emits `-\t-` for binary files; the parser maps `-` to `0` so
`added`/`deleted` never become `NaN`.

`churn` and `coChanges` set `shallow: true` from `isShallowRepo` so downstream
consumers can surface "insufficient data" instead of trusting truncated counts.
`logForPath`/`lastTouch` are exact single-path reads and do not carry the marker
(the roadmap scopes the marker to the aggregate scans).

### Cache (compass module)

`src/modules/compass/db.ts` gains:

```sql
CREATE TABLE IF NOT EXISTS git_history_cache (
  query_key   TEXT PRIMARY KEY,
  head_sha    TEXT NOT NULL,
  payload     TEXT NOT NULL,
  computed_at INTEGER NOT NULL
);
```

- `SCHEMA_VERSION` bumps `"3" → "4"`; the table is added to the SCHEMA string
  **and** to `resetSchema()`'s explicit drop list (it drops tables by name, so a
  new table must be listed or a reset would orphan it).
- `git-history-cache.ts` exposes `cachedChurn` / `cachedCoChanges`:
  1. Build `query_key` from the function name + normalized opts.
  2. Read the row; if it exists and its `head_sha` equals the current
     `headSha(projectPath)`, deserialize `payload` and return.
  3. Otherwise call the engine, serialize the result (a `Map` is stored as an
     array of `[path, count]` entries; `shallow` is stored alongside), upsert
     the row with the current HEAD, and return.
- Only the two expensive full-history scans are cached. `logForPath` and
  `lastTouch` are cheap single-path reads and are called directly.

## Alternatives weighed

- **In-process `Map` memo instead of the sqlite table.** The MCP server is
  long-lived, so a per-process memo would cover a single session cheaply and
  avoid the schema bump. Rejected per the explicit decision to persist: the CLI
  transport is short-lived (each `speclaw …` invocation is a fresh process), so
  only a persisted, HEAD-keyed cache survives across invocations — which is
  where the repeated cost actually lands.
- **Extend `src/shared/git.ts` in place.** Rejected (roadmap §7): history reads
  are expensive to pull into every call site that only wants `isGitRepo`. A
  separate `git-history.ts` keeps `git.ts` lean.
- **Put the cache in `shared` next to the engine.** Rejected: `shared` cannot
  import the compass module or its `openDb`, and giving `shared` its own second
  sqlite file would duplicate DB-lifecycle logic. Persistence belongs with the
  module that already owns `.speclaw/index.db`.
- **Follow renames everywhere (`--follow`).** Rejected for the aggregate scans:
  `--follow` takes a single path only. `churn`/`coChanges` declare no
  rename-following (safe superset); a future drift/trace change can opt in for
  its single-path queries.

## Trade-offs

- The cache is wiped whenever the Compass schema resets (version bump on
  upgrade, or `isStale`). Acceptable: it is HEAD-keyed and recomputes on demand;
  `.speclaw/` is regenerable by contract.
- `churn`/`coChanges` returning a `{ shallow, … }` wrapper (rather than a bare
  `Map`/array) is slightly more verbose at call sites, but it is the only way to
  carry the shallow marker the spec requires — a bare `Map` cannot.
- Shipping infrastructure with no live consumer yet. Justified: it is enabling
  by design, and the test suite exercises every function so it is not dead code.
