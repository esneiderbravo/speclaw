# Hooks checks — reindex-on-edit (2026-10-07)

Date 2026-10-07 · Branch `feat/reindex-on-edit` · cwd `/Users/esneiderbravo/Projects/speclaw` · manual sandbox `/tmp/rof-man.MyRY` (mktemp, `HOME` sandboxed, `npm_config_registry=http://127.0.0.1:9/`) · Node v24.17.0 · macOS Darwin 25.5.0 · `/bin/sh`

Scope: `src/modules/foundation/hooks.ts`. This covers `speclawCommand(sub)` (one builder for the SessionStart and reindex commands), the separate `PostToolUse` reindex group (matcher `Write|Edit|MultiEdit|NotebookEdit`, `type: command`, `timeout: 10`), the merge marker `speclaw reindex-file`, and the `update` 2.0.11 migration note.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Lint + format | `npm run check` | ✅ exit 0 |
| Type-check + compile | `npm run build` | ✅ exit 0 |
| Tests + coverage | `npm test` | ✅ exit 0: `tests 925 · pass 925 · fail 0 · skipped 0`; `hooks.js` 100 % line / 94.83 % branch / 100 % funcs; all files 87.44 / 84.46 / 89.31 |
| Change validation | `lawbook_change` `validate` | ✅ `valid: true`, no issues |
| Requirement coverage | `node dist/cli/index.js coverage --change reindex-on-edit --json` | ✅ `req~edit-reindex-hook~1`: covered `utest`, `itest`, `impl`; `uncoveredTypes: []`; 0 defects |
| Verify | `node dist/cli/index.js verify` | ✅ exit 0. `CLAUDE.md`, `AGENTS.md`, and `speclaw.lock` are unchanged (`git diff --quiet HEAD`) |

## Tests added / updated

- `test/unit/hooks.test.ts` (`// Covers: req~edit-reindex-hook~1`):
  - "SESSION_START_COMMAND is byte-identical to the 2.0.7 string"
  - "compileHooks always emits a separate edit reindex command group, even with zero laws"
  - "the reindex group never folds into the feedback mcp_tool group"
  - "mergeHooks keeps exactly one reindex group and preserves a user PostToolUse command"
  - "installHooks writes the reindex group for Claude only and reruns without drift"
  - sh-stub matrix:
    - "the reindex command does nothing without an index"
    - "the local binary receives reindex-file and the hook payload bytes"
    - "an older speclaw on PATH rejects reindex-file and touches nothing"
    - "the reindex npx fallback runs offline and never installs"
    - "a failing reindex never fails the edit"
- `test/integration/hooks.test.ts`: the init-written settings hold exactly one reindex group with matcher `Write|Edit|MultiEdit|NotebookEdit`, one hook, keys `command`, `timeout`, `type` only, type `command`, timeout 10.
- These are new-behavior tests, not a bug fix, so no red-first output is owed.

## Manual verification (built CLI, sandbox under `/tmp`)

| Step | Observed |
|------|----------|
| `speclaw init --yes --agents claude` in a fresh git repo | exit 0. `.claude/settings.json` hook groups: `PreToolUse Write\|Edit\|MultiEdit\|NotebookEdit mcp_tool:speclaw_check`, `PostToolUse Read\|Grep\|Glob mcp_tool:speclaw_check`, **`PostToolUse Write\|Edit\|MultiEdit\|NotebookEdit command` keys `["type","command","timeout"]`, timeout 10**, `Stop mcp_tool:speclaw_check`, `InstructionsLoaded mcp_tool:speclaw_check`, **`SessionStart startup\|resume\|clear\|compact command`**. That is exactly one SessionStart group and one reindex group, with no `async` key |
| Compiled command | `cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null && [ -f .speclaw/index.db ] && { if [ -x node_modules/.bin/speclaw ]; then node_modules/.bin/speclaw reindex-file; elif command -v speclaw >/dev/null 2>&1; then speclaw reindex-file; else npm_config_update_notifier=false npm_config_offline=true npx --no-install @esneiderbravo/speclaw reindex-file; fi; } >/dev/null 2>&1 \|\| true` |
| Builder identity | SessionStart command with `session-start` → `reindex-file` substituted equals the reindex command: yes |
| Hand-added user `PostToolUse` command hook (`matcher: Write`, `echo user-hook >/dev/null`), then `update --no-self-update` ×2 and `init --yes --agents claude` again | each exit 0. Final counts: SessionStart groups 1, reindex groups 1, user hook groups 1, PostToolUse total 3. Update 1 reported the settings refresh and printed the 2.0.11 migration note ("…reports the agent settings file under `refreshedDiverged` once; that is expected") |
| Real Claude-style payloads piped into the hook through `/bin/sh -c` with `CLAUDE_PROJECT_DIR` set (cwd `/`): Edit, Write (new file), MultiEdit (relative `file_path` + payload `cwd`), NotebookEdit (`notebook_path`) | all exit 0, 0 B stdout/stderr, hook wall 54–58 ms; each new symbol indexed by the detached child in about 500 ms; no `reindex-file` process left afterwards |
| NotebookEdit on a real `.ipynb` | exit 0, silent, no row written (not an indexed language) |
| Old binary first on PATH (`/usr/local/bin/speclaw` 2.0.6, no local binary) | `speclaw reindex-file` directly → `✗ Unknown command: reindex-file`, exit 1. Through the hook → exit 0, 0 B out/err. `.speclaw/`, `docs/`, and `src/` sizes and mtimes plus the `index.db` sha are identical, and the edited symbol is not indexed |
| npx fallback (`env -i PATH=<npx stub only>`) | exit 0, silent. Stub args `--no-install @esneiderbravo/speclaw reindex-file`, `offline=true notifier=false`, stdin bytes identical to the payload (`cmp`) |
| Local `node_modules/.bin/speclaw` stub | args `[reindex-file]`, stdin bytes identical (`cmp`), exit 0, silent |
| Failing local binary (stderr + exit 1) | hook exit 0, 0 B out/err |
| No `.speclaw/index.db` | hook exit 0, silent, no `.speclaw/` created |

