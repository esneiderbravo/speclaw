# Backend checks — harden-update-lock-and-cli (2026-10-06)

Date 2026-10-06 · Branch `feat/coordinator-status-updates` · gates in cwd `/Users/esneiderbravo/Projects/speclaw`; manual runs in the throwaway repo `/tmp/speclaw-mv.IlR3ps/p4` (scratch changes `scratch-change`, `scratch-two`, `no-harness`) with the built CLI and `HOME=/tmp/speclaw-mv.IlR3ps/home`. In this repo, only the read-only `cortex status` was run on archived changes.

Scope: archive completes the Cortex harness (`req~harness-archive-completes~1`): `completeHarnessOnArchive`, `specArchive` ordering and restore, the archive resolver (`src/modules/cortex/paths.ts` `resolveChangeDir`), read-only Cortex ops on archived changes, and the data repair of the stuck `harness.json` files. It also covers the lock engine (`refreshLockfile` / `driftedStrictPaths` / `readLockfile` shape checks), whose security behavior is detailed in `security.md`.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Lint + format | `npm run check` | ✅ exit 0 |
| Type-check + build | `npm run build` | ✅ exit 0 |
| Full suite + coverage | `npm test` | ✅ tests 833, pass 833, fail 0, skipped 0; all files 86.32 / 82.68 / 88.22 |
| Backend-touched tests | `node --test --test-concurrency=1 dist-test/test/unit/harness.test.js dist-test/test/unit/cortex-status.test.js dist-test/test/integration/cortex-status-cli.test.js dist-test/test/unit/lock.test.js` | ✅ tests 66, pass 66, fail 0 |
| Coverage of touched modules | from `npm test` | `cortex/paths.js` 95.00 / 90.00 / 100; `cortex/harness.js` 90.27 / 82.18 / 87.50; `cortex/status.js` 100 / 98.33 / 100; `cortex/brief.js` 88.46 / 83.33 / 100; `lawbook/engine.js` 93.01 / 88.72 / 96.88; `foundation/lock.js` 99.21 / 91.95 / 100 |
| Requirement coverage | `lawbook_change` `coverage`, change-scoped, `onlyDefects` | ✅ `req~harness-archive-completes~1` utest+impl (11 links), 0 defects; change total 26/26 deep-covered |
| Validation | `lawbook_change` `validate` | ✅ `valid: true` |

## Tests added / updated

`test/unit/harness.test.ts`:

- "archive completes the harness and status reads the archived change": **failed before the fix** with `change "feat" not found under lawbook/changes/` (verbatim below).
- "the archive result reports harnessCompleted and brief reads the archived change".
- "mutating ops on an archived change are rejected without writing" (`advance`/`rework`/`start`, bytes compared).
- "the newest exact archive wins when resolving a change" (`2026-01-01-feat`, `2026-02-01-feat`, `2026-03-01-other-feat` → `2026-02-01-feat`).
- "completeHarnessOnArchive leaves a missing or done harness untouched". This also asserts that the harness gate blocks `specArchive` without `harness.json` (B3).
- "a failed directory move restores the harness bytes" (through the test-only `archiveFs` seam).
- "the shipped skill and archiver agent do not advance after archive".
- `briefForStage("archiving")` now returns `nextOps: []` (N6).

The lock-engine tests are listed in `security.md`.

## Manual verification (tester-executed, isolated)

| # | What | Observed |
|---|------|----------|
| M17 | CLI flow in `p4/` | `lawbook draft scratch-change --level 0`, `cortex start`, `advance` ×2, `advance --verdict PASS` → stage `archiving` (history `exploring>exploring, exploring>implementing, implementing>testing, testing>archiving`). Before archive, `cortex brief --json` → `nextOps: []`. Record steps checked + `reports/backend.md`, then `lawbook archive scratch-change` → exit 0, `✓ archived to lawbook/changes/archive/2026-10-07-scratch-change (0 spec(s) promoted)`, `✓ Cortex harness completed (stage done)`. The archived `harness.json` has `stage: "done"` and last history `{from: "archiving", to: "done", op: "advance", note: "archived by lawbook archive"}`. `cortex status scratch-change` → `scratch-change · done · 0m in stage · tasks 3/3 · rework 0/3 · pending: none`, exit 0; `cortex brief --json` → `state.stage: "done"`. `cortex advance`, `advance --verdict PASS`, `rework --note x`, and `start` → each exit 1 with `✗ change scratch-change is archived (lawbook/changes/archive/2026-10-07-scratch-change); Cortex ops are read-only`; archived `harness.json` sha256 unchanged; no active dir recreated |
| M18 | MCP flow (see `api.md`) | `lawbook_change` archive → `{archivedTo, harnessCompleted: true}`; `cortex` status/brief → `done`; mutating ops → `isError`; harness-less archive blocked, no `harness.json` created |
| M19 | Real repo, read-only | `node dist/cli/index.js cortex status <name>` → `index-at-session-start · done · … tasks 34/34 · rework 2/3`, `release-on-publish · done · … tasks 3/3`, `coordinator-status-updates · done · … tasks 25/25 · rework 1/3`. Before the fix these names threw `not found under lawbook/changes/`; now they resolve through the archive |

