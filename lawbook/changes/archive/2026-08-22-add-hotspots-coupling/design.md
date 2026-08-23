# Design — hotspots-coupling

## Approach

| Concern | Module | Why |
| --- | --- | --- |
| Nesting / branches / LOC | `compass/extract.ts` + `languages.ts` | One extra walk during the parse we already pay for |
| Persist metrics | `node_metrics` table (schema 8) | Keep `nodes` hot-path skinny; CASCADE with definitions |
| Activity + co-change math | `shared/git-history.ts` + existing HEAD cache | Plumbing exists; only extend shapes / filters |
| Join + ranking | `compass/hotspots.ts` (new) | One place for both tools; CLI/MCP stay thin |
| `in_graph` / `isTestPair` | query against `edges` + `files.is_test` | Free after impact-affected |

**Hotspot model (two axes, no magic number as sole truth):**

```
file activity (90d)          AST health (worst symbol)
commits / lines / authors  ×  loc / nesting / branches
                ↓
        sortBy = churn | complexity | combined*
        *combined = heuristic; axes always returned raw
```

**Coupling model:**

```
co-commits(A,B) / (commits(A)+commits(B)-co)
  + in_graph?  + isTestPair?
  discard commits that touch > maxFilesPerCommit
```

## Alternatives weighed

| Option | Rejected because |
| --- | --- |
| LOC-only hotspots (no nesting/branches) | Weak signal; fails the “unhealthy” half of the story |
| Rebuild `commit_files` warehouse now | Overkill; HEAD-keyed cache already covers agent latency |
| Single composite score only | Undefendable; CodeScene itself separates axes |
| Skip coupling until later | Coupling is the differentiator vs “just churn” |
| New capability name (`hotspots`) | Belongs under living `code-graph` + `git-history` |

## Trade-offs

- **Schema 8 after 7** — second reindex in two patches; accepted to keep features shippable.
- **+2 MCP tools** — token cost; both minimal-omitted; tool-surface still owed.
- **90d default** — fresher signal, less history on old monorepos; callers can widen `since`.
- **Giant commits discarded** — prettier/lockfile bumps stop poisoning coupling; diagnostics report how many were skipped.

## File plan

```
src/modules/compass/db.ts              SCHEMA 8; node_metrics
src/modules/compass/languages.ts       nesting/branching node-type sets
src/modules/compass/extract.ts         health frames during walk
src/modules/compass/indexer.ts         insert node_metrics
src/shared/git-history.ts              richer activity + strength + maxFiles
src/modules/compass/git-history-cache.ts  cache new shapes
src/modules/compass/hotspots.ts        NEW hotspots() + coupling()
src/modules/compass/register.ts        +compass_hotspots, +compass_coupling
src/cli/commands/query.ts or hotspots.ts  CLI verbs
src/shared/exposure.ts                 MINIMAL_OMIT both tools
test/unit/metrics.test.ts              NEW
test/unit/hotspots.test.ts             NEW
test/integration/hotspots.test.ts      NEW
```
