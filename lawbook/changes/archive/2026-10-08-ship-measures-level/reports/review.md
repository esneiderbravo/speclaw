# Review — ship-measures-level

**Role:** reviewer · **Change:** ship-measures-level (level 3, measured) · **Branch:** fix/ship-measures-level · **Date:** 2026-10-08
**Scope reviewed:** working tree vs `main`, proposal, design, tasks, delta specs `ship` / `compass` / `investigate`, reports, `LAWS.md`-bound standards (architecture, testing, spec-reports-disciplines, spec-tasks-mandatory-steps).

## Verdict: PASS (re-review after rework iteration 1)

All four blocking findings from iteration 1 are fixed. I checked each fix in the source and in its test. The remaining items are non-blocking and can be deferred.

## Re-review of the blocking findings

| Finding | Fix verified at | Test | Status |
|---|---|---|---|
| B1: promoted `proposal.md` / level-0 file-list record counted as written | `src/modules/lawbook/ship.ts:374-386`: `STUBS` are now regexes; `/\(promoted from level \d\)/` for the proposal, `/^Changed \d+ file\(s\): /m` for the record (judged only at level 1+, since `pendingArtifacts` still gates the record on `level > 0`) | `test/integration/ship.test.ts:410` "a promoted change owes a real proposal, tasks and why…" asserts `proposal.md` and `tasks.md` are owed after an in-flight promotion to level 2+ | Resolved |
| B2: `mcp-surface.test.ts` ran `docHint` on the real checkout | `test/integration/mcp-surface.test.ts:44-87`: throwaway `tmpRepo` + `specInit` git fixture on `feat/widget`; `projectPath: root`, never `process.cwd()`. It also asserts `hookSpecificOutput.additionalContext` on the first call and none on the second (once per change and level). The checkout's `.speclaw/doc-hint.json` is gone | same | Resolved |
| B3: the `"] Make the "` substring made real tasks stubs | `ship.ts:385`: one multiline regex anchored to the whole generated line (`1.1 Implement the change`, `Implement`, `Make the fix`, `Make the change`, …). It also covers the checklist lines that a promotion copies from a level-0 record | `ship.test.ts:429` "a written task that starts like a generated one is not a stub" | Resolved |
| B4: discipline reports missing | `reports/backend.md` (gates, red-first table, scenario coverage), `reports/api.md` (MCP contract changes, how exercised, isolation), `reports/performance.md` (main vs branch vs alone, hook latency) are present | n/a | Resolved |

The other fixes also check out:
- **N2:** `ship.ts:354-356` builds the git object path with POSIX separators.
- **N3:** `ship.ts:245` uses a function replacer, and `COMMIT_SUMMARY_LINES = 15` caps the summary. Test: `ship.test.ts:442`.
- **N6:** `src/modules/foundation/compass-nudge.ts:40-55` no longer treats a command after `|` as a read, and skips `sed -i`.

Small nit, not blocking: the `sed` in-place check `/^-[a-zA-Z]*i/` does not catch the long form `--in-place`.

The coordinator reports gates green on the rework: `npm run check` and `npm run build` exit 0, `npm test` 1037/1037. With only the fixed logic reverted, the red-first run was 46 pass / 4 fail. I did not re-run the suite myself.

## Deferred non-blocking items (confirmed: none must block)

- **N1 (design):** a later branch that reuses a merged archive's name gets no new change, and its report overwrites the merged archive's report. This matches the delta spec as written and existed before this change. Suggest a follow-up: scaffold `<name>-2` when the archive exists at the merge base.
- **N4 (latency):** `docHint` measures synchronously in the MCP server under a 5 s hook timeout, and saves its state before delivering the hint. It only runs when the file set changes. Worth a follow-up, since latency is an adoption risk.
- **N5:** after a pending-artifacts block, `stop_hook_active` suppresses a gate-failure block in the same turn. The failure is still recorded in the report, and the next turn re-ships.
- **N7:** chain nodes are resolved by name, so an ambiguous name can resolve to the wrong symbol; the chain also relies on the final text budget; `maxDepth` sets the chain depth and the blast-radius/tests depth together.
- **N8:** no 2.0.20 `agentPrompt` migration for the template wording changes in `CLAUDE.md` / `AGENTS.md`.
- **N9:** when the change name matches a capability that already has a canonical spec, the delta copied from it is never owed.
- **N10:** the doc-hint fast path re-measures only when the set of changed files changes. Growth within the same files waits for the Stop hook.

## Spec-scenario coverage

Coverage is unchanged from iteration 1, plus the new tests above. `reports/backend.md` maps all 24 scenarios to tests.

---

## Iteration 1 (history): FAIL

- **B1 (High):** `scaffoldArtifactsForLevel` (`levels.ts:619-623`) seeds `proposal.md` from the level rationale, and `STUBS` did not recognize it. So a promoted level-2/3 change never owed its proposal, and a reopened level-1 change never owed its why.
- **B2 (High, testing standard):** `mcp-surface.test.ts` called `speclaw_check` with `projectPath: process.cwd()`, so `docHint` scaffolded or promoted changes and wrote `.speclaw/doc-hint.json` in the developer's checkout.
- **B3 (Medium):** the `"] Make the "` substring matched real tasks, so ship blocked forever.
- **B4 (Medium, process):** `api.md`, scenario coverage and `performance.md` were missing for a level-3 spec-lane change that touches MCP contracts.
- Non-blocking N1–N10 as listed above. N2, N3 and N6 have since been fixed.