## Spec-scenario coverage — `law-enforcement` delta (125 scenarios)

### Added or amended by this change (13)

| Requirement | Scenario | Verified by |
|-------------|----------|-------------|
| Idempotent hook merge (amended marker) | Pre-existing user hooks are preserved | `hooks.test.ts` merge tests (green); manual user-hook row |
| Idempotent hook merge | A user SessionStart command hook is preserved | `hooks.test.ts` (unchanged test, green) |
| Idempotent hook merge | **A user PostToolUse command hook is preserved** (new) | `hooks.test.ts` "mergeHooks keeps exactly one reindex group and preserves a user PostToolUse command"; manual (user hook survives 2× update + re-init) |
| Idempotent hook merge | Re-running produces no drift | `hooks.test.ts` "installHooks … reruns without drift"; manual (1 group after 3 reruns) |
| `req~edit-reindex-hook~1` | The edit reindex entry is installed without laws | `hooks.test.ts` "compileHooks always emits a separate edit reindex command group, even with zero laws"; `integration/hooks.test.ts`; manual init row |
| `req~edit-reindex-hook~1` | The reindex command is the session-start command with another subcommand | `hooks.test.ts` (`SESSION_START_COMMAND` byte-identical, builder); manual builder-identity row |
| `req~edit-reindex-hook~1` | The reindex command does nothing without an index | `hooks.test.ts` "the reindex command does nothing without an index"; manual no-index row |
| `req~edit-reindex-hook~1` | The local binary receives the hook payload | `hooks.test.ts` "the local binary receives reindex-file and the hook payload bytes"; manual local-stub row |
| `req~edit-reindex-hook~1` | An older speclaw on PATH does nothing on edit | `hooks.test.ts` "an older speclaw on PATH rejects reindex-file and touches nothing"; manual with the real 2.0.6 binary |
| `req~edit-reindex-hook~1` | The npx fallback runs offline on edit | `hooks.test.ts` "the reindex npx fallback runs offline and never installs"; manual npx-stub row |
| `req~edit-reindex-hook~1` | A failing reindex never fails the edit | `hooks.test.ts` "a failing reindex never fails the edit"; manual failing-binary row |
| `req~edit-reindex-hook~1` | The feedback hook group is unaffected | `hooks.test.ts` "the reindex group never folds into the feedback mcp_tool group" |
| `req~edit-reindex-hook~1` | Agents without hook support get no edit reindex entry | `hooks.test.ts` "installHooks writes the reindex group for Claude only…" |

### Inherited from the canonical spec, text unchanged (112)

