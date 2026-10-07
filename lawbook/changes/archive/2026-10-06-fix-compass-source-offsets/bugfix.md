# Bugfix: fix-compass-source-offsets

**Level:** 1 · **Type:** bug · **Severity:** normal

## 1. Observed symptom
`compass_explore` returns a shifted or truncated `source` for some symbols:

- `isSymbolQuery` (`src/modules/compass/rank.ts`) comes back starting with
  `"t function isSymbolQuery…"`.
- `buildTestCommand` (`src/modules/compass/affected.ts`) comes back starting with
  `"xport function…"` and ending at `"${arg"`.

On repos with Spanish text (`ñ`, `«»`, accented vowels) the drift is large
enough that agents stop trusting Compass and fall back to grep.

Out of scope: when the `include` list leaves out `"source"`, explore returns an
empty `source` on purpose (the explore-rich `withoutSource` path). That is not
this bug.

## 2. Minimal reproduction
1. `speclaw index` on this repo.
2. `compass_explore isSymbolQuery`.
3. The stored `start_byte` is 621. That is the UTF-16 index of the
   `function_declaration` node, so it points at `function`, not at `export`
   (the export statement wraps the declaration). In UTF-8 bytes the declaration
   starts at 623, because a multibyte `—` comes earlier in the file. Slicing
   bytes at 621 lands 2 bytes **early**, inside `export`. The 2 bytes `"t "` are
   the tail of `export `, and the declaration follows them:
   `"t function isSymbolQuery…"`. The end offset lands early by the same amount,
   so the tail of the symbol gets cut off (`"${arg"` for `buildTestCommand`).

## 3. Root cause
`readSource` (`src/modules/compass/query.ts`) read the file as a `Buffer` and
returned `buf.subarray(startByte, endByte)`. That slices bytes, but the offsets
it gets are UTF-16 code-unit indices. web-tree-sitter parses the decoded string
(`src/modules/compass/indexer.ts` reads with `utf8`), and
`src/modules/compass/extract.ts` stores `node.startIndex` / `node.endIndex` into
`nodes.start_byte` / `nodes.end_byte`. Despite the `*_byte` names, these columns
hold UTF-16 offsets.

Each character takes at least as many UTF-8 bytes as UTF-16 code units: ASCII is
1 and 1, BMP non-ASCII is 2–3 bytes and 1 unit, astral is 4 bytes and 2 units.
So for any position, the byte offset is greater than or equal to the UTF-16
offset. A byte slice at a UTF-16 index therefore always starts at or **before**
the symbol, never after it. The slice moves earlier by one step for each extra
UTF-8 byte that comes before the symbol, and the end moves earlier by the same
amount or more.

## 4. Blast radius
`readSource` has one caller: `assembleExplore` (`query.ts`). That is reached
from `explore` and `exploreWhenNameMisses`, which serve the `compass_explore`
MCP tool and the `speclaw query`/explore CLI path (`src/cli/commands/query.ts`
`runQuery`). The graph reports about 37–52 blast nodes across `src/modules`,
`src/cli`, and `test/`. That count is file-level reach, not call sites that
misbehave. The only wrong output is the `source` field of explore results.

Other users of the offsets already use UTF-16 units, so they are not affected:
- `rawHash`: `src/modules/compass/hash.ts` (`source.slice`).
- Coverage comment attachment: `extract.ts`.
- Drift/anchors: these read only `body_hash`.
- `node_text`/FTS and embeddings never slice by offset.

No stored data is wrong, so this fix needs **no schema bump, no reindex, and no
drift reseal**.

## 5. Proposed fix
Status: implemented.

- `readSource` now calls `readFileSync(path, "utf8")` and returns
  `text.slice(startIndex, endIndex)`. The parameters are renamed from
  `startByte`/`endByte` to `startIndex`/`endIndex`.
- Doc comments now state the offset contract: the values are **UTF-16
  code-unit offsets into the decoded source**, even though the names say
  `*_byte`. They are on:
  - `src/modules/compass/db.ts` (the `start_byte`/`end_byte` columns)
  - `src/modules/compass/extract.ts` (the fields)
  - `src/modules/compass/hash.ts` (`rawHash`)

Rejected alternatives:
- **Rename the columns** to `start_index`/`end_index`. This would force a schema
  bump (10→11) and a reindex just for naming. Rejected.
- **Store real byte offsets** (byte conversion at extract time). This would
  break `rawHash` and comment attachment, which use UTF-16 units, and would also
  force a reindex. Rejected.

## 6. Regression test
`test/integration/compass.test.ts::explore returns exact source after multibyte text`

- Builds a temp repo with a `.ts` file. The file has text with `—`, `«»`, `ñ`
  and an astral emoji (a surrogate pair) before `export function target(…)`.
- Adds `src/bom.ts`, a file that starts with a UTF-8 BOM and defines `bommed`.
  This checks that decoding and the parser agree on offset 0.
- Runs `buildIndex`, then `explore` for `target` and `bommed`.
- For `target`, asserts that `source` starts with `"function target("`, ends
  with `"}"`, and equals the whole declaration. The stored range covers the
  `function_declaration`, not the `export` keyword.

Red before the fix: `reports/.red-before-fix.txt` shows 1 test, 0 pass,
1 fail. The returned source began with `» 😀";\nexport function target(`, which
is the early byte slice described in section 2.

## 7. Prevention
- Doc comments on the offset contract (section 5), so the next reader of
  `*_byte` knows the values are UTF-16 offsets.
- The regression test above.
- Delta requirement `req~explore-exact-source~1` in `specs/code-graph/spec.md`,
  so the exact-source guarantee is part of the spec and tracked by coverage.

New law: none. There is a single slicing consumer, the regression test covers
it, and an executable law cannot easily detect "byte vs UTF-16 slicing" in
general.
