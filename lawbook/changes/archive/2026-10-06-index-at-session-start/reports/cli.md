# CLI checks — index-at-session-start (2026-10-06)

Date 2026-10-06 · Branch `fix/compass-source-and-session-index` · cwd
`/Users/esneiderbravo/Projects/speclaw` (gates); manual runs with the built
`dist/cli/index.js` in throwaway repos under `/tmp/speclaw-mv.RlefRR`
(`mktemp -d`, sandboxed `HOME`). Node v24.17.0, macOS 26.5.1 arm64.

Scope: the new top-level command `speclaw session-start`
(`src/cli/commands/session-start.ts` `runSessionStart`, dispatch, header, and
notifier exclusions in `src/cli/index.ts`) and the removal of any
`--session-start` flag from `index`.

**Is `api.md` owed? No.** The change adds a CLI subcommand and a Claude Code
hook entry. It adds or changes no HTTP endpoint, and no MCP tool, input
schema, or result shape (`speclaw_check`'s zod enum and `CheckEvent` are
deliberately not widened; design §1). Its contract is the CLI contract recorded
here: exit code always 0, empty stdout and stderr, no index created when one is
absent, and no call-log entry. The `api` discipline covers request/response
endpoints, status codes, and auth, none of which this change touches.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Lint + format | `npm run check` | ✅ exit 0 |
| Type-check + compile | `npm run build` | ✅ exit 0 |
| Tests + coverage | `npm test` | ✅ 663 tests, 663 pass, 0 fail. All files 85.77 / 82.56 / 87.80 (line / branch / funcs). The CLI layer runs in child processes and is excluded from the coverage denominator by standard. |
| Integration suite | `test/integration/session-start.test.ts` (in `npm test`) | ✅ 6/6: no index (40 ms), unchanged index (404 ms), edited function (653 ms), locked DB (5560 ms, the 5 s `busy_timeout`), not logged (399 ms), help (91 ms) |
| Spec coverage | `node dist/cli/index.js coverage --change index-at-session-start` | ✅ `ok 12 - req~session-start-index~1 (itest, impl)` |
| Change validation | `lawbook_change validate` | ✅ valid, 0 issues |

## Tests added / updated

None added by the tester for this discipline. The implementer's
`test/integration/session-start.test.ts` (6 tests) was reviewed against the
scenarios and passes.

## Spec-scenario coverage

Delta `specs/code-graph/spec.md`, `req~session-start-index~1`:

| Scenario | Verified by |
|----------|-------------|
| No index means nothing happens | `session-start without an index is silent and creates nothing`; manual: `node dist/cli/index.js session-start` in a temp dir with no index gave exit 0, stdout 0 B, stderr 0 B, no `.speclaw/` created |
| An unchanged index refreshes silently | `session-start on an unchanged index is silent and keeps docs/compass.md`; manual (b): exit 0, 0 B / 0 B, `docs/compass.md` 3089 bytes with identical sha and mtime `1791330728.742168275` before and after, `meta.indexed_at` advanced `23:52:45.437Z → 23:52:47.109Z` (proves the run happened) |
| A changed file is picked up | `session-start picks up an edited function`; manual (c): edited `add()`, hook run exit 0, 0 B output, 341 ms; `explore add` then showed `return a + b + 0; // edited-marker` |
| A locked database is swallowed | `session-start swallows a locked database` (open `BEGIN IMMEDIATE` from another connection gives exit 0 and silence) |
| The session-start run is not logged as a Compass call | `session-start is not logged as a Compass call`; manual (b) and (c): `.speclaw/compass-calls.jsonl` sha unchanged by the hook runs. An explicit `speclaw index` appended its own line, as expected. |
| Help lists the session-start command | `help lists session-start and index --help no longer offers a flag`; grep of docs, templates, README, CLAUDE.md, AGENTS.md, and skills finds no `--session-start` |

## Pre-existing / unrelated failures

None.

Tester note: `node dist/cli/index.js init --help` does not print help. It runs
`init`. While looking up flags, I ran it once in this repository by mistake. It
reported "0 added · 74 preserved untouched" and ran a no-op index. Effects:

- `.github/CODEOWNERS` was rewritten byte-identical to HEAD.
- The gitignored `ai-specs/.speclaw.json` was rewritten.
- `speclaw.lock` was refreshed by the existing `scaffold → refreshLockfile`
  path. The strict `CLAUDE.md` and `AGENTS.md` digests did not move:
  - both files were last modified at 18:39:24;
  - the implementer's dogfood `update` had already refreshed the lock after
    that (18:42);
  - the human `accepted` entries are preserved unchanged.
- Only the advisory `docs/compass.md` digest and the root hash could differ.

`speclaw verify` exits 0. This behavior predates this change (`init` treats
`--help` as an ordinary run) and is outside this change's scope. A follow-up
could make `init --help` print usage.

## Pending manual steps

None for the CLI command itself.

## Verdict

**PASS** for the `session-start` CLI contract. The hooks finding that made the
first overall verdict FAIL was fixed in rework 2 and re-tested as PASS (see
`hooks.md`). Re-test gates are unchanged: 663/663 tests, 85.77 / 82.56 /
87.80 coverage.
