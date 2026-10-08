# Performance checks — tool-arg-friction (2026-10-08)

2026-10-08 · `fix/tool-arg-friction` · main `dd2e092` (2.0.22) vs branch `db5792b` (2.0.23) ·
`/Users/esneiderbravo/Projects/speclaw`

Each ref ran its own build (`git archive` → `tsc` in a temp dir); every call ran in a throwaway
git repo under `os.tmpdir()` with a sandboxed `HOME`. Script: `scripts/bench/tool-args.mjs`.

## Gates & results

### 1. Replay of the real failed calls

The speclaw MCP calls that failed on a missing or misnamed argument in ftd-admin-finanzas
sessions (2026-09-22 → 2026-10-08), same tool and argument shape, weighted by how often each
happened. Command: `node scripts/bench/tool-args.mjs --iterations 20 --explore-repo /tmp/ftd-clone`
(explore cases on a clone of ftd-admin-finanzas, 1,211 indexed files).

| Shape | Real failures | main | branch |
|-------|---------------|------|--------|
| `archive` without `date` | 9 | ERR | ok (25 ms) |
| `lawbook_archive` alias without `date` | 5 | ERR | ok (18 ms) |
| `archive` with an unsynced delta ("run sync first") | 5 | ERR | ok (18 ms) |
| `level set` without `change` (branch picks it) | 3 | ERR | ok (23 ms) |
| `level set` with `name` | 2 | ERR | ok (1 ms) |
| `lawbook_level` alias without `change` | 1 | ERR | ok (1 ms) |
| action `create` | 3 | ERR | ok (2 ms) |
| `paths` as one string | 1 | ERR | ok (2 ms) |
| `lawbook_validate` alias without `change` | 1 | ERR | ok (3 ms) |
| `compass_explore` with `query`, no `node` | 4 | ERR | ok (360 ms, a real find) |
| **Total, first try** | **34** | **0 / 34** | **34 / 34** |
| `cortex start` on an undrafted change (out of scope) | 7 | ERR | ERR, now says "draft it first" + active changes |
| `speclaw_check {}` by hand (out of scope) | 3 | ERR | ERR (unchanged) |

### 2. Latency of well-formed calls (no regression)

`node scripts/bench/tool-args.mjs --iterations 50` — 2 warm-up calls, fresh fixture per call.

| Call | main median / p95 | branch median / p95 |
|------|-------------------|---------------------|
| `archive(change, date)` | 18.8 / 20.3 ms | 18.6 / 21.6 ms |
| `level set(change)` | 0.8 / 0.9 ms | 0.8 / 0.9 ms |
| `validate(change)` | 0.8 / 0.9 ms | 0.8 / 0.9 ms |
| `list` | 0.6 / 0.7 ms | 0.6 / 0.7 ms |
| `compass_explore(node)` | 4.4 / 4.9 ms | 4.4 / 5.3 ms |

A run at N=20 on the ftd clone showed branch archive p95 51 ms once; the N=50 rerun put it back
at 21.6 ms (noise). Inference costs ~20 ms (one `git rev-parse`) only on calls that omit `change`,
which used to cost a failed call and a model turn.

### 3. Headless agent, same task on each ref

`node scripts/bench/tool-args.mjs --agent-runs 3` — `claude -p` (default model) on a fresh repo
per run, branch `feat/FAR-1360-default-cost-center`, two active changes, the branch's delta
unsynced, `.mcp.json` pinned to the ref's build. Prompt: confirm the branch's change at level 2,
then archive it, with the speclaw MCP tools (no date or argument named).

| | main (N=3) | branch (N=3) |
|-|------------|--------------|
| Wall time, median | 24.7 s (24.1 / 27.7 / 24.7) | **16.3 s** (15.9 / 16.4 / 16.3) — **−34 %** |
| Turns, median | 8 | **6** |
| Cost, median | $0.183 | **$0.154** — **−16 %** |
| speclaw calls, median | 5 | **3** |
| speclaw calls that errored | 1 / 1 / 1 | **0 / 0 / 0** |
| Change archived, other change untouched | 3 / 3 | 3 / 3 |

Every main run hit `cannot archive … spec not synced … (run sync first)`, then called `sync`
and `archive` again; every branch run archived on the first `archive` call.

## Tests added / updated

- `test/integration/tool-args.test.ts` (7 tests through the real MCP client).
- `test/contract/registers.test.ts`: `compass_explore` accepts `query` without `node`.

## Spec scenario coverage

| Scenario (`specs/tool-arguments/spec.md`) | Verified by |
|-------------------------------------------|-------------|
| Archive without a date | tool-args test + replay `archive-no-date` |
| Unsynced delta | tool-args test + replay `archive-unsynced-spec` + agent runs |
| The branch picks the change | tool-args test + replay `level-set-no-change` |
| Nothing fits | tool-args test |
| Create drafts | tool-args test + replay `create-action` |
| A search phrase | tool-args test + replay `explore-query` |
| Start before draft | tool-args test + replay `cortex-undrafted` |

## Pre-existing / unrelated failures

None.

## Pending manual steps

None. Real-session effect to re-measure after ftd-admin-finanzas upgrades to 2.0.23: MCP error
rate (11 % before).

## Verdict

✅ PASS — the 34 real failed calls succeed on the first try (0 → 34), well-formed calls keep
their latency, and an agent doing the same task finishes 34 % faster with 2 fewer turns and no
speclaw errors.