### Data repair of the stuck archived harnesses (task 4.6, D3)

Before = `git show HEAD:<file>` stage; after = working tree. Each file's only change is the `stage` line plus one appended history entry (`git diff --stat`: 5 files, +40 / −5). The JSON keeps 2-space indentation and a trailing newline.

| Archived change | Before | After | Last history entry |
|-----------------|--------|-------|--------------------|
| `2026-10-06-index-at-session-start` | `archiving` | `done` | `archiving→done`, `advance`, "repaired: archive moved the change before the harness reached done (harden-update-lock-and-cli)" |
| `2026-10-06-fix-compass-source-offsets` | `archiving` | `done` | same |
| `2026-10-06-sync-site-theme` | `archiving` | `done` | same (diff shown below) |
| `2026-10-06-lock-regenerable-symlink` | `archiving` | `done` | same |
| `2026-10-06-release-on-publish` | `archiving` | `done` | same |
| `2026-10-06-coordinator-status-updates` | untracked (archived concurrently on this branch; the implementer recorded it stuck at `archiving`) | `done` | same |

```
$ git diff HEAD -- lawbook/changes/archive/2026-10-06-sync-site-theme/harness.json
-  "stage": "archiving",
+  "stage": "done",
@@ -51,6 +51,13 @@
+    },
+    {
+      "at": "2026-10-07T00:54:30.758Z",
+      "from": "archiving",
+      "to": "done",
+      "op": "advance",
+      "note": "repaired: archive moved the change before the harness reached done (harden-update-lock-and-cli)"
     }
```

No other file in those archive dirs changed (`git status --short lawbook/changes/archive` lists only the five `harness.json` files plus the untracked sibling dir).

### Lock engine (summary; evidence in `security.md`)

`readLockfile` returns `null` only for a missing file. It throws `speclaw.lock: unreadable (…)` / `unsupported lockfileVersion N (max 1)` / `invalid structure (…)` for everything else. `refreshLockfile` and `driftedStrictPaths` propagate that before any write. The drift snapshot is taken before `compileLaws` in scaffold and standalone compile. Scaffold passes `refreshLock: false` to `compileLaws`, so the lock is written once (N10). M10 in `security.md`: 32/32 writer runs left a bad lock byte-identical.

## Spec-scenario coverage

Every `#### Scenario` of the `lawbook-workflow` delta (128) is listed below. The delta is a full copy of the sibling `coordinator-status-updates` delta plus this change's requirement. The sibling has already synced, so the delta differs from the canonical spec only by `req~harness-archive-completes~1` (7 scenarios) and one header sentence. Every other row is an "Unchanged carry-over", including the sibling's `cortex-status-*` scenarios, which are verified in the archived sibling's reports and re-run green here in `npm test`.

