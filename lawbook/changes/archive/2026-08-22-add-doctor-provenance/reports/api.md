# API checks — add-doctor-provenance (2026-08-22)

Date · Branch · Environment/cwd: 2026-08-22 · `feat/doctor-provenance` · `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| :-- | :-- | :-- |
| Contract MCP | `npm test` (registers contract) | ✅ doctor tool returns text containing `"schemaVersion"` |
| CLI JSON | `node dist/cli/index.js doctor --json --offline` | ✅ parseable `DoctorReport` schemaVersion 1 |
| CLI telemetry | `… telemetry status` / `enable` | ✅ status 0; enable exit 1 |

## Tests added / updated

- Contract: MCP `doctor` handler returns versioned report (not legacy `{healthy,checks}`)
- E2E: `doctor --json --offline` expects exit 0 + schemaVersion
- `test/unit/telemetry.test.ts` — status / enable via built CLI

## Spec-scenario coverage

| Scenario | Verified by |
| :-- | :-- |
| `doctor --json` no header / machine JSON | CLI smoke (piped) + cli delta |
| `telemetry status` absence | unit + manual |
| `telemetry enable` unavailable | unit + manual |
| Help lists doctor / telemetry | HELP string updated in `src/cli/index.ts` |

### Contract surface

| Surface | Shape |
| :-- | :-- |
| CLI `speclaw doctor --json` | stdout = `DoctorReport` JSON; exit 0 unless `error` (or `--strict` + `warn`) |
| MCP tool `doctor` | `text(DoctorReport)` |
| CLI `speclaw telemetry status` | prose; exit 0 |
| CLI `speclaw telemetry enable\|disable\|log` | error; exit 1 |

## Pre-existing / unrelated failures

none

## Pending manual steps

none

## Verdict

pass — CLI/MCP contracts match `operational-trust` + `cli` deltas.
