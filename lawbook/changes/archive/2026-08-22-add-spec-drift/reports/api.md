# API checks — add-spec-drift (2026-08-22)

Date · Branch `feat/spec-drift` · cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Contract register list | `npm test` → registers.test.ts | ✅ includes `lawbook_drift` |
| CLI surface | `node dist/cli/index.js drift --json` | ✅ exit 0 under `--fail-on semantic` after reseal |
| MCP tool | registered in `register.ts` as `lawbook_drift` | ✅ defect-first `renderDriftAgent` |

## Contract exercised

| Surface | Auth | Shape / codes | How verified |
| --- | --- | --- | --- |
| `speclaw drift` | local CLI | exit 0/1/2; `--json` schemaVersion + summary | dogfood + unit |
| `lawbook_drift` | MCP (local) | bounded agent text / optional JSON | register + renderDriftAgent |
| `speclaw verify --ci` | local CLI | merges semantic/deleted into findings/SARIF | `driftFindingsForVerify` wired in verify.ts |
| `speclaw doctor` | local CLI | `cfg.drift` check | doctorDriftCheck wired |

## Spec-scenario coverage

| Scenario | Verified by |
| --- | --- |
| JSON report is header-free | CLI `maybeHeader` skips drift+json |
| MCP response is bounded | `renderDriftAgent` maxItems |
| Doctor names drift remedy | doctorDriftCheck remedy strings |
| Verify CI surfaces semantic drift | driftFindingsForVerify → report.findings |

## Pre-existing / unrelated failures

none

## Pending manual steps

none

## Verdict

API surfaces match the delta; ready to sync and archive.
