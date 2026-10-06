# Review — enforce-compass-first

- Role: reviewer (Cortex)
- Branch: `feat/enforce-compass-first` (uncommitted working tree vs `main`)
- Inputs: proposal.md, design.md, tasks.md, delta specs (lawbook-workflow, law-enforcement, cli), docs/standards/*
- Method: static review only. Compass was used first. New, untracked, or stale-indexed files were read directly. No gates were run because the reviewer has no Bash; the tester owns the gates.

**Current verdict (iteration 2): PASS.** No blocking defect remains. Minor and nit items are listed as follow-ups. Iterations 1 and 0 are kept below as history.

---

## Iteration 2 (after rework 2)

### Verdict: PASS

### Status of iteration-1 findings

| # | Status | Evidence |
| --- | --- | --- |
| R1 placeholder marker | **Resolved** | See below. |
| R2 `hookSpecificOutput` scope | **Resolved** | See below. |
| R3 directory eligibility | **Resolved** (prose directories remain, see F2) | See below. |
| R4 append-back window | Unchanged (nit) | Carried to the follow-ups. |

- **R1 placeholder marker.**
  - `isPlaceholderDelta` (`src/modules/lawbook/scaffold-change.ts:203,212-214`) uses the whole-line regex `^<!-- speclaw:placeholder-delta -->[ \t]*$` (multiline).
  - It is the only check, used by both `specValidate` (`engine.ts:318`) and `specSync` (`engine.ts:417`).
  - This change's delta quotes the marker mid-line (`specs/lawbook-workflow/spec.md:686`, wrapped in backticks), so it no longer matches. A grep of `lawbook/` for the whole-line form finds nothing.
  - The stub still writes the marker on its own line (`scaffold-change.ts:219`), so drafts are still caught.
  - No new import cycle: `engine.ts` → `scaffold-change.ts` → `levels.ts` → compass only.
- **R2 `hookSpecificOutput` scope.**
  - `checkAction` (`src/modules/foundation/check.ts:176-178`) attaches `hookSpecificOutput` only when `event === "PostToolUse"` and a reason exists.
  - In `runCheck` (`src/cli/commands/check.ts:44-63`):
    - PostToolUse prints `additionalContext` or nothing, never a decision, and exits 0.
    - Every other event prints `permissionDecision`, exactly as on `main`, and exits 2 only on deny.
  - The law-enforcement delta "Action evaluation" (lines 208-223, scenario at 241-248) says the same.
- **R3 directory eligibility.**
  - `isDirectory` (`src/modules/foundation/compass-nudge.ts:153-159`) does one `statSync`. If the stat fails, it falls back to the extension check.
  - The project root skips the stat (`:140`).
  - A directory counts as having no extension, so `src/v1.2` is now eligible (`:143-145`).
  - Read on a directory is not eligible (`:142`).
  - This adds one stat and no index or DB access, which is consistent with the latency budget and the no-DB rule.

### Regression scan

- Checked: the cortex import graph (still acyclic), the lawbook import graph, the PreToolUse output (unchanged), the rotation code (unchanged since iteration 1), and the spec text against the implementation.
- No regressions found.

### Follow-ups (non-blocking)

- **F1 — minor — CRLF defeats the marker check.**
  - `PLACEHOLDER_LINE_RE` allows only `[ \t]*` before the end of the line, and with the `m` flag `$` matches only before `\n`.
  - Scenario: a placeholder delta checked out with CRLF (Windows, `core.autocrlf=true`) ends the marker line in `\r`. It does not match, so validate gives no warning and `sync` promotes the placeholder.
  - Fix: use `[ \t\r]*$`, and add a test.
- **F2 — nit — Prose directories still nudge.** Grep on `docs/` or `lawbook/` with no `glob`/`type` nudges. This is limited by the rate limit and is advisory only.
- **F3 — nit — Entries briefly hidden during append-back.** This is R4 from iteration 1.
- **F4 — nits carried from iteration 0 (n1):**
  - The CLI fail-open path for an unparseable payload prints `permissionDecision: allow` for any event.
  - The bench `--json <file>` can write outside the temp dir.
  - The bench `--link-node-modules` symlinks the real `node_modules`.
  - `harness.level` is fixed at `cortex start`, so a later `level set` in the single question round is not picked up (predates this change).
  - `recordCompassCall` runs `mkdir -p` for any `projectPath`.
- **Accepted by the coordinator:**
  - The `drift~changed-semantic` on `engine.ts` is resealed at archive.
  - The tester adds the missing `req~owners-cli~1` utest.
  - The `CLAUDE.md`/`AGENTS.md` lock acceptance (task 12.2) is human-only.

---

## Iteration 1 (after rework 1)

### Verdict: FAIL

Every iteration-0 finding is resolved. The rework introduced one blocker: the placeholder-delta marker check matches this change's own spec text, so the change can never sync or archive. The fix is one line.

### Status of iteration-0 findings

| # | Status | Evidence |
| --- | --- | --- |
| B1 cycle | **Resolved** | New leaf `src/modules/cortex/types.ts` has no imports. `compass-gate.ts:15` imports `./types.js`. `harness.ts:25-33` re-exports from and imports `./types.js`. `brief.ts` imports `./harness.js` only one way. No cycle remains in `src/modules/cortex`. |
| B2 coverage | **Resolved** | `// Covers: req~feature-draft~1` is in `test/unit/feature-draft.test.ts:1` and `test/e2e/cli.test.ts:160`. |
| B3 bench MCP | **Resolved** | See details below. |
| M1 nudge delivery | **Resolved** | `checkAction` (`src/modules/foundation/check.ts:171-181`) adds `hookSpecificOutput {hookEventName, additionalContext}` only when the event is not `PreToolUse` and a reason exists. No `permissionDecision` is set on that path. The PreToolUse result is unchanged. The CLI prints `result.hookSpecificOutput` (`src/cli/commands/check.ts:47-48`). Covered by the law-enforcement delta (lines 210, 242-245) and `test/unit/check.test.ts:401`. |
| M2 docs | **Resolved** | `docs/compass.md` covers the call log, nudge, and `refreshedDiverged` note (12 hits). `docs/cortex.md` covers `compassGate` (3 hits). `lawbook/config.yaml:26-29` has a commented `compassGate: warn` with an explanation. CLAUDE.md/AGENTS.md remain task 12.2 (human). |
| m1 rotation | **Resolved** (one nit, R4) | See details below. |
| m2 stderr count | **Resolved** | `printHarnessWarnings` (`src/cli/commands/cortex.ts:65-77`) prints the evidence count, then any warnings, to stderr. |
| m3 repo-wide Grep/Glob | **Resolved** (one nit, R3) | See details below. |
| m4 kebab-case | **Resolved** | `scaffoldChange` no longer checks names (`scaffold-change.ts:76-84`). `scaffoldFeature:293,297` enforces kebab-case for feature drafts only. Delta scenario "Quick and bug drafts keep accepting their existing names" added. |
| m5 placeholder delta | **Implemented, but see R1** | `PLACEHOLDER_DELTA_MARKER` is in the stub. `specValidate` warns (`engine.ts:318-322`). `specSync` refuses before copying (`engine.ts:415-423`). The draft step 04 text names `--capability`. |
| n1 alias names in foundation templates | **Resolved** | No alias tool names remain under `src/modules/**/assets/**`. |

Details for the longer rows:

- **B3 bench MCP.** `scripts/bench/compass-first.mjs`:
  - stamps each build's `package.json` as `<version>+bench-<label>` (`:222-228`);
  - checks the CLI stamp with `assertCliIsBuild`;
  - pins `.mcp.json` to `process.execPath <build>/dist/cli/index.js mcp`, and refuses hook servers missing from `.mcp.json` (`pinMcpToBuild`, `:250-268`);
  - checks MCP `initialize` → `serverInfo.version === stamp` (`assertMcpIsBuild`, `:274-322`). This works because `server.ts:18` reports `pkgVersion()`.
  - It is applied to both fixtures and every agent run (`:343`, `:617-618`, `:809-812`).
- **m1 rotation.** `rotateCallLog` (`src/shared/compass-calls.ts:62-79`):
  - claims the live file under a per-process unique temp name;
  - promotes it to `.1` only if the claimed file is over the cap;
  - otherwise appends it back to the live log, so `.1` is never replaced by a short file.
  - `readCompassCalls` (`:185-206`) reads the `.1` tail only when the whole live file fit in the window and does not reach back to `sinceMs`. Filtering is per row, so reordering after an append-back does not matter.
  - Tests are at `test/unit/compass-calls.test.ts:180-234`, including concurrent writers.
- **m3 repo-wide Grep/Glob.** `compass-nudge.ts:56-141`:
  - An empty or missing path now means the project root.
  - A Grep is eligible unless `glob`/`type` restrict it to non-indexed extensions. Braces are expanded and `rg` type aliases are mapped.
  - A Glob is eligible when its pattern names an indexed extension or none.
  - Read stays eligible only for indexed extensions. Root, outside-project, and skipped directories still return null.
  - The hook template carries `tool_input.glob` and `tool_input.type` (`hooks.ts:62-63`).
  - Delta updated (law-enforcement lines 283-336). Test at `check.test.ts:294`.

### New findings

#### R1 — blocker — The placeholder marker is matched as a substring, and this change's own delta contains it, so sync and archive always refuse

- The marker is `PLACEHOLDER_DELTA_MARKER = "<!-- speclaw:placeholder-delta -->"` (`src/modules/lawbook/scaffold-change.ts:201`).
- It is matched with `content.includes(...)` in:
  - `specValidate`: `src/modules/lawbook/engine.ts:318`
  - `specSync`: `src/modules/lawbook/engine.ts:416-417`
- The requirement text that specifies the marker quotes it literally: `lawbook/changes/enforce-compass-first/specs/lawbook-workflow/spec.md:686` reads ``…carrying the `<!-- speclaw:placeholder-delta -->` marker…``.
- **Failure scenarios:**
  1. `lawbook_change validate enforce-compass-first` warns that `specs/lawbook-workflow/spec.md` is a placeholder.
  2. `lawbook_change sync enforce-compass-first` throws `refusing to sync placeholder delta(s): specs/lawbook-workflow/spec.md`. Archive needs synced specs, so it is blocked permanently. Task 13.1 cannot complete.
  3. If the text were synced some other way, the canonical `lawbook/specs/lawbook-workflow/spec.md` would contain the marker. Every later change that updates `lawbook-workflow` must start from that canonical text, as the "grounds a capability delta" requirement says, and `lawbook draft --capability lawbook-workflow` copies it. All of them would then warn and be refused by sync forever.
- **Fix:** Detect the marker only as a standalone line, e.g. `/^<!-- speclaw:placeholder-delta -->[ \t]*$/m`, in one shared helper used by both validate and sync. Add a regression test: a delta that quotes the marker inside backticks or prose validates without the warning and syncs. Optionally reword the delta so it does not quote the literal.

#### R2 — minor — `hookSpecificOutput` is emitted for every non-PreToolUse event, including `Stop` and `InstructionsLoaded`

- `check.ts:176-178` (MCP path) and `cli/commands/check.ts:47-48` (CLI) attach `hookSpecificOutput` whenever the event is not PreToolUse and a reason exists.
- Claude Code documents `hookSpecificOutput.additionalContext` for `PostToolUse` (and `UserPromptSubmit`/`SessionStart`), not for `Stop`.
- **Scenario:** A path law with `enforcement: gate` and an empty or `**` scope produces a reason on `Stop`. The hook output then carries `hookEventName: "Stop"`, which the host may reject as invalid hook JSON. This is low probability, because `Stop` payloads seldom resolve a target.
- **Fix:** Restrict the field to `PostToolUse`, or to an allowlist of events that support `additionalContext`.

#### R3 — nit — Eligibility false positives and negatives on directories

- **False positive:** Any extension-less directory counts as code for Grep/Glob. `Grep path: "docs"` or `path: "lawbook"` with no `glob`/`type` nudges even though the tree is prose. The effect is bounded by the 5-minute rate limit and the advisory wording.
- **False negative:** A directory with a dot in its name (`src/v1.2`) is treated as a file with a non-indexed extension, so it never nudges.
- These are acceptable as-is. A follow-up could check `fs.statSync(target).isDirectory()`.

#### R4 — nit — Entries are briefly invisible during append-back

- Between `renameSync(file, claimed)` and `appendFileSync(file, …claimed)` (`compass-calls.ts:65-75`), the lines being moved are not in the live log or `.1`.
- A gate or nudge evaluated in that window could miss them, and a failed append-back loses them (best-effort).
- This happens only in a narrow window around rotation. Acceptable.

### Accepted / out of scope (per coordinator)

- `verify --ci` reports `drift~changed-semantic` on `engine.ts`. It will be resealed at archive.
- The `req~owners-cli~1` utest gap predates this change. The tester adds the test.

### Rework guidance (minimum to PASS)

1. R1: anchor the placeholder-marker match to a whole line, shared by `specValidate` and `specSync`. Add a regression test for a delta that quotes the marker. Re-run `lawbook_change validate enforce-compass-first`, which must show no placeholder warning for `lawbook-workflow`.
2. R2 (recommended in the same rework): emit `hookSpecificOutput` only for `PostToolUse`.

---

## Iteration 0 (history)

### Verdict: FAIL

The core design holds up:

- The nudge never decides on a permission.
- PreToolUse behaves as on `main`.
- A strict rejection writes nothing.
- The call log is best-effort.
- `shared` imports only `node:` modules.
- The tool count stays at nine.

Three defects block CI, archive, or the human-required benchmark. Each fix is small. There are also two major gaps (docs and how the nudge reaches the agent). Details and rework guidance follow.

### Findings

#### B1 — blocker — New file-level import cycle in `src/modules/cortex` (fails `law~no-module-cycles~1`, so CI goes red)

- `src/modules/cortex/compass-gate.ts:15` has `import type { HarnessStage, HarnessState } from "./harness.js"`.
- `src/modules/cortex/harness.ts:14-21` imports `./compass-gate.js`.
- The Compass TS extractor records every `import_statement`, including `import type` (`src/modules/compass/languages.ts:78,107`). `resolveImportEdges` resolves both edges, and nothing filters out type-only imports.
- `law~no-module-cycles~1` (`.speclaw/laws-manifest.json:64`) is a `graph` law with `circular: true` and `edgeKinds: ["import"]`. Its scope is `src/modules/**` at file granularity, its severity is `error`, and its enforcement is `gate`.
- No other mutual import pair exists under `src/modules` today.
- **Failure scenario:** `.github/workflows/speclaw.yml:36` runs `node dist/cli/index.js verify --ci … --strict-engines --path src`. It reports the cycle `harness.ts ↔ compass-gate.ts` and exits 1, so the PR's CI fails.
- This also departs from design §2, which says compass-gate uses "only fs, path, and the shared helper".
- **Fix:** Make `evaluateCompassGate` / `stageStartedAt` / `CompassEvidence` take a structural type (`{ stage: string; history: Array<{ at: string; to: string }> }`), or move the harness types into a leaf `cortex/types.ts` that both files import. Then confirm with `speclaw index && speclaw verify --ci --path src`.

#### B2 — major (blocks archive) — `req~feature-draft~1` has no `utest` coverage link

- The requirement declares `Needs: impl, utest` and `Status: approved`.
- `impl` links exist: `src/modules/lawbook/scaffold-change.ts:16` and `change-tool.ts` (draft case).
- No test file carries `// Covers: req~feature-draft~1`. `test/unit/feature-draft.test.ts` has none; a grep over `test/` finds only the nudge, call-log, and gate ids.
- **Failure scenario:** `specArchivePreconditions` adds a direct coverage defect ("uncovered type utest"), so `lawbook_archive` refuses. The `speclaw coverage --only-defects` check in task 9.1 also fails.
- **Fix:** Add `// Covers: req~feature-draft~1` at the top of `test/unit/feature-draft.test.ts`, and in the e2e `lawbook draft` case if you want it too.

#### B3 — major — The agent benchmark measures the published speclaw, not either build (task 8.3 results would be invalid)

- `scripts/bench/compass-first.mjs:502` runs `speclaw init` inside each agent fixture. Init writes `.mcp.json` with `MCP_ENTRY = { command: "npx", args: ["-y", "@esneiderbravo/speclaw", "mcp"] }` (`src/shared/agents.ts:74`).
- `claude -p --mcp-config <fixture>/.mcp.json` then starts the npm-registry release for both the `main` and branch runs.
- **Failure scenario:** In branch runs, Compass MCP calls are served by 2.0.3, which has no call log, and the `mcp_tool` hook calls 2.0.3's `speclaw_check`, which has no nudge. Every branch run therefore reports `nudge: no`. The scripted `cortex advance` (branch CLI) reports `compassEvidence.calls: 0` with a warning. The only real difference between the two refs is the skill/agent text. The `npx -y` call also needs the network.
- **Fix:** After init in `agentRun` (and `makeFixture`), rewrite `mcpServers.speclaw` to `{ "type": "stdio", "command": process.execPath, "args": [build.cli, "mcp"] }`. Then assert `nudged === true` for the branch micro probe before the agent runs.

#### M1 — major — The nudge may never reach the agent through the MCP hook path

- Hooks are `mcp_tool` entries. `speclaw_check` returns the raw `CheckResult` JSON: `{verdict, evaluated, reason, nudge, …}` (`src/modules/foundation/register-core.ts:48-49`).
- For PostToolUse, Claude Code adds hook output to the model's context only through `hookSpecificOutput.additionalContext`, or through `reason` when `decision: "block"`. A bare top-level `reason`/`nudge` is not documented to reach the model.
- Design §3 assumes "the result text enters the agent's context". Nothing in this change verifies that assumption. Only the CLI fallback emits `additionalContext` (`src/cli/commands/check.ts:44-55`).
- **Failure scenario:** An explorer greps all session long and never sees the nudge. Laws, latency, and tests all stay green while the feature does nothing.
- **Fix:** Either
  - for non-PreToolUse events, have the MCP result also carry `hookSpecificOutput: { hookEventName, additionalContext: reason }`, never with `permissionDecision`, plus a unit test; or
  - have the tester show with a real headless run (after B3 is fixed) that the nudge text reaches the transcript. Until then, record it as a pending manual step.

#### M2 — major — Documentation task 12.1 is not done

- `compassGate`, `compass-calls.jsonl`, the nudge, and the `refreshedDiverged` upgrade note appear nowhere in `docs/`, `lawbook/config.yaml`, `CLAUDE.md`, or `AGENTS.md`. A grep for `compassGate|compass-calls|nudge|refreshedDiverged` finds nothing.
- `docs/compass.md` is modified, but none of these topics are in it. `docs/cortex.md` is untouched.
- **Failure scenario:** A user has no documented way to find or set `compassGate: strict`. After `speclaw update`, users see `refreshedDiverged` on their hook settings with no explanation. Proposal item 6 and design §7 require these docs.
- **Fix:** Do task 12.1. Task 12.2 (CLAUDE.md/AGENTS.md lock acceptance) stays with the human.

#### m1 — minor — Rotation can hide evidence from the gate

- `src/shared/compass-calls.ts:64-66` rotates when the log is over 256 KiB, and readers only see the live file.
- **Scenario:** In strict mode, the stage's only `compass_find` pushes the log past 256 KiB. The next logged call (for example `compass_index` or a nudge entry) rotates the log, which moves that find into `.1`. `advance` then counts 0 and rejects. This contradicts design §1's claim that "the bound never changes the result".
- **Race:** Two processes can both see a log above the cap. If A renames the log and appends, and B then renames A's fresh one-line file over `.1`, the whole previous generation is lost and the live entry moves out of view.
- **Fix:** Have `readCompassCalls` also read the tail of `.1` when the live file is shorter than `maxBytes`. Optionally rename to a unique temporary name before replacing `.1`.

#### m2 — minor — The CLI does not print the `compassEvidence` count to stderr

- The cli delta ("Cortex advance surfaces the Compass gate") requires the count and any warning on stderr.
- `printHarnessWarnings` (`src/cli/commands/cortex.ts:65-69`) prints only `warnings`. The count appears only in stdout JSON. The spec scenarios still pass, but the requirement text is not met.

#### m3 — minor — The most common Grep/Glob calls never nudge

- Grep and Glob usually omit `path`, which means the cwd, that is, the project root. `compass-nudge.ts:91-94` returns null for an empty or root target, as the spec says.
- So "grep across the repo", the exact pattern this change targets (design, "Decisions"), never triggers the nudge.
- Grep's `glob` and `type` parameters are not in the hook input template either.
- **Recommendation:** Amend the spec in a follow-up. Treat an empty or root target for Grep/Glob as eligible when `pattern`, `glob`, or `type` names an indexed extension, or for Grep always.

#### m4 — minor — `quick` and bug drafts now reject non-kebab names

- `scaffoldChange` (`src/modules/lawbook/scaffold-change.ts:81-83`) applies `CHANGE_NAME_RE` to every scaffold. The spec gives this refusal only to feature drafts, and requires `quick` and bug outputs to "remain unchanged".
- **Scenario:** `speclaw quick FAR-2199-fix`, or a name with an underscore, used to scaffold and now throws.
- Either accept it as an intended tightening and say so in the delta, or apply the regex only in `scaffoldFeature`.

#### m5 — minor — The default delta stub creates a capability named after the change

- `scaffoldFeature` defaults `capability` to the change name and writes a placeholder requirement (`featureDeltaMd`).
- `skills/draft/steps/04-write-artifacts.md:7-9` never says to pass `--capability <name from step 03>`, or to delete an unused stub.
- **Scenario:** The planner scaffolds `add-widget --level 2`, writes its real delta under `specs/widgets/`, and leaves `specs/add-widget/spec.md` in place. Sync then creates a junk canonical capability, `add-widget`, with the placeholder requirement. This runs against "Draft reuses existing capabilities by exact name".
- **Fix:** Update step 04 (shipped asset) to name `--capability` / MCP `capability` and to remove unused stubs.

#### n1 — nit

- `src/cli/commands/check.ts:38`: an unparseable payload prints `permissionDecision: "allow"` whatever the event. This matches `main` and is fail-open, but it is the one path where a non-PreToolUse event still gets a decision.
- `scripts/bench/compass-first.mjs`:
  - `--json <file>` writes to a path the user names, which may be outside the temp dir. This is explicit, but the header says "never writes outside temp".
  - `--link-node-modules` symlinks the real `node_modules` into the copies, where a build could write.
  - Otherwise isolation is good: `NEVER_COPY` excludes `.mcp.json`, `.env*`, `settings.local.json`, and `.speclaw/`; HOME is sandboxed for speclaw runs; `assertInside` is used; cleanup runs on exit.
- `src/modules/foundation/assets/{CLAUDE.template.md,docs/compass.template.md,docs/standards/lawbook.template.md}` still name alias tools (`compass_impact`, `lawbook_archive`, …). This is outside the delta's "lawbook assets" scope but inconsistent with it.
- `harness.level` is captured at `cortex start`. The new single question round sets the level after start, so `allowedAdvance` keeps using the start-time level, which defaults to 3. This predates the change; it is now easier to hit.
- `recordCompassCall` runs `mkdir -p <projectPath>/.speclaw` for any `projectPath`, including a typo. `logDeprecatedCall` already does the same.

### Checked and OK (iteration 0)

1. **Permission semantics**
   - `compileHooks` emits `Read|Grep|Glob` only under `PostToolUse`, always, with the speclaw identity (`src/modules/foundation/hooks.ts:120`). `mergeHooks` still removes only speclaw entries.
   - `checkAction` returns early with `evaluated: []` for PostToolUse Read/Grep/Glob, so reads never evaluate laws.
   - The nudge never touches `verdict`. The PreToolUse path matches `main`. The CLI emits no `permissionDecision` for non-PreToolUse events and exits 0.
   - The nudge opens no DB: `langForPath` (`src/modules/compass/languages.ts:134`) is a pure map with no grammar or DB at import, and a test asserts no sqlite module is loaded.
2. **Gate**
   - The gate runs after `allowedAdvance` and before `writeHarness`, so a strict rejection writes nothing.
   - Only `exploring` and `implementing` are gated; the default is `warn`; `off` skips the gate.
   - The window starts at the newest history entry entering the current stage, so a rework resets it.
   - `compass_index` and nudge entries are not evidence; aliases are.
   - All four callers go through `handleHarness`. CLI warnings go to stderr and stdout stays JSON.
   - The tests cover each mode, invalid keys, byte-identical rejection, and rework.
3. **Call log**
   - Never throws.
   - Tail read is bounded at 64 KiB, with the extra boundary byte handled correctly.
   - Malformed and partial lines are skipped.
   - Appends use small `appendFileSync` writes, which are atomic enough on POSIX.
   - Recorded from the MCP `add` closure (canonical name), from each alias handler, and from the CLI twins `explore/search/recall/impact/trace/diff-context/index`.
   - `.speclaw/` is already gitignored (`src/modules/foundation/scaffold.ts:205`).
4. **Boundaries**
   - `src/shared/compass-calls.ts` imports only `node:`.
   - foundation → `compass/languages.js` is allowed (only compass → foundation is forbidden).
   - cortex does not import lawbook.
   - Exception: B1.
5. **Scaffold refactor**
   - `setCeremonyLevel` now keeps `changeType` (`src/modules/lawbook/levels.ts:517`). This fixes `level set` silently turning a bug change into a feature.
   - Refusals happen before any write.
   - Fresh drafts include `design.md` and a delta at levels 2–3, so they validate.
   - Still nine tools; the `lawbook_change` description stays short.
   - Exceptions: m4, m5.
6. **IndexStats**
   - `totals` and `nextStep` are set right before COMMIT (`src/modules/compass/indexer.ts:552-553`), with no early return.
   - No other code builds an `IndexStats`.
   - `index --json` suppresses the header.
7. **Shipped texts**
   - No alias tool names remain under `src/modules/lawbook/assets`.
   - The explorer template names symbols and questions, not file paths.
   - There is a single `pauseForQuestions` round with level `propose` → `set`.
   - The explore step indexes only when find returns nothing.
   - The tester can still select affected tests through Bash (`speclaw affected-tests`).
8. **Tests** carry `// Covers:` for the call-log, gate, and nudge ids. Exception: B2.
