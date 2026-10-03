# API checks — compass-explore-path (2026-10-03)

Date: 2026-10-03 · Branch: `fix/compass-explore-path` · Environment: Node v24.17.0, darwin, cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Lint + format | `npm run check` | ✅ exit 0. `All matched files use Prettier code style!` ESLint emitted no findings. |
| Type-check + compile | `npm run build` | ✅ exit 0. `copy-assets: copied assets for 3 module(s)`. |
| Tests + coverage | `npm run test` | ✅ exit 0. `tests 530` / `pass 530` / `fail 0` / `skipped 0` / `duration_ms 23509.833875`. Coverage all files: lines 84.69%, branches 80.98%, functions 86.68%. |

Contract cases from that run:

```
✔ explore returns source, callees, and callers for an exact node (15.098208ms)
✔ explore falls back to fuzzy matches when no exact node exists (14.739125ms)
✔ explore resolves a repo-relative path or unique basename to a file symbol (35.105583ms)
```

There is no HTTP surface. The public contract is local: `explore(projectPath, query)` and `search(projectPath, query, limit?)` in `src/modules/compass/query.ts`, reached by MCP `compass_explore` (`node` may be a symbol name or a repo-relative file path) and by `speclaw explore` / search. No auth and no status codes. Outcomes are `found`, `symbol`, `message`, `otherMatches`, and (on a hit) source, callers, and callees. Signatures are unchanged. No schema bump, no new dependency, no file-level nodes.

## Tests added / updated

The integration test `explore resolves a repo-relative path or unique basename to a file symbol` (`// Covers: req~explore-file-path~1`) is the contract test. Assertions that passed:

- Path `src/main.ts`: `found === true`, primary symbol `gamma` in that file, `otherMatches` includes `alpha`, message matches `/resolved to gamma/`.
- Exact name `alpha` (separate existing test): `found === true`, source matches `/function alpha/`.
- Fuzzy `alph` (separate existing test): does not throw, `found === false`, `otherMatches` includes `alpha`.
- Search path `src/util.ts` returns `helper`. LIKE metacharacters `%` and `_` stay literal (`a%a` and `alp_a` do not match `alpha`). Name-substring search of `alpha` still hits.

**Regression before the fix.** The fix was not reverted. Previous `explore()` returned `found: false` and `No exact symbol named "<path>". 0 similar symbol(s) below.` for a repo-relative path. The new test requires `found === true` and a resolved-to-symbol message, so it would fail on that previous result. It passed after the fix.

Isolated manual exercise (temp indexed seed repo under the OS temp dir, removed after the call), not the user's `.speclaw` index:

```
explore("src/main.ts") → found true, symbol gamma, message: Path "src/main.ts" resolved to gamma., otherMatches includes alpha
explore("alph") → found false, otherMatches: ["alpha"], message: No exact symbol named "alph". 1 similar symbol(s) below.
explore("alpha") → found true, symbol alpha
```

## Spec-scenario coverage

| Scenario | Verification |
| --- | --- |
| Exact repo-relative path returns found true and a symbol from that file | Test + manual: `src/main.ts` → `found true`, `gamma`, message `Path "src/main.ts" resolved to gamma.` |
| Symbol-name explore is unchanged | Test + manual: `alpha` → `found true`, symbol `alpha`. |
| A path that matches no file still may fuzzy-match names | Test + manual: `alph` → `found false`, `otherMatches` includes `alpha`, no throw. |
| File stem selects the matching symbol | Test: `src/scroll.ts` → `scroll`; `src/util.ts` callers/callees match `explore("helper")`. |
| Missing stem falls through to the first function | Test + manual: `src/main.ts` → `gamma`. |
| Unique basename resolves to that file | Test: `main.ts` → `gamma` in `src/main.ts`. |
| Ambiguous basename lists symbols from each file | Test: `dup.ts` → `found false`, `fromA` and `fromB`, message matches `/ambiguous/i`. |
| Indexed file with zero symbols | Test: `src/blank.ts` → `found false`, message matches `/no symbols/i` and not `/0 similar/`. |
| Search fallback matches file paths | Test: `search("src/util.ts")` includes `helper`; `%` and `_` escaped; name substring `alpha` still matches. |

Other scenarios in the synced canonical code-graph spec are unchanged by this bug. The full suite still reports 530 pass / 0 fail.

## Pre-existing / unrelated failures

None in the recorded `npm run test` (530 pass / 0 fail).

## Pending manual steps

None. The tester ran `explore` for `src/main.ts`, `alpha`, and `alph` on a throwaway index.

## Verdict

PASS
