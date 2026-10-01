# Design: Cortex — One brain. Many agents.

## Layers

| Layer | Responsibility |
|-------|----------------|
| Skill | Procedure (explore/draft/build/test/sync/archive + **cortex** coordinator) |
| Agent | Who runs which skill + declared tool allow/deny |
| Cortex | Primary agent follows `cortex`; spawns or role-plays stages; MCP `cortex` |
| Motor | Deterministic `harness.json` + archive blockers — no LLM |

## Module boundaries

- `src/modules/cortex/` owns harness state, briefs, and the `cortex` MCP tool /
  CLI. It **must not** import `lawbook` (avoids cycles). Ceremony level on
  `start` is read from `lawbook/changes/<name>/change.json` `confirmedLevel`
  (default 3).
- `lawbook/engine.ts` imports `harnessArchiveBlockers` from cortex.
- `lawbook_change` action `harness` is a deprecated alias calling the same
  `handleHarness`.

## State machine

Stages: `exploring` → `planning` → (`questions` ↔ `planning`) → `implementing`
→ `reviewing` ↔ `implementing` → `testing` ↔ `implementing` → `archiving` →
`done`.

- Level 0: brief explore → implement → test → archive (skip review).
- Levels 1–3 / bugs: full cycle; bugs use `investigate` with/instead of explore.
- Max **3** review/test → implement reworks; then coordinator asks the human.
- Planner questions always surface to the human (never auto-answered).

## `harness.json`

```json
{
  "version": 1,
  "change": "add-multiagent-harness",
  "stage": "implementing",
  "level": 3,
  "iteration": 0,
  "maxRework": 3,
  "verdicts": { "review": null, "test": null },
  "openQuestions": [],
  "history": [{ "at": "ISO", "from": "planning", "to": "implementing", "op": "advance" }]
}
```

## `brief` action

Returns harness state plus `{ role, agentPath, skillHints, nextOps }` for the
current stage (or nulls when not started / done).

## Permissions (declared, host-enforced)

- **coordinator** (primary session): spawn, ask human, cortex tools. No `src/`
  edits, no archive, no push, no `laws accept`.
- **explorer**: Compass + Read. No Write/git write/draft/archive.
- **planner**: lawbook change artifacts + level. No `src/` / archive.
- **implementer**: code + tests + task checkboxes. No archive/push; no silent
  review fixes.
- **reviewer**: Read + Compass; writes `reports/review.md` with PASS/FAIL. No
  code patches.
- **tester**: quality gates + manual verification + discipline reports; may add
  missing tests only.
- **archiver**: reconcile + sync + archive. No new feature work.

Cursor does not enforce tool allowlists; the cortex skill repeats the
contract in each Task prompt. Claude Code uses frontmatter `tools` /
`disallowedTools` where supported.

## Packs

Delete `src/modules/tools/assets/packs/agents/*` and empty `packs.json`. Init
defaults to no packs; skip the packs multiselect when the catalog is empty.
Update filters unknown pack names from the manifest so old `agents` entries
stop being reinstalled. Role agents install via `installWorkflow`.

## Archive blockers (additive)

When a `harness.json` exists (or always once Cortex is default):

- Levels ≥1: `verdicts.review === "PASS"` (and `reports/review.md` present).
- All levels: `verdicts.test === "PASS"`.

`advance` from reviewing/testing records the verdict from the report files
when the agent passes `verdict: PASS|FAIL`.

## Fallback without spawn

If the host cannot spawn subagents, the primary adopts each role in turn but
**must** obey that stage's permission profile (cortex step text).
