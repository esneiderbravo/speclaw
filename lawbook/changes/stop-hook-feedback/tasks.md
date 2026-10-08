# Tasks — stop-hook-feedback

## 0. Branch

- [x] 0.1 Create the branch `fix/stop-hook-feedback`

## 1. Implementation

- [x] 1.1 `docHint`: tell a grown diff from its last measurement; one background measurement in flight; re-tell when a new kind of artifact is owed
- [x] 1.2 `api-surface.ts`: routes, DTOs and contract files from the diff's changed lines; feeds `touchesPublicApi` and owes `reports/api.md` at level 1+
- [x] 1.3 `package-entries.ts`: entries from `package.json` for the level signal and the Compass map, replacing speclaw's hardcoded paths
- [x] 1.4 Level 2+: one test gate per package and one report per discipline; stale generated reports removed
- [x] 1.5 `ship-on-stop` prints a `systemMessage` summary; the Stop hook command keeps stdout

## 2. Verification

- [x] 2.1 Tests: `api-surface.test.ts`, `package-entries.test.ts`, and ship tests for the API report, the grown-diff hint, per-discipline reports and the stop summary
- [x] 2.2 Affected suites pass locally (ship, api-surface, package-entries, hooks, levels, compass, dialects, add-agent, update, check, cli, session-start); the gates run at the stop
- [x] 2.3 Read-only run of the API detection on the FAR-1387 diff: 5 files (3 endpoints, DTOs) in 130 ms
- [x] 2.4 Discipline reports under reports/ (written by the Stop hook from the gates)
