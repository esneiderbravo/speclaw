# Proposal — add a shared git-history layer

## Why

Three of the highest-value roadmap pieces — `drift`, `trace`, and
`hotspots-coupling` — all need to answer questions about the **past** of the
repo: *how many times did this file change?*, *which commits touched this path
since the spec was archived?*, *which files always change together?* Compass's
graph knows how the code looks **now**; it has no notion of history.

Today `src/shared/git.ts` shells out to git only for `rev-parse
--is-inside-work-tree` (`isGitRepo`) and `ls-files` (`listTrackedPaths`). There
is not a single `git log` call. Without a shared layer, each of the three
consumers would reinvent its own history reading, git-output parsing, and
caching — triplicating the most error-prone part (parse + cache).

This change builds that layer **once**: a small, typed, fail-soft API over
`git log`, plus a persistent HEAD-keyed cache for the expensive full-history
scans. It is enabling infrastructure — no user-facing surface, no new MCP tool
or CLI command — the wiring that makes the three downstream features cheap
instead of expensive.

Source roadmap: `docs/roadmap/runtime/git-history.md`.

## What

- A pure, stateless engine in `src/shared/git-history.ts` that shells out to git
  via the existing `spawnSync` pattern and returns typed results, always
  fail-soft (empty result, never throw):
  - `logForPath` — commits that touched a path, with timestamp and lines
    added/deleted.
  - `churn` — change frequency per file over a window (for hotspots).
  - `coChanges` — co-occurrence pairs: for each `(A, B)`, how many commits touch
    both (for coupling).
  - `lastTouch` — SHA of the last commit that touched a path (for drift).
  - `headSha` / `isShallowRepo` — the primitives the cache and shallow marker
    need.
- A persistent cache for the two expensive scans (`churn`, `coChanges`) in
  Compass's existing `.speclaw/index.db`, keyed by query + `HEAD` SHA and
  recomputed only when `HEAD` moves. This lives in the **compass module**
  (which owns the DB), not in `shared`, to respect the inward-dependency rule.
- Shallow-clone detection: on a `--depth=1` clone `git log` returns one commit;
  `churn`/`coChanges` results carry a `shallow: true` marker so downstream
  consumers can degrade to "insufficient data" instead of reporting misleadingly
  low counts.

## Non-goals

- **No consumer wiring.** `drift`, `trace`, and `hotspots-coupling` are separate
  future changes; this delivers only the shared layer plus its tests.
- **No MCP tool or CLI command.** This piece has no user-facing surface.
- **No rename following in the aggregate scans.** `git log --follow` accepts a
  single path only; `churn`/`coChanges` use the current path and explicitly do
  not follow renames (a safe superset, not a precise history). `lastTouch` /
  `logForPath` are single-path and may follow renames later if a consumer needs
  it — out of scope here.

## Migrations

The Compass index schema gains one table (`git_history_cache`) and a
`SCHEMA_VERSION` bump. `.speclaw/` is fully regenerable, so no data migration is
needed: an existing index from the prior schema is dropped and rebuilt on next
open, exactly as today's `isStale` path already does.
