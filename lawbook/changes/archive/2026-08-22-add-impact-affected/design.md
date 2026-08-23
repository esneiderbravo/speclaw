# Design — impact-affected (level 1)

## Approach

| Concern | Module | Why |
| --- | --- | --- |
| Reverse reachability CTE | `compass/query.ts` (`impact`, `impactGrouped`) | Logic lives once; CLI + MCP stay thin |
| `files.is_test` / `files.module` | `compass/db.ts` + indexer | Index-time classification beats `LIKE` at query time |
| Affected-test selection | `compass/affected.ts` (new) | Keeps query.ts from growing a second domain |
| Config load/validate | `compass/affected-config.ts` (new) | Defaults + optional `.speclaw/affected.json` |
| `git` plumbing | reuse `shared/git.ts#changedFiles` | Already exists, unused — no parallel helper |
| MCP / CLI | `register.ts`, `cli/commands/query.ts` | Transport only |

**Truth model:**

```
changed files / symbol
        │
        ▼
  globalFiles match? ──yes──▶ blastRadius: "repo" (+ reason)
        │ no
        ▼
  recursive CTE (id-first, name fallback; call+import)
        │
        ├─▶ impactGrouped (module buckets, top-N, exact/by-name)
        └─▶ filter files.is_test = 1 → affectedTests + command
```

**Why CTE over the JS depth loop:** one round-trip, cycle-safe with `UNION`,
and `dst_node_id` can participate in the join. The current name frontier cannot
express "this edge resolves to node 42" without losing identity at every hop.

**Why grouped default:** a 200-row flat list is a known agent antipattern
(context burn). Counts + representatives preserve actionability; `format=flat`
covers scripts that need the full set (hard-capped + `truncated`).

**Why `files.is_test` not path `LIKE`:** globs live in one place (config →
indexer); the query stays index-friendly; renames recalculate on reindex.

## Alternatives weighed

| Option | Rejected because |
| --- | --- |
| Keep name-only frontier; just raise depth | Leaves the collision bug intact |
| Level 2 coverage narrowing in the same change | 2–3 weeks; needs per-test coverage runs; blocks the 80% value |
| Three new MCP tools | Token cost per session; `tool-surface` roadmap exists to shrink surface |
| Always return flat list | Breaks agent usability on real blast radii |
| Empty result for `tsconfig` | "Dangerously misleading" — industry consensus (Nx globals) |
| Hard-code `node --test` only | Wrong for consumer repos with `vitest`/`pytest` wrappers |

## Trade-offs

- **Breaking MCP shape** for `compass_impact` — accepted; document in CHANGELOG;
  CLI human table can absorb it without a flag day.
- **Static selection is a superset** — may run tests that would not fail;
  never the reverse. Correct for CI safety; precise mode is a later opt-in.
- **Unindexed languages** (Go, etc.) under-select silently unless we warn —
  MUST emit warnings for present-but-unindexed extensions.
- **Schema 7 after schema 6 (drift)** — second forced reindex in two releases;
  accepted to keep features shippable independently.

## File plan

```
src/modules/compass/query.ts          rewrite impact; add impactGrouped
src/modules/compass/affected.ts       NEW selection + command builder
src/modules/compass/affected-config.ts NEW defaults + JSON load
src/modules/compass/db.ts             SCHEMA 7; files.is_test, files.module
src/modules/compass/indexer.ts        populate is_test / module
src/modules/compass/register.ts       reshape compass_impact; +compass_affected_tests
src/cli/commands/query.ts             impact table; affected-tests --from-diff
src/shared/git.ts                     reuse changedFiles (no API change expected)
test/unit/impact.test.ts              NEW
test/unit/affected.test.ts            NEW
test/integration/affected-tests.test.ts NEW
```
