# Backend checks — ship-measures-level (2026-10-08)

2026-10-08 · `fix/ship-measures-level` · `/Users/esneiderbravo/Projects/speclaw` (macOS, Node 24.17.0)

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Format + lint | `npm run check` | ✅ Prettier clean, ESLint exit 0 (4.5 s) |
| Type-check + build | `npm run build` | ✅ `tsc` exit 0, assets copied (1.7 s) |
| Tests + coverage | `npm test` | ✅ 1039 tests, 1039 passed, 0 failed; lines 89.47 %, branches 85.89 %, functions 91.77 % |
| Change artifacts | `node dist/cli/index.js lawbook validate ship-measures-level` | ✅ valid, 3 delta specs, 0 EARS warnings |

## Tests added / updated

- `test/integration/ship.test.ts`: diff-measured level and owed artifacts before any gate; release
  bump; commit-body why; reopen of an outgrown level-0 archive; merged archive stays sealed;
  in-flight rise vs human-set level; `docHint` once per level and an unblocked stop; promoted
  proposal/tasks/why owed; a real "Make the …" task is not a stub; `$`-patterns in a commit body.
  Existing tests updated: level 0 no longer waits on prose.
- `test/unit/levels.test.ts`: score table for cuts `[5, 16, 25]` and public-API weight 5;
  hotspot needs real churn.
- `test/integration/tool-impact.test.ts`: `compass_explore` chain and `to` path sources;
  investigate anchored on test-reachable code; symlinked trace roots; index totals file.
- `test/unit/check.test.ts`: Bash reads nudge; heredoc, output filters and `sed -i` stay silent;
  nudge silent under 40 indexed files.
- `test/unit/hooks.test.ts`, `test/integration/hooks.test.ts`: `Read|Grep|Glob|Bash` matcher,
  `command` in the hook input, the doc-hint group.
- `test/unit/budget.test.ts`, `test/unit/mcp-budget.test.ts`: minimal profile keeps
  `speclaw_check` and `lawbook_investigate` (7 tools).

- `test/integration/mcp-surface.test.ts`: the new MCP-surface tests were first written over this
  existing file, dropping its two tests ("nine canonical MCP tools", "alias descriptions within
  twelve words"); caught before commit and restored, so the file now holds both plus three new ones.

## Regression tests failing first

Each fix's test was run against the pre-fix logic (same test file, only the fixed code reverted),
then against the fix:

| Fix | Before the fix | After |
|-----|----------------|-------|
| Young-repo hotspot (`levels.ts`) | `not ok 1` — `"maxHotspotScore":1` in a one-commit repo | `ok 1` |
| Explore chain, investigate reachability, symlinked roots | `# pass 0 · # fail 3` (`tool-impact.test.js`) | `# pass 3 · # fail 0` |
| Promoted stubs, real tasks, `$`-patterns, Bash filters / `sed -i` | `# pass 46 · # fail 4` (`ship` + `check` tests) | `# pass 50 · # fail 0` |

## Spec scenario coverage

| Scenario | Verified by |
|----------|-------------|
| ship: A multi-module diff is not level 0 | `ship measures the branch diff: a multi-module change owes its artifacts before any gate` |
| ship: A release bump does not raise the level | `a release bump of package.json does not raise the measured level` |
| ship: A human-set level stands | `a measured level in flight rises with the diff; a human-set level stands` |
| ship: An outgrown level-0 archive reopens | `a change archived at level 0 on this branch reopens when the diff outgrows it` |
| ship: A merged archive stays sealed | `an archive merged into the base is never reopened` |
| ship: Owed artifacts stop the gates | `ship measures the branch diff: …` (no gate runs, report null, owed list) |
| ship: Written artifacts let the gates run once | same test, second ship after `document()` |
| ship: The hint arrives before the stop | `docHint tells a level 1+ change what it owes once, while the agent still works`; MCP: `speclaw_check carries the documentation hint …` |
| ship: Written in the same turn, the stop is not blocked | `docHint tells …` (stop after writing: nothing pending, gates pass) |
| ship: Commit bodies are the why | `the branch's commit messages stand in for the record's why` |
| ship: A young repo has no hotspot | `a file counts as a hotspot only with real churn, …` |
| compass: A five-hop chain reads in one call | `compass_explore with maxDepth returns the callee chain with source in one call` |
| compass: Depth 1 keeps the previous shape | same test (`flat.chain` undefined) |
| compass: Path to a symbol | same test (`to: "roundCents"`) |
| compass: Code-reading tools are not deferred | `the code-reading and bug tools load up front, …` (in-memory MCP client) |
| compass: Instructions name a tool per job | same test (`getInstructions()`) |
| compass: Hooks work in a minimal project | `a minimal server still answers the hooks' speclaw_check` |
| compass: cat of a source file | `Bash reads of indexed code nudge like Read/Grep; …` |
| compass: A small repo stays silent | `the nudge stays silent in a repo too small for a graph query to beat a read` |
| compass: A heredoc write stays silent | `Bash reads of indexed code nudge …` (heredoc case) |
| investigate: Look-alikes off the path are not suspects | `investigate anchors suspects on code the failing test reaches, never the test itself` |
| investigate: The assertion frame is not ranked | same test (no suspect under `test/`) |
| investigate: Runtime frames are not listed | same test (`unresolvedFrames` empty) |
| investigate: macOS /tmp | `trace paths resolve under a symlinked project root` |

## Pre-existing / unrelated failures

None.

## Pending manual steps

None. Manual verification ran against throwaway fixtures only (`/tmp`): the per-level and
code-graph fixtures of `scripts/bench-fixture.mjs`, direct MCP calls to `lawbook_investigate` and
`compass_explore` on the `deep` fixture, `speclaw update` from 2.0.19 on a temporary project
(hooks gained `Bash` and `command`; skills refreshed), and hook latency timing. No real data store
is involved in this change.

## Verdict

✅ PASS — every gate green with real counts, every spec scenario mapped to a test, each fix proven red before green.
