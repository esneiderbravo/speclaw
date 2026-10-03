# Bugfix: compass-explore-path

**Level:** 1 · **Type:** bug · **Severity:** normal

## 1. Observed symptom

In other projects, `compass_explore` with `node` set to a repo-relative file path (example: `src/scripts/motion/scroll.ts`) returns:

- `found: false`
- `message: No exact symbol named "src/scripts/motion/scroll.ts". 0 similar symbol(s) below.`
- `otherMatches: []`

Agents then conclude Compass has no file-level nodes and fall back to reading the file. This is the same code in every indexed repo.

## 2. Minimal reproduction

On speclaw itself, current main:

1. `explore()` in `src/modules/compass/query.ts` lines 94–181 selects `WHERE s.name = ?`.
2. On zero rows it calls `search()` and reports `near.length` similar symbols.
3. `search()` lines 52–69 is `WHERE s.name LIKE '%query%'` only. `files.path` is selected but never filtered.
4. `defName()` in `src/modules/compass/extract.ts:83` stores the tree-sitter identifier, never the path.
5. Files live in the `files` table (`f.path`). There are no file-level nodes. That part is by design; the bug is that a path query does not resolve to the symbols in that file.

Existing contract tests in `test/integration/compass.test.ts`:

- "explore returns source, callees, and callers for an exact node" uses `explore(root, "alpha")` on the seed repo.
- "explore falls back to fuzzy matches when no exact node exists" uses `explore(root, "alph")` and expects `found` false plus `otherMatches` containing `alpha`.
- Seed files (`test/helpers/fixtures.ts`): `src/main.ts` (`gamma`, `beta`, `alpha`, `Widget.render`, `Shape`, `Id`), `src/util.ts` (`helper`), `src/calc.py`, `src/greet.js`.

A path query such as `explore(root, "src/main.ts")` therefore returns `found: false` and zero similar symbols.

## 3. Root cause

`explore` (`src/modules/compass/query.ts:94`) and `search` (`src/modules/compass/query.ts:52`) match only `nodes.name`. `files.path` is never consulted, so a path query returns zero similars.

`lawbook_investigate` ranked unrelated `*Path` helpers. That ranking is discarded. Direct source is the evidence.

## 4. Blast radius

`explore` (`compass_explore` include `blast_radius`): 41 nodes, 21 files, 6 modules. Direct consumers: `exploreRich` (`src/modules/compass/explore-rich.ts`), `runQuery` (`src/cli/commands/query.ts`). Also reaches `test/integration/retrieval.test.ts` `writeFixture`, `test/contract`, and the `test/unit` harness. `reachesPublicApi` is false in the summary, but `compass_explore` MCP and `speclaw explore` both call this function — the query behavior is the public contract.

`search`: 45 nodes, 24 files. `explore` is a caller. Same CLI/MCP surface.

## 5. Proposed fix

Logic stays in `src/modules/compass/query.ts`. CLI and `register.ts` stay thin. No new dependency. No schema bump. Do not invent file-level nodes.

1. Exact symbol-name match stays first and unchanged. `"alpha"` and the fuzzy `"alph"` → `alpha` fallback keep today's behavior.
2. When the name match misses and the query is a path, resolve `files.path`:
   - Normalize: trim, strip a leading `./`, turn backslashes into slashes, and if the string is absolute and starts with the project root, make it repo-relative.
   - Exact `files.path` match wins.
   - Else if the query contains a slash, a unique suffix match (path equals the query or ends with `/` plus the query).
   - Else a unique basename match (`scroll.ts`). If several files share that basename, `found` stays false and `otherMatches` lists symbols from those files (not an empty list), with a message that the basename is ambiguous.
3. When exactly one file matches and it has symbols:
   - `found: true`
   - Primary symbol: the one whose name equals the file stem (`scroll.ts` → `scroll`), preferring function then class; if none, the first function; if none, the first symbol. Order is deterministic (`start_line`).
   - Return that symbol's source, callers, and callees exactly as the name-hit path does.
   - `otherMatches`: the other symbols in that file (name, kind, file, line, signature).
   - Message states that the path resolved to that symbol.
4. When the file is indexed but has zero symbols, `found` is false and the message says so. Do not claim 0 similar symbols if sibling symbols exist.
5. `search()` (the explore fallback) also matches `files.path`, so a path-shaped query that does not resolve to one file still lists symbols from matching paths instead of 0. Escape LIKE metacharacters (`%` and `_`) in the pattern. Keep the existing name-substring behavior.
6. Implementer bumps `package.json` and `package-lock.json` from 2.0.2 to 2.0.3. Do not tag or publish in this change. The user publishes after merge.
7. `docs/compass.md` states that `compass_explore`'s `node` may be a symbol name or a repo-relative file path.

Discarded: inventing file-level nodes, a schema bump, and the `lawbook_investigate` ranking of unrelated `*Path` helpers.

## 6. Regression test

`test/integration/compass.test.ts` using `seedSampleRepo`. The new test must fail on current main (before the fix) and pass after. Mark it with `// Covers: req~explore-file-path~1`.

- `explore(root, "src/main.ts")` finds a symbol defined in that file (stem `main` matches nothing, so the primary is the first function, `gamma`), `found` true, `otherMatches` includes `alpha`.
- `explore(root, "src/util.ts")` resolves to `helper` (stem match) with callers/callees behavior consistent with exploring `"helper"`.
- A basename that is unique works; document the case. Ambiguous basename is optional if the fixture has no collision — do not add a second fixture file unless it is cheap.

Also mark the implementation in `src/modules/compass/query.ts` with `// Covers: req~explore-file-path~1` so the archive coverage gate (impl + utest) is satisfied.

## 7. Prevention

The code-graph spec is missing a requirement that explore resolves a file path. Add requirement `req~explore-file-path~1` to the code-graph delta (full canonical spec plus the new requirement; sync overwrites the whole file). Heading:

### Requirement: Explore resolves a file path `req~explore-file-path~1`

Scenarios cover: an exact repo-relative path returns `found` true and a symbol from that file; symbol-name explore is unchanged; a path that matches no file still may fuzzy-match names (`alph` → `alpha`) and does not throw.
