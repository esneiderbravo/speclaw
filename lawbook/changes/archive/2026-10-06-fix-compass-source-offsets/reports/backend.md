# Backend checks — fix-compass-source-offsets (2026-10-06)

Date: 2026-10-06 · Branch: `fix/compass-source-and-session-index` · Environment/cwd: `/Users/esneiderbravo/Projects/speclaw` (macOS, Node ≥ 24), plus a throwaway temp repo under `/tmp/speclaw-es-*` (deleted afterward)

Discipline: backend (Compass query layer, `readSource` in `src/modules/compass/query.ts`). No `api.md` is owed. The `compass_explore` output shape, its inputs and its errors are unchanged. Only the value of `source` is corrected.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Lint + format | `npm run check` | ✅ exit 0. "All matched files use Prettier code style!" and ESLint clean |
| Type-check + compile | `npm run build` | ✅ exit 0. `tsc` clean, "copy-assets: copied assets for 3 module(s)" |
| Full test suite + coverage floor | `npm test` | ✅ exit 0. `tests 638 · pass 638 · fail 0 · cancelled 0 · skipped 0 · todo 0`. All files: 85.67% lines / 82.41% branches / 87.78% functions (floor 80%). `query.js` is at 97.85 / 87.84 / 97.87 |
| Regression test (green) | `node --test --test-name-pattern="explore returns exact source after multibyte text" dist-test/test/integration/compass.test.js` | ✅ exit 0. 1 test, 1 pass, 0 fail |
| Requirement coverage | `node dist/cli/index.js coverage --change fix-compass-source-offsets` | ✅ exit 0. `ok 1 - req~explore-file-path~1 (itest, impl)`, `ok 2 - req~explore-exact-source~1 (itest, impl)`, `ok - 2 total` |

## Tests added / updated

- **Added** `test/integration/compass.test.ts::explore returns exact source after multibyte text` (`// Covers: req~explore-exact-source~1`).
  - `src/multibyte.ts` has `—`, `«»`, `ñ` and astral emoji (🚀, 😀; surrogate pairs) before `export function target(…)`. The test asserts that `source` starts with `function target(`, ends with `}`, and equals the whole declaration.
  - `src/bom.ts` starts with a UTF-8 BOM (`\uFEFF`), followed by `ñandú 🚀`, then `export function bommed()`. The test asserts that `source` equals the whole declaration.
- The existing explore tests in the same file, including `req~explore-file-path~1`, are unchanged and pass in the full run.

### Red before the fix (verbatim from `reports/.red-before-fix.txt`)

```
$ git rev-parse --short HEAD -> ad68416 (readSource unfixed: buf.subarray byte slice)
$ node --test --test-name-pattern="explore returns exact source after multibyte text" dist-test/test/integration/compass.test.js
✖ explore returns exact source after multibyte text (46.034834ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 310.685042

✖ failing tests:

test at dist-test/test/integration/compass.test.js:57:1
✖ explore returns exact source after multibyte text (46.034834ms)
  AssertionError [ERR_ASSERTION]: » 😀";
  export function target(a: number): string {
    return "señal
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/integration/compass.test.js:69:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }
exit code: 1
```

The byte slice started early, inside the preceding line (`» 😀";\nexport …`), and was truncated at `return "señal`. This is the drift described in `bugfix.md` §2.

### Green after the fix (tester run, 2026-10-06)

```
$ node --test --test-name-pattern="explore returns exact source after multibyte text" dist-test/test/integration/compass.test.js
✔ explore returns exact source after multibyte text (44.085625ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 303.173375
exit code: 0
```

## Manual verification (built CLI)

1. **This repo, `node dist/cli/index.js explore isSymbolQuery`** returned `src/modules/compass/rank.ts:24-27`. The source starts at `function isSymbolQuery(q: string): boolean {` and ends at the closing `}`, matching `rank.ts` lines 24–27 exactly. The stray `"t "` prefix is gone. No reindex was needed because the fix is read-side only and the stored offsets were already correct.
2. **This repo, `node dist/cli/index.js explore buildTestCommand`** returned `src/modules/compass/affected.ts:230-265`. The source starts at `function buildTestCommand(` and ends with `return \`node --test ${args}\`;\n}`. There is no `"xport"` prefix and no truncation at `"${arg"`.
3. **Throwaway temp repo** (`mktemp -d`, `git init`, deleted afterward). `src/saludo.ts` has Spanish comments and strings with `ñ`, `«»`, `—`, `¡`, and the accented vowels `á é í ó ú ü` before two exported functions. I ran `node dist/cli/index.js index` and then `explore`:
   - `saludar` (`src/saludo.ts:5-7`) and `despedir` (`src/saludo.ts:10-12`) each return exactly `function …(…) { … }`, from `function` through the closing `}`.
   - Contrast on the same throwaway index, opened read-only:

     ```
     despedir offsets 408 502
       OLD buf.subarray: ": función de despedida con eñe. */\nexport function despedir(nombre: string): string {\n  retu"
       NEW text.slice : "function despedir(nombre: string): string {\n  return \"Adiós, \" + nombre + \" — hasta mañana\";\n}"
     saludar offsets 228 349
       OLD buf.subarray: " á é í ó ú ü ñ Ñ\";\n\nexport function saludar(nombre: string): string {\n  return `¡Hola, ${nombre}! «Bienvenido»"
       NEW text.slice : "function saludar(nombre: string): string {\n  return `¡Hola, ${nombre}! «Bienvenido» — año ${new Date().getFullYear()}`;\n}"
     ```

**Isolation:**
- Explore on this repo only reads the existing derived `.speclaw/index.db`. I ran no reindex here and wrote no user data.
- The Spanish-text check ran entirely in a `mktemp` repo with its own index, which I then deleted.
- `docs/compass.md` was already modified before testing (a map-block hub line). I snapshotted it and confirmed with `cmp` that the tester run left it byte-identical.

## Spec-scenario coverage

| Scenario (`req~explore-exact-source~1`) | Verified by |
|---|---|
| Multibyte text before the symbol does not shift the source | Integration test `explore returns exact source after multibyte text` (`target` assertions): red before the fix, green after. Manual: `isSymbolQuery`, `buildTestCommand`, and Spanish temp repo `saludar`/`despedir` |
| A leading byte-order mark does not shift the source | Same integration test (`bommed` assertion in `src/bom.ts`), green in the full run and in the targeted run |

## Pre-existing / unrelated failures

None. The full suite passed 638/638.

## Pending manual steps

None for verification. Docs/CHANGELOG, sync and archive tasks remain for the coordinator.

## Verdict

PASS
