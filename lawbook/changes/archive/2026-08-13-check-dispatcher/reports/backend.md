# Backend checks — check-dispatcher (2026-08-13)

Date · 2026-08-13 · Branch `feat/check-dispatcher` · Environment: local macOS (Darwin 25.5.0), Node ≥22, cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| :-- | :-- | :-- |
| Format + lint | `npm run check` | ✅ Prettier: all matched files clean · ESLint: 0 problems |
| Type-check + build | `npm run build` | ✅ `tsc` strict pass · copy-assets: 3 module(s), seed manifest copied to `dist/modules/foundation/assets/laws/` |
| Tests + coverage | `npm test` | ✅ 178 tests, 178 passed, 0 failed · above the 80% global floor (lines/functions/branches) |

Coverage of the new files: `laws.js` 98.11% lines, `hooks.js` 91.57%, `check.js` 94.48%, `doctor.js` 95.90%, `scaffold.js` 100%.

## Tests added / updated

- `test/unit/laws.test.ts` — glob compilation (`**` vs `*`, braces, character classes), `globError` on unclosed `[`/stray `}`, `matchesScope` positives/negatives/empty, `hasBackend` (path-only), seed-manifest validity, write/read round-trip, and schema rejection of a bad enforcement value.
- `test/unit/check.test.ts` — verdict matrix (bloqueo deny on PreToolUse; no deny on PostToolUse; feedback message), scope filtering, fail-open on missing and corrupt manifest, `InstructionsLoaded` context-log append (only the loaded file's laws), and the **latency benchmark** (50 laws, 100 invocations, asserts p99 < 15 ms).
- `test/unit/hooks.test.ts` — enforcement→event mapping, malformed-glob exclusion, `mergeHooks` preserving foreign entries + idempotency + stale-entry removal, `installHooks` hooking claude / skipping cursor, and never clobbering an unparseable settings file.
- `test/integration/hooks.test.ts` — scaffold seeds the manifest and installs `.claude/settings.json` hooks with a recorded baseline; a real `PreToolUse` payload is denied; `InstructionsLoaded` records coverage and `doctor` reports it (with the post-compact caveat); `doctor` flags an unhooked agent.
- `test/contract/registers.test.ts` — extended: `speclaw_check` is declared by `registerFoundation`, its input schema rejects a bad event and accepts a valid one, and its handler returns an MCP text result carrying a `verdict`.
- `test/e2e/cli.test.ts` — extended: `check --hook-payload -` against a scaffolded repo denies a `.env` edit with exit code 2 and allows a `README.md` edit with exit 0 (the `runCli` helper gained an `input` stdin option).
- `test/integration/hooks.test.ts` — added: a curated `.speclaw/laws-manifest.json` is preserved across an `update`-style refresh (not overwritten).

## Spec-scenario coverage

| Scenario (delta spec) | Verified by |
| :-- | :-- |
| Law manifest → seeded on init | `integration/hooks.test.ts` "scaffold seeds the law manifest…" |
| Law manifest → curated manifest preserved on update | `integration/hooks.test.ts` "a curated manifest is preserved on a refresh (update)" |
| Law manifest → unimplemented backend declared but inert | `unit/laws.test.ts` `hasBackend`; `doctor` "declared without a backend yet" line |
| Hook generation → hooks for a hook-capable agent | `unit/hooks.test.ts` "installHooks writes settings…"; `integration` PreToolUse group |
| Hook generation → agent without hook support | `unit/hooks.test.ts` (cursor skipped); `integration` doctor asymmetry |
| Idempotent hook merge → preserves foreign entries | `unit/hooks.test.ts` "mergeHooks preserves foreign entries and is idempotent" |
| Idempotent hook merge → re-running produces no drift | same test (single speclaw group after double merge) + stale-entry test |
| Action evaluation → blocking law denies + cites id/prose/source | `unit/check.test.ts` "a blocking law denies…"; manual command-hook run |
| Action evaluation → command-hook fallback signals a block via exit code | `e2e/cli.test.ts` "check --hook-payload denies a .env edit with exit code 2" |
| Action evaluation → out-of-scope law not evaluated | `unit/check.test.ts` "an out-of-scope law is not evaluated" |
| Action evaluation → evaluator failure fails open | `unit/check.test.ts` missing + corrupt manifest tests |
| Action evaluation → PreToolUse latency within budget | `unit/check.test.ts` p99 benchmark |
| Context coverage → loaded laws recorded | `unit/check.test.ts` + `integration` context-log |
| Context coverage → doctor reports missing coverage | `integration/hooks.test.ts` doctor coverage assertion |
| Glob validation → malformed glob caught at generation | `unit/hooks.test.ts` "excludes a law with a malformed glob"; `doctor` glob check |

## Pre-existing / unrelated failures

None. Full suite green from a clean build.

## Pending manual steps

None outstanding — manual CLI verification was executed by the agent (see `api.md`).

## Verdict

✅ Pass — all gates green, every spec scenario covered by an automated test or a recorded manual run.
