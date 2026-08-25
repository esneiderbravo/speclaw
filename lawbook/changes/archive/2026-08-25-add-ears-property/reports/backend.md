# Backend checks — add-ears-property (2026-08-25)

Date · Branch `feat/ears-property` · Environment: local Node v24.17.0 · cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Format + lint | `npm run check` | ✅ Prettier clean · ESLint clean |
| Build | `npm run build` | ✅ `tsc` + copy-assets |
| Tests + coverage | `npm run test` | ✅ **436 pass** / 0 fail · lines ~84.7% · branches ~80.1% · functions ~84.6% |
| Coverage gate (change) | `speclaw coverage --change add-ears-property` | ✅ 4/4 identified items covered (impl/utest/ptest as needed) |
| Validate | `speclaw lawbook validate add-ears-property` | ✅ valid · 70 advisory EARS warnings (multiple-modals / vague / passive) |

## Tests added / updated

| Test | Asserts |
| --- | --- |
| `test/unit/ears.test.ts` | Five molds + complex; diagnostics; suggest; runner window; quoted false-positive skip |
| `test/property/ears.test.ts` | fast-check properties for ubiquitous/event templates (`Covers: req~ears-validate~1, req~ptest-need~1`) |
| `test/unit/coverage.test.ts` | `Verification: property` → effective `ptest`; `refineSourceType` near `fc.assert` |

## Spec-scenario coverage (new requirements)

| Scenario | Verified by |
| --- | --- |
| Property runner window classifies ptest | unit `refineSourceType…` + coverage change report |
| Missing ptest is a direct defect | unit `Verification: property expands…` |
| Verification property expands needs | same |
| Coverage does not run the property suite | by design — coverage never executes runners; property tests run only under `npm test` |
| Unstructured requirement fails under strict | unit diagnoseEars + validate wiring |
| Lenient projects warn instead of fail | unit diagnoseEars with `severity: lenient` |
| No automatic file rewrite | validate leaves files untouched (manual confirm) |
| Missing ptest blocks archive | inherits `coverageArchiveBlockers` (same path as coverage defects) |
| Validate prints EARS diagnostics without a new MCP tool | CLI validate output; tool catalog unchanged (8 canonical) |
| Coverage reports missing ptest | unit + `speclaw coverage --change` |

## Pre-existing / unrelated failures

none

## Pending manual steps

none

## Verdict

Backend EARS classifier, coverage `ptest` gate, and strict config are verified green.
