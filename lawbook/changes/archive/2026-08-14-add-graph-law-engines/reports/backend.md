# Backend checks — add-graph-law-engines (2026-08-14)

Date · Branch `feat/graph-law-engines` · Environment: local, `/Users/esneiderbravo/Projects/speclaw`, Node `node:sqlite`, macOS.

## Gates & results

| Check | Command | Result |
| :-- | :-- | :-- |
| Format + lint | `npm run check` | ✅ Prettier "All matched files use Prettier code style!"; ESLint 0 problems |
| Type-check + compile | `npm run build` | ✅ `tsc` strict clean; `copy-assets: copied assets for 3 module(s)` |
| Tests + coverage | `npm test` | ✅ 201 tests, 201 pass, 0 fail; coverage 98.20% lines · 90.08% branches · 97.01% functions (floor 80%) |

New-file coverage (from the same run): `deps.js` 99.15 / 88.57 / 90.91 · `graph.js` 99.54 / 88.41 / 100 · `verify.js` 97.22 / 90.63 / 100 · `laws.js` 98.60 / 95.00 / 100 · `doctor.js` 96.19 / 83.93 / 92.86.

## Tests added / updated

- **`test/unit/laws.test.ts`** — model: `hasBackend` stays the action-time gate (path only, not deps/graph); `hasBatchBackend` covers deps/graph; a `deps` rule payload validates and round-trips; a legacy `{ kind: "path" }` entry still validates; a malformed `deps` regex is rejected at validation time **naming the law id** (asserts `/law~bad~1/`); `regexError` flags an invalid pattern. Updated the pre-existing `hasBackend` case from `deps` (which now carries a required rule) to `ast`.
- **`test/unit/deps.test.ts`** (new) — forbidden dependency detected with source file + line + destination; group matching (`$1`) forbids cross-feature imports while allowing same-feature via `toNot`; unresolved edges in scope counted (`unresolved === 1`), not treated as clean; `required` rule (absence is the violation); `paths` filter restricts source files.
- **`test/unit/graph.test.ts`** (new) — `tarjanSCC` groups a cycle and isolates acyclic nodes; minimal cycle reported inside a larger SCC (3-file cycle inside an 8-file component, "SCC size 8"); an intra-file self-dependency is not a cycle; cycle detection survives a **8,000-file deep chain** without overflowing (the case a recursive Tarjan would blow up); `reachable` forbids a transitive path and passes when none exists.
- **`test/integration/verify.test.ts`** (new) — passed/failed/unknown distinguished in one indexed run with disjoint buckets; missing index skips every batch law with reason `no-index` (+ remediation detail); `engines` filter; `lawIds` filter; an `ast` law is inert (counted in no bucket); no manifest yields an empty, well-formed report.

TDD evidence: the model change deliberately broke the pre-existing `laws.test.ts` line (`{ kind: "deps" }` without a rule stopped compiling under the discriminated union) — the failure surfaced the exact call sites that needed the rule payload, which were then fixed.

## Spec-scenario coverage

| Scenario (delta spec) | Verified by |
| :-- | :-- |
| A law with an unimplemented backend is declared but inert | `verify.test` "an ast law is inert"; `doctor.ts` "declared without a backend yet" |
| A graph backend never runs on the action path | `laws.test` "hasBackend is the action-time gate"; `check.ts` unchanged (opens no DB) |
| Passed, failed, and unknown are distinguished in one run | `verify.test` "distinguishes passed, failed, and unknown" |
| Missing index does not silently pass graph laws | `verify.test` "missing index skips every batch law with reason no-index" |
| Engine filter restricts what runs | `verify.test` "engines filter runs only the requested engine" |
| Forbidden dependency is detected with provenance | `deps.test` "forbidden dependency is detected with the source file and line" + manual (§ below) |
| Group matching forbids cross-feature imports with one rule | `deps.test` "group matching forbids cross-feature imports but allows same-feature" |
| Unresolved edges are reported as unknown, not passed | `deps.test` "unresolved edges in scope are counted" + `verify.test` unknown bucket |
| Minimal cycle is reported instead of the whole component | `graph.test` "reports the minimal cycle inside a larger component" |
| Intra-file self-dependency is not a cycle | `graph.test` "an intra-file self-dependency is not a cycle" |
| Cycle detection survives deep import chains | `graph.test` "survives a deep import chain without overflowing" (n=8000) |
| A deps rule payload is validated | `laws.test` "a deps law with a rule payload validates and round-trips" |
| A legacy path law still validates | `laws.test` "a legacy { kind: 'path' } manifest entry still validates" |
| A malformed rule payload is rejected at validation time | `laws.test` "a malformed deps regex is rejected … naming the law id" |
| Doctor reports graph-engine availability | `doctor.test` "reports graph-engine availability … without an index" |
| Malformed glob is caught at generation time | `laws.test` `globError` + pre-existing `doctor` glob check |
| (Pre-existing: seed/preserve manifest, hooks, merge, action eval, context coverage) | Unchanged; covered by the existing check-dispatcher suite (`hooks.test`, `check.test`, `doctor.test`, `laws.test`), all still green |

## Manual verification (agent-run, isolated)

Ran the real CLI against a throwaway `mktemp -d` repo (removed after), never touching real data:

1. **No-index:** `speclaw laws verify` → `0 passed · 0 failed · 2 skipped · 0 unknown`, both laws `skipped: no-index` with the `compass_index` remediation.
2. **Indexed:** built the graph with the real `speclaw index` (2 files, 2 edges), then `speclaw laws verify` → `1 passed · 1 failed`, finding `law~no-domain-to-infra~1 — src/domain/order.ts:3 → src/infra/http.ts` (real file, real line, real destination); the `graph` no-cycles law passed on the acyclic graph.
3. **JSON:** `--json` summary `{"evaluated":2,"passed":1,"failed":1,"skipped":0,"unknown":0}` — disjoint four-state buckets; the CLI and the JSON produced identical results (both delegate to `verifyLaws`), satisfying "both transports return the same result".

## Pre-existing / unrelated failures

One flaky failure observed in a single `npm test` invocation: the pre-existing p99 latency benchmark (`check.test.ts`, "PreToolUse p99 stays within the 15 ms budget"), which is timing-sensitive under coverage instrumentation and load. It passed on every subsequent run (200/200 twice consecutively) and is not touched by this change — `check.ts` is unmodified. Not introduced here.

## Pending manual steps

None.

## Verdict

✅ All gates green (200/200 tests, coverage well above the 80% floor); the `deps` and `graph` engines, the four-state batch verifier, and the discriminated-union model are implemented, tested, and verified end-to-end against the real CLI in isolation.
