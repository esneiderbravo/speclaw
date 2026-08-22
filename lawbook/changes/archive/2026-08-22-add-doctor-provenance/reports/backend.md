# Backend checks — add-doctor-provenance (2026-08-22)

Date · Branch · Environment/cwd: 2026-08-22 · `feat/doctor-provenance` · `/Users/esneiderbravo/Projects/speclaw` (Node 22, isolated tmp fixtures + this repo for CLI smoke)

## Gates & results

| Check | Command | Result |
| :-- | :-- | :-- |
| Lint + format | `npm run check` | ✅ Prettier + ESLint clean |
| Build | `npm run build` | ✅ `tsc` + asset copy |
| Tests + coverage | `npm test` | ✅ **274 pass / 0 fail**; coverage lines **94.23%**, branches **85.69%**, functions **96.10%** |

## Tests added / updated

- `test/unit/redact.test.ts` — home/`<project>`/`<user>` scrubbing
- `test/unit/doctor-report.test.ts` — schema shape, remedies, uninit skips, offline, frozen ids
- `test/integration/doctor.test.ts` — rewritten for `DoctorReport`
- `test/integration/hooks.test.ts` — async doctor + notes checks
- `test/contract/registers.test.ts` — expects `schemaVersion` in MCP doctor output

## Spec-scenario coverage

| Scenario | Verified by |
| :-- | :-- |
| JSON schemaVersion + five sections | `doctor-report.test.ts` + manual `doctor --json --offline` |
| warn/error carry remedy | `doctor-report.test.ts` |
| Uninitialised → env ok, cfg skip | `doctor-report.test.ts` + integration |
| MCP unconfigured vs probe | integration `unconfigured mcp…` |
| Missing indexed_at → skip | manual (this repo) + freshness check code |
| auth.none | unit + manual |
| Offline registry skip | unit + manual |
| Redaction default | unit + manual (`home leaked false`) |

## Pre-existing / unrelated failures

none (full suite green unsandboxed)

## Pending manual steps

none

## Verdict

pass — doctor report core and checks land with gates green.