| # | Scenario | Requirement | How verified |
|---|----------|-------------|--------------|
| LAW-1 | Behavior built after drafting is captured before promotion | Sync reconciles built code into the delta specs | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-2 | Draft scaffolds the reports folder | Every change carries a reports folder | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-3 | Build records evidence of testing | Build produces per-discipline test reports | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-4 | A full-stack change ships backend, frontend, and api reports | Build produces per-discipline test reports | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-5 | A discipline beyond the common set gets its own named report | Build produces per-discipline test reports | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-6 | An endpoint change requires an api report | API changes carry an API discipline report | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-7 | A backend report does not substitute for the api report | API changes carry an API discipline report | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-8 | A change with no API surface may omit the api report | API changes carry an API discipline report | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-9 | A discipline report carries the required sections | Discipline reports follow a required structure | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-10 | Pre-existing failures are declared honestly | Discipline reports follow a required structure | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-11 | Every delta-spec scenario is accounted for | Discipline reports follow a required structure | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-12 | Verification is isolated from real data by default | Verification never mutates real data without authorization | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-13 | A real-data write is gated on explicit authorization | Verification never mutates real data without authorization | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-14 | Raw store commands are not run against a live store unprompted | Verification never mutates real data without authorization | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-15 | The report records how verification stayed safe | Verification never mutates real data without authorization | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-16 | Unchecked task blocks archive | Archive is blocked until the change is complete | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-17 | Missing reports block archive | Archive is blocked until the change is complete | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-18 | The reports README scaffold alone does not satisfy the gate | Archive is blocked until the change is complete | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-19 | Unsynced specs block archive | Archive is blocked until the change is complete | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-20 | A complete change archives | Archive is blocked until the change is complete | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-21 | Archiving blocked by uncovered requirement | Archive is blocked by direct requirement-coverage defects | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-22 | Legacy change without identifiers is not blocked | Archive is blocked by direct requirement-coverage defects | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-23 | Transitive defects do not block archiving | Archive is blocked by direct requirement-coverage defects | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-24 | Coverage gate can be disabled | Archive is blocked by direct requirement-coverage defects | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-25 | Drift must be reconciled and synced before archive | Archive reconciles drift before it can pass the gate | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-26 | Standalone draft refreshes the index before locating code | Explore locates through Compass before indexing or reading code | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-27 | Explore starts with compass_find, not compass_index | Explore locates through Compass before indexing or reading code | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-28 | Reading code requires a named fallback | Explore locates through Compass before indexing or reading code | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-29 | Dispatch carries the brief | A complete explorer brief is the planner code map | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-30 | A complete brief is not re-investigated | A complete explorer brief is the planner code map | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-31 | The brief reports how many Compass calls were made | A complete explorer brief is the planner code map | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-32 | A change to existing behavior reuses the canonical capability name | Draft reuses existing capabilities by exact name | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-33 | A genuinely new capability is introduced deliberately | Draft reuses existing capabilities by exact name | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-34 | Updating a capability preserves its existing requirements | Draft grounds a capability delta in the current canonical spec | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-35 | Near-duplicate capability name raises a warning | Validate warns about capability divergence | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-36 | Dropping a canonical requirement raises a warning | Validate warns about capability divergence | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-37 | An exact-name delta that keeps all requirements raises no such warning | Validate warns about capability divergence | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-38 | Unstructured requirement fails under strict | `req~ears-validate~1` | Unchanged carry-over; tagged tests `unit/ears.test.ts`, `property/ears.test.ts` green in `npm test` (833/833) |
| LAW-39 | Lenient projects warn instead of fail | `req~ears-validate~1` | Unchanged carry-over; tagged tests `unit/ears.test.ts`, `property/ears.test.ts` green in `npm test` (833/833) |
| LAW-40 | No automatic file rewrite | `req~ears-validate~1` | Unchanged carry-over; tagged tests `unit/ears.test.ts`, `property/ears.test.ts` green in `npm test` (833/833) |
| LAW-41 | Missing ptest blocks archive | `req~ptest-archive-gate~1` | Unchanged carry-over; tagged tests `unit/coverage.test.ts` green in `npm test` (833/833) |
| LAW-42 | A new capability is reported as created | Sync and archive report created versus updated capabilities | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-43 | An existing capability is reported as updated | Sync and archive report created versus updated capabilities | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-44 | Archive writes anchor JSON for a resolvable symbol | Archive seals structural code anchors | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-45 | Archive proceeds with a warning when nothing resolves | Archive seals structural code anchors | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-46 | Small single-module change proposes level 0 | Ceremony level is proposed from graph signals | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-47 | Public or global touch is never proposed as level 0 | Ceremony level is proposed from graph signals | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-48 | Docs-only targets short-circuit to level 0 | Ceremony level is proposed from graph signals | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-49 | Missing index does not assume level 0 | Ceremony level is proposed from graph signals | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-50 | Missing change.json means full ceremony | Confirmed ceremony level is persisted | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-51 | Downgrade requires a reason | Confirmed ceremony level is persisted | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-52 | Promotion keeps record.md | Confirmed ceremony level is persisted | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-53 | Level 0 validates without proposal or deltas | Artifact gates follow the confirmed level | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-54 | Level 0 without reports cannot archive | Artifact gates follow the confirmed level | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-55 | Level 3 still needs design | Artifact gates follow the confirmed level | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-56 | Scope growth blocks validate | Artifact gates follow the confirmed level | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-57 | Laws mention ceremony levels | Published laws describe level-based ceremony | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-58 | Bug draft produces the bugfix artifact | Bugfix change type | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-59 | Bug change validates without a proposal | Bugfix change type | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-60 | A level 2 bug still requires a design | Bugfix change type | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-61 | Level-2 feature draft writes the stubs the level requires | `req~feature-draft~1` | Unchanged carry-over; tagged tests `unit/feature-draft.test.ts`, `e2e/cli.test.ts` green in `npm test` (833/833) |
| LAW-62 | A fresh draft validates at every level | `req~feature-draft~1` | Unchanged carry-over; tagged tests `unit/feature-draft.test.ts`, `e2e/cli.test.ts` green in `npm test` (833/833) |
| LAW-63 | A placeholder delta cannot be synced silently | `req~feature-draft~1` | Unchanged carry-over; tagged tests `unit/feature-draft.test.ts`, `e2e/cli.test.ts` green in `npm test` (833/833) |
| LAW-64 | Quick and bug drafts keep accepting their existing names | `req~feature-draft~1` | Unchanged carry-over; tagged tests `unit/feature-draft.test.ts`, `e2e/cli.test.ts` green in `npm test` (833/833) |
| LAW-65 | The delta starts from an existing capability spec | `req~feature-draft~1` | Unchanged carry-over; tagged tests `unit/feature-draft.test.ts`, `e2e/cli.test.ts` green in `npm test` (833/833) |
| LAW-66 | Draft without a level leaves the level unconfirmed | `req~feature-draft~1` | Unchanged carry-over; tagged tests `unit/feature-draft.test.ts`, `e2e/cli.test.ts` green in `npm test` (833/833) |
| LAW-67 | An existing change directory is refused | `req~feature-draft~1` | Unchanged carry-over; tagged tests `unit/feature-draft.test.ts`, `e2e/cli.test.ts` green in `npm test` (833/833) |
| LAW-68 | Quick and bug drafts are unchanged by the shared scaffold | `req~feature-draft~1` | Unchanged carry-over; tagged tests `unit/feature-draft.test.ts`, `e2e/cli.test.ts` green in `npm test` (833/833) |
| LAW-69 | Level 0 bug validates without proposal or deltas | Bug artifact gates follow level and type | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-70 | Missing delta when prevention requires a spec change blocks validate | Bug artifact gates follow level and type | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-71 | Missing regression test blocks archive | Mandatory reproduction and regression test | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-72 | Unreproducible bug requires an explicit marker | Mandatory reproduction and regression test | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-73 | Mitigated resolution is recorded distinctly | Mandatory reproduction and regression test | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-74 | Not-a-bug resolution still requires prevention | Mandatory reproduction and regression test | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-75 | Stack frames outrank graph neighbours | Deterministic bug investigation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-76 | External frames are not ranked as suspects | Deterministic bug investigation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-77 | Unsupported language is refused explicitly | Deterministic bug investigation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-78 | Missing index returns no suspects | Deterministic bug investigation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-79 | Unavailable signals degrade without failing | Deterministic bug investigation | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-80 | Proposed law is emitted ready to adopt | Prevention closes the loop | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-81 | Explicitly declining prevention is accepted | Prevention closes the loop | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-82 | A recurring root cause is surfaced | Prevention closes the loop | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-83 | Laws mention bugfix workflow | Published laws describe bug change type | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-84 | Coordinator does not implement | Default change loop is multi-agent | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-85 | Illegal advance is rejected | Harness state is durable and deterministic | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-86 | Start initializes exploring | Harness state is durable and deterministic | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-87 | An explore call is recorded | `req~compass-call-log~1` | Unchanged carry-over; tagged tests `unit/compass-calls.test.ts` green in `npm test` (833/833) |
| LAW-88 | Index calls are logged but are not evidence | `req~compass-call-log~1` | Unchanged carry-over; tagged tests `unit/compass-calls.test.ts` green in `npm test` (833/833) |
| LAW-89 | The log rotates at its size cap | `req~compass-call-log~1` | Unchanged carry-over; tagged tests `unit/compass-calls.test.ts` green in `npm test` (833/833) |
| LAW-90 | Rotation does not hide current-stage evidence | `req~compass-call-log~1` | Unchanged carry-over; tagged tests `unit/compass-calls.test.ts` green in `npm test` (833/833) |
| LAW-91 | A write failure never fails the tool | `req~compass-call-log~1` | Unchanged carry-over; tagged tests `unit/compass-calls.test.ts` green in `npm test` (833/833) |
| LAW-92 | Strict mode blocks an explore stage with no Compass calls | `req~compass-evidence-gate~1` | Unchanged carry-over; tagged tests `unit/compass-gate.test.ts` green in `npm test` (833/833) |
| LAW-93 | Warn mode advances with a warning | `req~compass-evidence-gate~1` | Unchanged carry-over; tagged tests `unit/compass-gate.test.ts` green in `npm test` (833/833) |
| LAW-94 | Evidence since stage start satisfies the gate | `req~compass-evidence-gate~1` | Unchanged carry-over; tagged tests `unit/compass-gate.test.ts` green in `npm test` (833/833) |
| LAW-95 | Calls before the stage started do not count | `req~compass-evidence-gate~1` | Unchanged carry-over; tagged tests `unit/compass-gate.test.ts` green in `npm test` (833/833) |
| LAW-96 | Off mode and ungated stages skip the check | `req~compass-evidence-gate~1` | Unchanged carry-over; tagged tests `unit/compass-gate.test.ts` green in `npm test` (833/833) |
| LAW-97 | Brief maps implementing to implementer | Cortex ships as an MCP module | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-98 | Archive blocked without test PASS | Archive requires harness verdicts | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-99 | Level 1+ needs review PASS | Archive requires harness verdicts | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-100 | Archive moves the harness to done | `req~harness-archive-completes~1` | `unit/harness.test.ts` "archive completes the harness and status reads the archived change" (red: `.red-3.txt`) + "the archive result reports harnessCompleted…"; manual M17 (CLI) and M18 (MCP `lawbook_change` archive → `harnessCompleted: true`, archived stage `done`, last history `archiving→done advance`) |
| LAW-101 | An archived change is readable through Cortex | `req~harness-archive-completes~1` | `unit/harness.test.ts` (same two tests); manual M17 `cortex status` → `done · tasks 3/3`, `brief --json` stage `done`; M18 MCP `status`/`brief` → `done`, `nextOps: []`; M19 real repo read-only `cortex status` on 3 repaired archives → `done` |
| LAW-102 | Mutating ops on an archived change are rejected | `req~harness-archive-completes~1` | `unit/harness.test.ts` "mutating ops on an archived change are rejected without writing"; manual M17 (CLI `advance`, `advance --verdict PASS`, `rework`, `start` → exit 1 `is archived (…); Cortex ops are read-only`, harness sha256 unchanged) and M18 (MCP `isError: true`, same message) |
| LAW-103 | The newest archive wins | `req~harness-archive-completes~1` | `unit/harness.test.ts` "the newest exact archive wins when resolving a change" (2026-01-01 / 2026-02-01 / 2026-03-01-other-feat) |
| LAW-104 | A change without a harness is blocked and gets no harness | `req~harness-archive-completes~1` | `unit/harness.test.ts` "completeHarnessOnArchive leaves a missing or done harness untouched"; manual M18: MCP archive `no-harness` → `isError`, `missing harness.json — run speclaw cortex start…`, no `harness.json` created |
| LAW-105 | A failed move restores the harness | `req~harness-archive-completes~1` | `unit/harness.test.ts` "a failed directory move restores the harness bytes" (`archiveFs.renameSync` seam). Not reproducible by hand without a fault-injection seam |
| LAW-106 | The shipped workflow does not advance after archive | `req~harness-archive-completes~1` | `unit/harness.test.ts` "the shipped skill and archiver agent do not advance after archive"; manual M20 (assets and `ai-specs/` mirror identical, text read): see `skills.md` |
| LAW-107 | Scaffold without packs still installs role agents | Role agents ship with the workflow | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-108 | Role agents list canonical tools only | Role agents ship with the workflow | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-109 | Shipped workflow texts name no alias tool | Role agents ship with the workflow | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-110 | Empty catalog skips pack prompt | Domain agent pack is removed | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-111 | Build step chain ends at implement hand-off | Build hands off before final gates | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-112 | Cortex dispatcher stays thin | Cortex skill coordinates the loop | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-113 | One question round covers explorer, planner, and level | Cortex skill coordinates the loop | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-114 | Explorer dispatch names symbols, not files | Cortex skill coordinates the loop | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| LAW-115 | Status returns the summary for a running change | `req~cortex-status-summary~1` | Unchanged carry-over; tagged tests `integration/cortex-status-cli.test.ts`, `unit/cortex-status.test.ts` green in `npm test` (833/833) |
| LAW-116 | Level 0 owes only the test verdict and counts record.md | `req~cortex-status-summary~1` | Unchanged carry-over; tagged tests `integration/cortex-status-cli.test.ts`, `unit/cortex-status.test.ts` green in `npm test` (833/833) |
| LAW-117 | Questions stage says the human owes answers | `req~cortex-status-summary~1` | Unchanged carry-over; tagged tests `integration/cortex-status-cli.test.ts`, `unit/cortex-status.test.ts` green in `npm test` (833/833) |
| LAW-118 | A long history keeps the summary on the MCP path | `req~cortex-status-summary~1` | Unchanged carry-over; tagged tests `integration/cortex-status-cli.test.ts`, `unit/cortex-status.test.ts` green in `npm test` (833/833) |
| LAW-119 | No harness gives a null summary | `req~cortex-status-summary~1` | Unchanged carry-over; tagged tests `integration/cortex-status-cli.test.ts`, `unit/cortex-status.test.ts` green in `npm test` (833/833) |
| LAW-120 | CLI prints the line on stderr unless --json | `req~cortex-status-summary~1` | Unchanged carry-over; tagged tests `integration/cortex-status-cli.test.ts`, `unit/cortex-status.test.ts` green in `npm test` (833/833) |
| LAW-121 | Absent key defaults to 5 | `req~cortex-status-interval~1` | Unchanged carry-over; tagged tests `unit/cortex-status.test.ts` green in `npm test` (833/833) |
| LAW-122 | Configured value is reported | `req~cortex-status-interval~1` | Unchanged carry-over; tagged tests `unit/cortex-status.test.ts` green in `npm test` (833/833) |
| LAW-123 | Zero disables updates | `req~cortex-status-interval~1` | Unchanged carry-over; tagged tests `unit/cortex-status.test.ts` green in `npm test` (833/833) |
| LAW-124 | Invalid values fall back to 5 | `req~cortex-status-interval~1` | Unchanged carry-over; tagged tests `unit/cortex-status.test.ts` green in `npm test` (833/833) |
| LAW-125 | Values above 60 are capped at 60 | `req~cortex-status-interval~1` | Unchanged carry-over; tagged tests `unit/cortex-status.test.ts` green in `npm test` (833/833) |
| LAW-126 | The load step sets up the timer from the summary | `req~cortex-status-updates~1` | Unchanged carry-over; tagged tests `unit/cortex-skill-status.test.ts` green in `npm test` (833/833) |
| LAW-127 | The dispatch loop posts updates in the session language | `req~cortex-status-updates~1` | Unchanged carry-over; tagged tests `unit/cortex-skill-status.test.ts` green in `npm test` (833/833) |
| LAW-128 | Completion deletes the timer | `req~cortex-status-updates~1` | Unchanged carry-over; tagged tests `unit/cortex-skill-status.test.ts` green in `npm test` (833/833) |

