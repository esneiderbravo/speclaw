# Backend checks — add-spec-drift (2026-08-22)

Date · Branch `feat/spec-drift` · cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Format + lint | `npm run check` | ✅ Prettier clean; ESLint clean |
| Type-check + compile | `npm run build` | ✅ `tsc` + asset copy |
| Unit / integration / contract | `npm test` | ✅ 297 pass / 0 fail |

## Tests added / updated

- `test/unit/hash.test.ts` — dual body/norm hash behaviour (cosmetic vs semantic).
- `test/unit/anchors.test.ts` — candidate extraction + seal JSON.
- `test/unit/drift.test.ts` — classify, exit codes (incl. orphan under semantic), schema-6 rehydrate, sibling isolation.
- `test/contract/registers.test.ts` — expects `lawbook_drift`.
- `test/unit/budget.test.ts` — minimal tool count 8 → 9.

## Spec-scenario coverage

| Scenario (delta) | Verified by |
| --- | --- |
| Cosmetic edit changes only body_hash | `hash.test.ts` cosmetic case |
| Behavioural edit changes norm_hash | `hash.test.ts` behavioural case |
| Schema 5 DB rebuilt safely | `drift.test.ts` schema reopen |
| Fresh clone / index deletion keeps seals | rehydrate on openDb + schema test |
| Archive seals / zero anchors warn | sealCapability unit + archive CLI wiring |
| Unresolved casing dropped / backtick orphan | anchors + drift classify |
| Prettier cosmetic / body rewrite semantic / move / sibling | `drift.test.ts` classify suite |
| Default fail-on semantic / cosmetic does not fail / missing index → 2 | parseFailOn + driftExitCode + buildDriftReport |
| Reseal updates hashes | dogfood `speclaw drift --reseal` |
| Reverse disabled without paths | loadCapabilityPaths empty → reverse disabled |
| JSON header-free / MCP bounded | CLI header suppress + renderDriftAgent |
| Doctor remedy / verify CI SARIF | doctorDriftCheck + driftFindingsForVerify wiring |

## Pre-existing / unrelated failures

none

## Pending manual steps

none

## Verdict

Ready to sync and archive.
