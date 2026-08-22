# Security checks — add-doctor-provenance (2026-08-22)

Date · Branch · Environment/cwd: 2026-08-22 · `feat/doctor-provenance` · `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| :-- | :-- | :-- |
| Redaction | `doctor --json --offline` on this repo | ✅ `redacted: true`; home path absent from blob |
| Publish workflow | `test/unit/publish-workflow.test.ts` | ✅ `id-token: write`; no `NODE_AUTH_TOKEN`/`NPM_TOKEN`; check+test before publish |
| Telemetry absence | `telemetry status` / `enable` | ✅ no send path; enable fails |
| Egress inventory | `conn.egress` in report | ✅ documents single version-check egress |

## Tests added / updated

- `redact.test.ts`, `publish-workflow.test.ts`, `telemetry.test.ts`

## Spec-scenario coverage

| Scenario | Verified by |
| :-- | :-- |
| Absolute paths redacted by default | unit + manual |
| Report never contains file contents | design + checks only name paths |
| Publish OIDC / no long-lived token | publish-workflow unit |
| Publish gates before publish | publish-workflow unit |
| No telemetry in package | telemetry unit + manual |

## Pre-existing / unrelated failures

none

## Pending manual steps

Maintainer ops (outside CI): confirm classic npm tokens revoked on npmjs.com after next publish — documented in CONTRIBUTING.

## Verdict

pass — redaction, egress honesty, OIDC publish contract, and no-telemetry posture verified.