## Regression — red before green (harness defect, item 3)

Folded verbatim from `reports/.red-3.txt`. After the fix, the same test passes (it is in the 66/66 backend run and in `npm test` 833/833).

````text
# Red before green — proposal item 3 (archive leaves the harness stuck), captured 2026-10-07T00:52:29Z on feat/coordinator-status-updates before the harness.ts/engine.ts fix
$ node --test --test-name-pattern="archive completes the harness" dist-test/test/unit/harness.test.js
✖ archive completes the harness and status reads the archived change (6.043083ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 64.12825

✖ failing tests:

test at dist-test/test/unit/harness.test.js:152:1
✖ archive completes the harness and status reads the archived change (6.043083ms)
  Error: change "feat" not found under lawbook/changes/
      at requireChangeDir (file:///Users/esneiderbravo/Projects/speclaw/dist-test/src/modules/cortex/harness.js:35:15)
      at handleHarness (file:///Users/esneiderbravo/Projects/speclaw/dist-test/src/modules/cortex/harness.js:123:5)
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/unit/harness.test.js:157:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.start (node:internal/test_runner/test:1177:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17)
````

## Pre-existing / unrelated failures

- 11 `drift~changed-semantic` findings in the top-level `verify` (sealed anchors on `specArchive`, `scaffold`, and `handleHarness`, which this change edited). Four of the five capabilities are resealed by this change's archive; `spec-drift → specArchive` ×2 is not. See `security.md`.
- O1: `speclaw lawbook archive --json` prints text, not JSON (the MCP result carries `harnessCompleted`).

## Pending manual steps

None. The failed-rename restore needs fault injection and is covered by the `archiveFs` seam test only.

## Verdict

PASS
