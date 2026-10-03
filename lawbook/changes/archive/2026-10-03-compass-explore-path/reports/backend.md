# Backend checks — compass-explore-path (2026-10-03)

Date: 2026-10-03 · Branch: `fix/compass-explore-path` · Environment: Node v24.17.0, darwin, cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Lint + format | `npm run check` | ✅ exit 0. `prettier --check . && eslint .` printed `All matched files use Prettier code style!` and ESLint emitted no findings. |
| Type-check + compile | `npm run build` | ✅ exit 0. `tsc && node scripts/copy-assets.mjs` printed `copy-assets: copied assets for 3 module(s)`. Package script identity `@esneiderbravo/speclaw@2.0.3`. |
| Tests + coverage | `npm run test` | ✅ exit 0. `pretest` compiled `tsconfig.test.json` and printed `prep-test-assets: package.json + assets for 3 module(s)`. Runner summary: `tests 530` / `pass 530` / `fail 0` / `cancelled 0` / `skipped 0` / `todo 0` / `duration_ms 23509.833875`. Coverage (all files): lines 84.69%, branches 80.98%, functions 86.68% (floors 80/80/80). `src/modules/compass/query.js`: lines 97.80%, branches 87.84%, functions 97.87%. |

The path regression and the unchanged name/fuzzy cases from this run:

```
✔ search finds a node by name substring (15.996417ms)
✔ explore returns source, callees, and callers for an exact node (15.098208ms)
✔ explore falls back to fuzzy matches when no exact node exists (14.739125ms)
✔ explore resolves a repo-relative path or unique basename to a file symbol (35.105583ms)
```

An earlier sandboxed `npm run test` failed git helpers with `fatal: not a git repository` because the sandbox could not see `.git`. That invocation is not the gate. The same command re-run with filesystem access is the result above (530 pass / 0 fail).

## Tests added / updated

`test/integration/compass.test.ts` — `explore resolves a repo-relative path or unique basename to a file symbol`, marked `// Covers: req~explore-file-path~1`. It indexes `seedSampleRepo` plus extra files under an OS temp directory (`tmpRepo`). Assertions that passed in the run above:

- `explore(root, "src/main.ts")`: `found === true`, symbol name `gamma`, kind `function`, file `src/main.ts`, source matches `/function gamma/`, `otherMatches` includes `alpha`, message matches `/resolved to gamma/`.
- `explore(root, "src/util.ts")`: `found === true`, symbol `helper`, callers and callees deep-equal `explore(root, "helper")`.
- Unique basename `main.ts` resolves to `gamma` in `src/main.ts`. `./src/main.ts`, `src\main.ts`, and an absolute path under the temp root also resolve.
- Stem `src/scroll.ts` selects function `scroll` (not the earlier function `other`). Class `onlyclass` and interface `Marker` win over an earlier non-matching symbol.
- `src/blank.ts`: `found === false`, message matches `/no symbols/i`, and does not match `/0 similar/`.
- Ambiguous basename `dup.ts`: `found === false`, message matches `/ambiguous/i`, `otherMatches` includes `fromA` (`lib/src/dup.ts`) and `fromB` (`pkg/src/dup.ts`). Shared suffix `src/dup.ts` stays `found === false` with both names.
- `search(root, "src/util.ts")` includes `helper` in `src/util.ts`. `search(root, "a%a")` and `search(root, "alp_a")` do not return `alpha`.

Existing cases stayed green: exact `explore(root, "alpha")` (`found === true`, source `/function alpha/`, callees include `beta` and `helper`, callers include `render`) and fuzzy `explore(root, "alph")` (`found === false`, `otherMatches` includes `alpha`).

**Regression before the fix.** The fix was not reverted. The new test's assertions are what would fail on the previous `explore()`. Before the fix, a path matched only `nodes.name`, so `explore(root, "src/main.ts")` returned `found: false` and a message of the form `No exact symbol named "src/main.ts". 0 similar symbol(s) below.` The test requires `found === true`, symbol `gamma`, and a message matching `/resolved to gamma/`. Those assertions fail on that previous result and passed after the fix (35.105583ms in the recorded run).

Manual check on a second throwaway index (seed fixture only, directory removed after the run) printed:

```
path "src/main.ts": found true, symbol gamma (function, src/main.ts), message Path "src/main.ts" resolved to gamma., otherMatches beta, alpha, Widget, render, Shape, Id
"alph": found false, otherMatches alpha, message No exact symbol named "alph". 1 similar symbol(s) below.
"alpha": found true, symbol alpha (function, src/main.ts)
```

## Spec-scenario coverage

Scenarios under requirement `req~explore-file-path~1`:

| Scenario | Verification |
| --- | --- |
| Exact repo-relative path returns found true and a symbol from that file | Integration test `src/main.ts` → `found true`, `gamma`, `otherMatches` includes `alpha`, message `/resolved to gamma/`. Manual temp index printed the same. |
| Symbol-name explore is unchanged | Existing test `explore returns source, callees, and callers for an exact node` (`alpha`). Manual temp index: `found true`, symbol `alpha`. |
| A path that matches no file still may fuzzy-match names | Existing test `explore falls back to fuzzy matches when no exact node exists`. Manual temp index: `alph` → `found false`, `otherMatches` `["alpha"]`, does not throw. |
| File stem selects the matching symbol | Integration test `src/scroll.ts` → function `scroll` (and `src/onlyclass.ts` / `src/Marker.ts` for class and interface). `src/util.ts` callers/callees match `explore("helper")`. |
| Missing stem falls through to the first function | Integration test `src/main.ts` → first function `gamma` (stem `main` matches nothing). |
| Unique basename resolves to that file | Integration test `main.ts` → `gamma` in `src/main.ts`. |
| Ambiguous basename lists symbols from each file | Integration test `dup.ts` → `found false`, `fromA` and `fromB`, message `/ambiguous/i`. |
| Indexed file with zero symbols | Integration test `src/blank.ts` → `found false`, `/no symbols/i`, message does not match `/0 similar/`. |
| Search fallback matches file paths | Integration test `search("src/util.ts")` includes `helper`; `a%a` and `alp_a` do not match `alpha`; shared suffix `src/dup.ts` lists both files. |

The other `#### Scenario` headings in `specs/code-graph/spec.md` are the pre-existing canonical code-graph spec (sync replaces the whole file). This bug does not change them. `npm run test` still reports 530 pass / 0 fail.

## Pre-existing / unrelated failures

None in the recorded unsandboxed run. The sandboxed git failures (`fatal: not a git repository`) did not reproduce once `.git` was visible.

## Pending manual steps

None. Path explore, exact `alpha`, and fuzzy `alph` were executed by the tester against a temp index, and the integration test encodes the same assertions.

## Verdict

PASS
