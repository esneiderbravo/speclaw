# Backend checks — add-multidialect-compiler (2026-08-25)

Date · Branch `feat/multidialect-compiler` · cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Format + lint | `npm run check` | ✅ |
| Type-check + compile | `npm run build` | ✅ |
| Unit / integration | `npm test` | ✅ 400 pass / 0 fail (lines ~84.2% / branches ~80.5% / funcs ~84.0%) |

## Tests added / updated

- `test/unit/dialects-compile.test.ts` — parse markers, duplicates, delimited patch, idempotent compile, import draft skip, always-on estimate, copilot/coderabbit, nested AGENTS.

## Spec-scenario coverage

| Scenario | Verified by |
| --- | --- |
| Draft laws do not fail verify | import + verifyLaws skipped draft |
| Standards yield mergeable laws / duplicate fail | parse + compile throws |
| Second compile unchanged | idempotent compile test |
| Claude paths / Cursor globs | compile with claude+cursor agents |
| AGENTS delimited degrade | patch + compile |
| Copilot instructions + CodeRabbit merge | compile with copilot/coderabbit |
| Nested AGENTS | package.json + 3 laws |
| Import rulesync | importRulesFrom |
| Always-on budget | estimateAlwaysOnTokens + doctor detail |

## Pre-existing / unrelated failures

none

## Pending manual steps

none — CLI `laws compile --json` exercised in throwaway dir.

## Verdict

✅ Backend gates green for multidialect compile core.
