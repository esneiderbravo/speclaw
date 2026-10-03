# Backend — trust-explorer-brief

**Discipline:** backend
**Change:** trust-explorer-brief
**Date:** 2026-10-02
**Branch:** feat/trust-explorer-brief
**Environment:** /Users/esneiderbravo/Projects/speclaw (Node 24.17.0)

## Gates and results

| Check | Command | Result |
| --- | --- | --- |
| Lint + format | `npm run check` | PASS — Prettier clean, ESLint clean |
| Type-check + compile | `npm run build` | PASS — `tsc` strict; `copy-assets: copied assets for 3 module(s)` |
| Tests | `npm test` | PASS — 529 tests, 0 failed. Coverage lines 84.47%, branches 80.74%, functions 86.33% |

## Tests added

`test/unit/explorer-brief.test.ts` reads the packaged assets and asserts:

- the explore summarize step lists the brief fields, including gaps as "nothing unresolved"
- the cortex dispatch step pastes that brief into the planner prompt and still names only `steps/03-complete.md`
- the draft understand step treats a complete brief as the code map and runs `compass_index` only when the brief is absent
- the planner agent says a complete brief is not re-investigated

## Manual verification

Ran `node dist/cli/index.js --version` → `2.0.2`.

Ran `node dist/cli/index.js update` in an empty temp project that only had `LAWS.md` and `ai-specs/`. The installed skills contained:

- `ai-specs/skills/draft/steps/02-understand.md` — "that brief is the code map"
- `ai-specs/skills/cortex/steps/02-dispatch-loop.md` — "paste the explorer brief"
- `ai-specs/agents/planner.md` — "Do not re-investigate it"

The same phrases are in `dist/modules/lawbook/assets/`, which is what the published package copies.

No API surface. No live data store.