| Requirement (unchanged text) | Scenarios | Verified by |
|---|---|---|
| Law manifest `req~adapt-seed-to-repo~1` | The manifest is seeded on init from the target repo; Cycle-law scope follows detected source roots; Speclaw-shaped repos still receive dogfood laws; A curated manifest is preserved on update; Missing manifest falls back to the adapted seed; Seed architecture deps laws consider import edges only; A law with an unimplemented backend is declared but inert | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Hook generation | Hooks generated for a hook-capable agent; The Compass nudge entry is installed without laws; Update rewrites hooks that lacked input; Agent without hook support | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Session-start index hook `req~session-start-hook~1` | The session-start entry is installed without laws; The command does nothing without an index; The local binary is preferred; An older speclaw on PATH does nothing; The npx fallback runs offline; A failing refresh never fails the session; Agents without hook support get no session-start entry | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Action evaluation | The command-hook fallback signals a block via exit code; The command-hook fallback carries PostToolUse context without a decision; The MCP result carries additionalContext on PostToolUse; A blocking law denies a matching action; Out-of-scope laws are not evaluated; A graph backend never runs on the action path; Evaluator failure fails open; PreToolUse latency stays within budget | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Compass-first nudge `req~compass-nudge~1` | Reading code without recent Compass calls nudges; A recent Compass call suppresses the nudge; Nudges are rate limited; Non-code and empty targets do not nudge; A repo-wide Grep or Glob nudges; Reads never evaluate laws; A dotted directory name is still a directory; Stop results carry no hookSpecificOutput; Grep over a source directory nudges with the pattern; PreToolUse never nudges; The nudge never touches the index database; The nudge path stays within the hook latency budget | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Deterministic batch verification | Passed, failed, and unknown are distinguished in one run; Missing index does not silently pass graph laws; Engine filter restricts what runs; Both transports return the same result | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Dependency backend | Forbidden dependency is detected with provenance; Group matching forbids cross-feature imports with one rule; Unresolved edges are reported as unknown, not passed | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Graph backend `req~graph-honours-scope~1` | Minimal cycle is reported instead of the whole component; Intra-file self-dependency is not a cycle; Graph law scope excludes out-of-scope files; Out-of-scope test files are not module cycles; Cycle detection survives deep import chains | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Discriminated law verification model | A deps rule payload is validated; A legacy path law still validates; A malformed rule payload is rejected at validation time | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Context coverage audit | Loaded laws are recorded; Doctor reports missing coverage | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Glob validation | Malformed glob is caught at generation time; Doctor reports graph-engine availability | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| CI verification command | Conforming project exits zero; New violation exits one; Incomplete verification is distinguishable from success; Shallow clone under --ci exits three; Unwritable SARIF path exits three; Unknown flag combination exits two | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| SARIF output | SARIF declares one rule per loaded law; Locations are repository-relative; Skips are visible in the SARIF run | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Deterministic markdown report | Coverage claims require traceability data | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| CI workflow security defaults | Template does not use pull_request_target; Permissions are denied by default; Existing workflow is left untouched; Missing workflow is created | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| CI verification includes structural drift findings | Semantic drift appears in SARIF; No anchors leaves verify unaffected | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Optional draft status on laws | Draft laws do not fail verify | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Parse laws from standards documents | Standards yield mergeable laws; Duplicate ids fail the parse | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Multidialect law compilation | Unchanged second compile is a no-op; Claude rules use paths frontmatter; Cursor rules use globs frontmatter; AGENTS delimited block degrades scope into prose; Copilot does not dual-emit the same scoped law; CodeRabbit merge preserves foreign keys; Nested AGENTS for dense package prefixes | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Import third-party rules as draft laws | Importing rulesync output | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Always-on law token budget in doctor | Always-on budget exceeded | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Committed rule lockfile `req~speclaw-lock~1` | Lockfile created with baseline; Line endings do not change digests; Provenance block is excluded from digests | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Lock refresh preserves drifted strict digests `req~lock-preserves-drift~1` | A modified CLAUDE.md survives an update refresh; A clean strict file is refreshed after compilation rewrites it; A new strict path is added; An advisory edit is refreshed freely; Stale accepted entries are pruned; Laws lock preserves drift and warns; Force without a terminal leaves the lock unchanged; Force on a terminal re-baselines and records acceptance; Force declined leaves the lock unchanged; Force writes nothing when files change during the confirmation; An unreadable lockfile is never rebuilt | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Integrity verification in verify pipeline `req~integrity-verify~1` | Modified AGENTS.md fails verify; Modified standards doc warns only; Missing lockfile is soft; Regenerable mirror symlink is not pinned and its absence does not fail verify; Missing non-mirror managed symlink fails verify | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Injection scanning of rules and skills `req~injection-scan~1` | Instruction override detected; Skill pack prose is scanned; Accept does not clear scan errors | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |
| Human-only lock acceptance `req~laws-accept-human~1` | No MCP tool mutates the lock; Accept without TTY fails; Lock force without TTY fails; Accept on an unreadable lockfile fails cleanly; Accept on a scan-only path reports that error alone | Inherited, unchanged by this change; regression: full `npm test` 925/925 pass |

## Pre-existing / unrelated failures

None.

## Pending manual steps

None. Windows and `cmd.exe` are not exercised. The hook is POSIX `sh` like session-start, so this is not a regression (design §8).

## Verdict

PASS
