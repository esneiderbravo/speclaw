# Design — requirement coverage (v1)

## Approach

Split by module ownership (architecture.md):

| Concern | Module | Why |
|---|---|---|
| Comment → link extraction during index | `compass` (`extract` walk + `coverage_links`) | Comments are AST nodes; index already walks the tree; derived data belongs in `.speclaw/index.db` |
| Spec item parse, report, adopt, archive gate | `lawbook` (`coverage.ts`, `spec-items.ts`, extend `engine.ts`) | Specs and archive preconditions are lawbook's domain; items are **not** persisted (always read fresh) |
| CLI / MCP | `cli/commands/coverage.ts`, `lawbook/register.ts` | Thin transports over the same report |

**Naming:** CLI `speclaw coverage`, tool `lawbook_coverage`. Never `trace` —
`speclaw trace` / `compass_trace` already mean call-path BFS.

**ID form:** explicit `` `req~name~rev` `` in the heading (GitHub-safe inline
code). Title renames must not break identity.

**Link discovery:** extend `extract()`'s existing tree walk to record
`comment` / `line_comment` / `block_comment` nodes; regex directives only on
those texts (strings never match). Attribute to next symbol (≤2 blank lines),
else innermost containing symbol, else file-level (`node_id` null).

**Type inference:** configurable globs; defaults `src/**`→`impl`,
`test/unit/**`+`test/**/*.test.ts`→`utest`, `test/integration/**`→`itest`.
Excluded paths do not count.

**Gate:** only direct defects on `Status: approved` (default) items that have
IDs. Missing IDs entirely ⇒ skip coverage reasons (backward compatible).

## Alternatives weighed

| Option | Rejected because |
|---|---|
| CLI/MCP name `*trace*` | Collides with Compass call-path; agents pick the wrong tool |
| Title-derived IDs + frontmatter revision | Cosmetic title edits orphan all links |
| Persist spec items in SQLite | Stale reports if specs edit without reindex — defeats the feature |
| `grep` over raw files | False positives from string literals |
| Block archive without IDs | Breaks every existing project on upgrade |
| Wait for `drift` to ship bootstrap | Blocks the differentiator on an undelivered piece |

## Trade-offs

- Path-inferred artifact types lose OFT's dual ids on every test; escape hatch
  is an optional explicit `utest~…` prefix later — not v1 ceremony.
- Dogfooding one canonical capability with real `Covers:` is required for DoD;
  full-repo adoption is a follow-up PR.
- Schema bump alone (not bundled with drift) may mean two reindexes if drift
  lands next — accepted to ship coverage now.
