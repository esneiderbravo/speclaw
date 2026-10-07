# Review: fix-compass-source-offsets

- **Role:** reviewer (Cortex)
- **Change:** `fix-compass-source-offsets` (level 1, `changeType: bug`)
- **Branch:** `fix/compass-source-and-session-index`
- **Date:** 2026-10-06
- **Scope:** `bugfix.md`, `tasks.md`, `specs/code-graph/spec.md` delta, and the edits to
  `src/modules/compass/{query,db,extract,hash}.ts` and `test/integration/compass.test.ts`.
  The `index-at-session-start` files and `.claude/settings.json` are out of scope.
- **Compass calls:** 3 (`compass_diff_context`, `compass_explore readSource`, and the
  Compass-backed caller lookup). Grep/Read were used afterwards for non-symbol checks:
  SQL schema text, docs, and finding every `start_byte` consumer.

## Verdict: PASS

The fix is correct and as small as it can be. The root cause analysis checks out against
the code. The regression test asserts exact equality and was shown failing on the old
code. The findings below are minor and do not block. F1 and F2 should be handled before
archive.

## Correctness

| Check | Result |
|---|---|
| UTF-16 slicing | `readSource` (`src/modules/compass/query.ts:99-111`) decodes with `readFileSync(…, "utf8")` and runs `text.slice(startIndex, endIndex)`. The indexer reads the same way (`indexer.ts:378`, `readFileSync(filePath, "utf8")`), and `extract.ts:262-263/328-329` stores `node.startIndex/endIndex`. Write and read now use the same units. |
| BOM | Node's `utf8` decode does **not** strip a leading BOM, in the indexer or in `readSource`. Both sides see `﻿` at index 0, so the offsets agree. The test asserts exact equality for `bommed`, so if either side ever starts stripping the BOM, the test catches the 1-unit shift. |
| Astral chars | tree-sitter indices always fall on code-point boundaries, so `String.prototype.slice` cannot split a surrogate pair. The test covers 🚀 and 😀 before the symbol. |
| Error path | Unchanged: an unreadable or missing file returns `""`. If a file is edited after indexing, the offsets go stale. That limitation existed before this change and is not in scope. |
| Other byte-slicing consumers | **None.** I grepped `src/` for `start_byte`, `end_byte`, `startByte`, `endByte`, `subarray`, `startIndex`, and `endIndex`. The only offset slicers are `readSource` (fixed) and `rawHash` (`hash.ts:49-50`, already `source.slice` on the decoded string). Coverage attachment (`extract.ts:attachCoverage`) only compares offsets with each other. No `readFileSync`/`Buffer` use in `src/modules/compass` slices source. The blast-radius claim in `bugfix.md` §4 is accurate. |
| No schema bump / reindex | Confirmed. `db.ts` changes only comments. The new `--` lines inside the `SCHEMA` template are plain SQL comments run by `db.exec`. Nothing hashes or compares that string, so no staleness is triggered. |

## Doc-comment accuracy

- `db.ts:26-29` (`NodeRow`) and `db.ts:54-55` (SQL comment): accurate.
- `extract.ts:13-16, 55-58`: accurate.
- `hash.ts:45-47` (`rawHash`): accurate.
- `query.ts:86-98` (`readSource` TSDoc): accurate, and it records the constraint (why the
  file is decoded before slicing), which is the kind of comment the standards ask for.
- Nit, not blocking: `extract.ts:23` still says `bodyHash` is a "sha256-128 of exact
  source bytes", and `hash.ts:43` says "exact source bytes". Both are still true in effect
  (the UTF-8 encoding of the sliced string gets hashed), so leaving them is fine.
- `docs/compass.md` makes no claim about byte offsets or UTF encoding (grep: no matches),
  so no edit is owed there.

## Test quality

`test/integration/compass.test.ts:60-88`, `explore returns exact source after multibyte text`:

- It asserts **exact equality** with the whole declaration (`assert.equal(source, target)`),
  plus `startsWith("function target(")` and `endsWith("}")`. A shift or truncation of any
  size fails it.
- The fixture puts `—`, `«»`, `ñ`, and astral emoji before the symbol, and has a second file
  with a BOM (`src/bom.ts`).
- Red evidence (`reports/.red-before-fix.txt`): at `ad68416`, 1 test, 0 pass, 1 fail, failing
  on the `startsWith` assertion with the source beginning `» 😀";\nexport function target(`.
  That is the predicted early-slice signature. Bug gate §5 is satisfied.
- Note: the red run stopped at the first assertion, so the BOM half never ran on the old
  code. Its red-ness is implied (BOM, `ñ`, and 🚀 together add 9 extra UTF-8 bytes before
  `bommed`) but not observed. This is acceptable. The BOM fixture also has `ñ`/🚀 in it, so
  it does not isolate the BOM. Since it asserts exact equality, it still guards decode/parse
  agreement at offset 0.

## Spec delta

- `req~explore-exact-source~1` (`specs/code-graph/spec.md:679-695`) is a valid EARS
  event-driven requirement ("WHEN explore returns a symbol's source, Compass SHALL …"). It
  follows the single-sentence style of `req~explore-file-path~1`, has `Needs: impl, itest`,
  and has two scenarios that match the test's two halves one-to-one.
- The delta is the canonical spec (23 requirements) plus this one (24). Nothing else changed.
- `Covers` tags exist for both needs: `query.ts:85` (impl) and `compass.test.ts:60` (itest).

## Findings

**F1 (minor, should fix before archive): the impl `Covers` tag is not attached to `readSource`.**
`src/modules/compass/query.ts:85` puts `// Covers: req~explore-exact-source~1` *above* a
13-line TSDoc block. `attachCoverage` (`extract.ts:276-294`) binds a directive to the next
definition only when `next.startLine - c.endLine <= 2`. Here that is 99 − 85 = 14, so the
link is stored file-level (`node_id` NULL), not on `readSource`. Coverage will probably
still count it as `impl`. But drift and anchor tracking cannot bind the requirement to
`readSource`'s body, so a later regression in `readSource` would not show up as drift for
this requirement.
*Fix:* move the directive to the line just before `function readSource(`, either as the
last TSDoc line (` * // Covers: req~explore-exact-source~1`, as in
`cortex/harness.ts:173`) or between the `*/` and the function. Then reindex and confirm
with `speclaw coverage`.

**F2 (process, must handle at sync time): conflicting full-copy deltas for the same spec.**
`index-at-session-start/specs/code-graph/spec.md` is also a full copy of the canonical
spec, and it already contains `req~explore-exact-source~1` plus two more requirements. Sync
overwrites the whole file. So if this change syncs **after** `index-at-session-start`, it
silently drops `req~index-noop-fast-path~1` and `req~session-start-index~1` from the
canonical spec.
*Fix:* sync this change first and `index-at-session-start` last, or re-check the canonical
requirement count after both syncs (it should be 26).

**F3 (nit, optional):** the comments at `extract.ts:23` and `hash.ts:43` say "source bytes"
(see Doc-comment accuracy above). They are harmless and need no action.

## Remaining open tasks (not review defects)

Tasks 8–13 are still open: gates, manual CLI verification, `backend.md`, the CHANGELOG
`[2.0.7]` entry, sync, and archive. They belong to the tester and coordinator stages. When
the tester writes `backend.md`, it must include the red output and the green run (rule
`spec-reports-disciplines` §5). `api.md` is not owed: the `compass_explore` output shape is
unchanged.

## Rework guidance

None required for PASS. Do F1 before running `speclaw coverage` and archiving. Follow F2
when syncing.
