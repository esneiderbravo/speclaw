# API checks — harden-update-lock-and-cli (2026-10-06)

Date 2026-10-06 · Branch `feat/coordinator-status-updates` · gates in cwd `/Users/esneiderbravo/Projects/speclaw`. I exercised the contract against the **freshly built** server: `node dist/cli/index.js mcp`, spawned over stdio by the official SDK client (`@modelcontextprotocol/sdk` `Client` + `StdioClientTransport` from this repo's `node_modules`, script `/tmp/speclaw-mv.IlR3ps/mcp-client.mjs`). Its `cwd` and every `projectPath` were the throwaway repo `/tmp/speclaw-mv.IlR3ps/p4`, with `HOME=/tmp/speclaw-mv.IlR3ps/home`. I did not use the session's long-running MCP server, which may predate this build. No call touched this repo.

## Contract under test

### MCP tool `cortex`, actions `status` / `brief` on an archived change

- **Input schema: unchanged.** `{ projectPath: string, change: string, action: enum(status|start|advance|rework|brief), note?, verdict?: PASS|FAIL, openQuestions?: string[], pauseForQuestions?: boolean }`. `git diff main -- src/modules/cortex/register.ts` touches only the description and the `fitStatusResult` wrapping, both from the sibling `coordinator-status-updates`. This change adds no zod field.
- **Auth / permissions:** local stdio MCP, no auth. `status`/`brief` are read-only, and the archived `harness.json` was byte-identical after them.
- **Resolution / ordering guarantee:** if `lawbook/changes/<name>/` exists, it wins. Otherwise the lexically newest `lawbook/changes/archive/<YYYY-MM-DD>-<name>` matching `^\d{4}-\d{2}-\d{2}-<name>$` is used (`2026-03-01-other-<name>` never matches). Each call is a fresh read.
- **Results:**
  - `status` (archived) → `{ summary: { …, stage: "done", tasks: {done, total}, … }, state: { stage: "done", … } }` (not an error).
  - `brief` (archived) → `{ state: { stage: "done", … }, role: null, nextOps: [] }`.
  - `brief` while still `archiving` (active) → `role: "archiver"`, `nextOps: []` (was `["advance"]`, N6).
  - Unknown change → tool error `change "<name>" not found under lawbook/changes/` (unchanged).
- **Mutating ops on an archived change** (`advance`, `rework`, `start`) → tool error (`isError: true`) `change <name> is archived (lawbook/changes/archive/<date>-<name>); Cortex ops are read-only`. Nothing is written.

### MCP tool `lawbook_change`, action `archive`

- **Input schema: unchanged** (`date` stays required for `archive`; the call without it returned `lawbook_change: action 'archive' requires 'date'`).
- **Result gains `harnessCompleted: boolean`**: `true` when the harness moved `archiving → done` during this archive, `false` when it was already `done`.
- **Ordering guarantee:** the harness is completed **after** every precondition and the sync, and **before** the directory rename. If the rename throws, the original `harness.json` bytes are restored.
- **Gate (unchanged):** a change without `harness.json` is refused with `cannot archive "<name>" — resolve first: missing harness.json — run speclaw cortex start --change <name>`, and no `harness.json` is created.

### Tool surface

- `tools/list` on the built server returned 29 tools (the 9 canonical tools plus the deprecated aliases). `CANONICAL_TOOLS` in `src/shared/tool-catalog.ts` has **9** entries (`compass_explore, compass_find, compass_diff_context, compass_index, cortex, lawbook_change, lawbook_investigate, speclaw_setup, speclaw_check`), and `git diff --stat main -- src/shared/tool-catalog.ts` is empty, so the count is unchanged. `test/contract/registers.test.ts` "canonical MCP tools match the consolidated surface" passes.
- The pinned `.mcp.json` launcher entry (`npx -y @esneiderbravo/speclaw@<pkgVersion> mcp`) is per-developer agent wiring, not a tool contract. It is verified in `cli.md` (M3, M16).

### Status codes / exit codes

MCP has no HTTP status codes. The equivalents are `isError: false` (success) and `isError: true` (tool error with message). For the CLI wrappers: `cortex status|brief` on an archived change → exit 0; `cortex advance|rework|start` on an archived change → exit 1; `lawbook archive` success → exit 0.

## Exercise log (built server, stdio, temp repo)

```
tools/list count: 29 speclaw_setup,speclaw_check,init_project,configure_agent,list_packs,add_pack,lawbook_change,lawbook_investigate,lawbook_init,lawbook_list,lawbook_validate,lawbook_sync,lawbook_archive,lawbook_level,lawbook_coverage,lawbook_drift,compass_explore,compass_find,compass_diff_context,compass_index,compass_search,compass_recall,compass_impact,compass_trace,compass_affected_tests,compass_hotspots,compass_coupling,compass_watch,cortex
cortex brief (archiving, active): isError=false {"state.stage":"archiving","nextOps":[]}
lawbook_change archive scratch-two: isError=false {"archivedTo":"lawbook/changes/archive/2026-10-07-scratch-two","harnessCompleted":true}
cortex status (archived): isError=false {"summary.stage":"done","summary.tasks":{"done":3,"total":3},"state.stage":"done"}
cortex brief (archived): isError=false {"state.stage":"done","nextOps":[],"role":null}
cortex advance (archived): isError=true "change scratch-two is archived (lawbook/changes/archive/2026-10-07-scratch-two); Cortex ops are read-only"
cortex rework (archived): isError=true "change scratch-two is archived (lawbook/changes/archive/2026-10-07-scratch-two); Cortex ops are read-only"
cortex start (archived): isError=true "change scratch-two is archived (lawbook/changes/archive/2026-10-07-scratch-two); Cortex ops are read-only"
cortex status (archived, earlier CLI): isError=false {"summary.stage":"done"}
cortex status (unknown): isError=true "change \"nope\" not found under lawbook/changes/"
lawbook_change archive no-harness: isError=true "cannot archive \"no-harness\" — resolve first:\n  - missing harness.json — run `speclaw cortex start --change no-harness`"
```

Archived `harness.json` after the run: `{"stage":"done","last":{"from":"archiving","to":"done","op":"advance","note":"archived by lawbook archive"}}`. `lawbook/changes/no-harness/` still holds only `change.json`, `record.md`, and `reports`.

Tester mistake, recorded for transparency: my first run omitted `date`, so the archive was refused and `scratch-two` stayed active. The `advance`/`start` calls that followed therefore hit an **active** change and succeeded, which is correct behavior for an active change. I deleted that scratch harness, re-drove it to `archiving`, and re-ran with `date: "2026-10-07"`. The log above is from the corrected run.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Lint + format / build | `npm run check`, `npm run build` | ✅ exit 0 / exit 0 |
| Full suite | `npm test` | ✅ 833/833, 0 fail; coverage 86.32 / 82.68 / 88.22 |
| Contract + budget + harness | `node --test --test-concurrency=1 dist-test/test/contract/registers.test.js dist-test/test/unit/mcp-budget.test.js dist-test/test/unit/harness.test.js` | ✅ tests 26, pass 26, fail 0 |
| Live MCP exercise | SDK stdio client against `dist/cli/index.js mcp` (above) | ✅ all expectations met |

## Tests added / updated

`test/unit/harness.test.ts`: archive → status `done` (red first, see `backend.md`); `harnessCompleted` in the `specArchive` result and `brief` on the archived change; mutating ops rejected without writing; newest archive wins; missing/done harness untouched plus the gate block; failed rename restores bytes; `brief("archiving").nextOps` is `[]`. The contract tests are unchanged and green.

## Spec-scenario coverage (API-relevant scenarios)

The full maps are in `backend.md` (`lawbook-workflow`, 128), `security.md` (`law-enforcement`, 114), and `cli.md` (`cli` 67, `project-update` 34). The scenarios that govern this API surface:

| Scenario | Verified by |
|----------|-------------|
| Archive moves the harness to done | unit "archive completes the harness…" + "the archive result reports harnessCompleted…"; MCP `lawbook_change` archive → `harnessCompleted: true`, archived stage `done` |
| An archived change is readable through Cortex | unit (same); MCP `cortex` `status` / `brief` → `done`, `nextOps: []` |
| Mutating ops on an archived change are rejected | unit "mutating ops on an archived change are rejected without writing"; MCP `advance`/`rework`/`start` → `isError`, message names the archived dir |
| The newest archive wins | unit "the newest exact archive wins when resolving a change" |
| A change without a harness is blocked and gets no harness | unit "completeHarnessOnArchive leaves a missing or done harness untouched"; MCP archive `no-harness` → blocked, no `harness.json` created |
| A failed move restores the harness | unit "a failed directory move restores the harness bytes" (`archiveFs` seam) |
| The shipped workflow does not advance after archive | unit "the shipped skill and archiver agent do not advance after archive"; `skills.md` |
| Digest acceptance is not exposed over MCP (`req~laws-accept-human~1`) | `tools/list`: no accept/lock tool; `rebaseline` is reachable only from CLI `laws lock --force` (reviewer grep; registers test) |

## Pre-existing / unrelated failures

None for the API surface. O1: the CLI `lawbook archive --json` prints text (the MCP result is JSON with `harnessCompleted`).

## Pending manual steps

None.

## Verdict

PASS
