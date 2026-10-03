# Review — compass-explore-path

**Discipline:** review
**Change:** compass-explore-path
**Date:** 2026-10-03
**Branch:** fix/compass-explore-path
**Environment:** /Users/esneiderbravo/Projects/speclaw

## Verdict

Verdict: PASS

## Findings

`explore` in `src/modules/compass/query.ts` still selects `WHERE s.name = ?` first and returns `assembleExplore` for that row. `alpha` stays an exact hit. `alph` still misses the name and falls through to `search`, whose name predicate is `LIKE '%' || escaped query || '%'` with `ESCAPE '\'`, so `alpha` remains in `otherMatches` and `found` stays false.

On a name miss, `exploreWhenNameMisses` (marked `// Covers: req~explore-file-path~1`) calls `resolveIndexedFile`:

- `normalizePathQuery` trims, maps backslashes to slashes, strips one leading `./`, and turns an absolute path under the project root into a repo-relative path. A relative query is not joined onto the filesystem. `readSource` reads only `files.path` from the index, so a `..` segment in the query cannot escape the project.
- Exact `files.path` wins. A query that contains `/` uses a suffix (`path LIKE '%/' || escaped || ''`) only when that suffix is unique; otherwise it returns `none` and `search` lists the matching paths. `src/dup.ts` therefore stays `found: false` with both `fromA` and `fromB`, and the message is the search fallback, not the basename ambiguity message.
- A query with no slash and more than one suffix is `ambiguous`. `dup.ts` lists `fromA` (`lib/src/dup.ts`) and `fromB` (`pkg/src/dup.ts`).
- `symbolsInFiles` interpolates only `?` placeholders. Name, path, and suffix values are bound parameters.

`pickPrimary` matches the requirement. Stem equals the file name (`path.parse`): function, else class, else that stem symbol; if nothing is named the stem, the first function by `start_line`, else the first symbol. Against the fixture that yields `gamma` for `src/main.ts` (stem `main` matches nothing; `gamma` is the first function; `otherMatches` includes `alpha`), `helper` for `src/util.ts` because the stem is `util` and `helper` is the only function (callers and callees come from the same `assembleExplore` path as `explore("helper")`), `scroll` over the earlier function `other`, class `onlyclass` over function `nope`, and interface `Marker` over type `Other`. The resolved message is `Path "<file>" resolved to <symbol>.`

An indexed file with zero nodes (`src/blank.ts`; the indexer inserts the `files` row before extract) returns `found: false` and `Indexed file "…" has no symbols.` That message does not say `0 similar`.

`search` also matches `f.path` with `%` and `_` escaped, and still matches name substrings. `alpha` / `alph` contain neither metacharacter. The retrieval golden queries (`getItemN`, `validateTokenN`, prose) do not either, so the LIKE baseline is unchanged. `a%a` and `alp_a` no longer wildcard-match `alpha`.

`src/modules/compass/query.ts` imports `./db.js`, `./embedder.js`, and `./affected-config.js` only. It does not import foundation. No schema constant change (`SCHEMA_VERSION` remains `"10"`). No file-level nodes. `explore` / `search` signatures are unchanged, so `src/cli/commands/query.ts` and register stay thin. `package.json` and the lockfile root are `2.0.3` with the same dependency set. `docs/compass.md` states that `compass_explore`'s `node` may be a symbol name or a repo-relative file path. The new integration test carries `// Covers: req~explore-file-path~1` and asserts the contract cases above.

Quality-gate and discipline-report tasks in `tasks.md` stay open for the tester. That is the reviewing-stage split, not a defect in this diff.

## Rework

None.
