# add-impact-affected — fix blast radius and select only the tests that matter

## Why

`compass_impact` already answers "who depends on this?", but it answers
**wrong often enough to be dangerous**:

1. The frontier walks **symbol names**, not node ids — three `validate`
   functions contaminate each other (silent false positives).
2. Only `call` edges are traversed — an importer that never calls is invisible.
3. The result is a **flat list** of every reachable symbol — unusable in an
   agent context window once the radius grows.
4. Touching `tsconfig.json` / a lockfile reports **zero dependents** — the most
   expensive lie a blast-radius tool can tell.

The industry already solved the useful half of this problem: Bazel
`rdeps` + `kind(test, …)`, Jest `--findRelatedTests`, Nx named inputs. Speclaw
already has the graph; what is missing is correct reverse reachability and a
test-selection surface on top of it.

This is roadmap piece **impact-affected** (`docs/roadmap/runtime/impact-affected.md`),
ordered after drift (#8). Explore chose **level 1 only** (static, Jest-style
superset) — coverage-based narrowing (level 2) is an explicit non-goal of this
change.

## What

1. **Rewrite `impact()`** as one recursive CTE that prefers `edges.dst_node_id`
   and falls back to `dst_name` only when the id is NULL; traverse `call` **and**
   `import` by default; flag every result as `exact` | `by-name`.
2. **Grouped output by default** — counts per module + top-N representatives;
   `format: "flat"` remains as an escape hatch (breaking MCP shape, documented).
3. **Global files** — configurable globs (defaults: `tsconfig*`, lockfiles,
   `package.json`, config files). A match returns `blastRadius: "repo"` with
   reason — **never** an empty "nothing depends on this".
4. **Schema `"6"` → `"7"`** — `files.is_test` and `files.module` populated at
   index time from configurable test globs / path heuristics.
5. **New MCP tool `compass_affected_tests`** (+ CLI
   `speclaw query affected-tests --from-diff`) — static reverse reachability
   from changed files/symbols to test files; returns a ready-to-run `command`
   derived from `package.json#scripts.test` (or `node --test` fallback).
6. **Optional `.speclaw/affected.json`** — overrides for `globalFiles`,
   `testGlobs`, named `targets` (`build` / `test` / `lint`); missing file ⇒
   embedded defaults.

## Non-goals

- Coverage-derived precise narrowing (level 2 / `test_coverage` table)
- Wiring the Lawbook `build` step to call `affected_tests` automatically
  (follow-up; keeps this change focused on Compass correctness)
- Renaming `compass_impact` / `speclaw impact`
- Dynamic / runtime dependency discovery beyond the indexed graph
- Replacing Bazel/Nx for monorepo orchestration

## Migrations

Yes — Compass `SCHEMA_VERSION` `"6"` → `"7"` (add `files.is_test`,
`files.module`; forced reindex). `speclaw update` migration note for the next
patch (0.3.10). MCP `compass_impact` result shape is a **breaking** tool-contract
change (grouped by default). Dogfood: `speclaw query impact <hub>` and
`speclaw query affected-tests --from-diff` on this repo, with collision and
global-file fixtures in tests.

## Decisions locked in explore

| Decision | Choice |
| --- | --- |
| Scope | Level 1 (static) only |
| Default impact output | Grouped; `format=flat` opt-in |
| Config | Embedded defaults + optional `.speclaw/affected.json` |
| Test command | Prefer `package.json` `scripts.test`; else `node --test` |
| Lawbook build wire | Out of this change |
| Schema bump | `"6"` → `"7"` (doc's `"3"→"4"` was stale) |
