# CLI checks — reindex-on-edit (2026-10-07)

Date 2026-10-07 · Branch `feat/reindex-on-edit` · cwd `/Users/esneiderbravo/Projects/speclaw` · manual sandbox `/tmp/rof-man.MyRY` (mktemp, `HOME` sandboxed, update notifier off, registry pointed at `127.0.0.1:9`) · Node v24.17.0 · macOS Darwin 25.5.0

Scope: the new `speclaw reindex-file [--] <path>...` / hook-mode command (`src/cli/commands/reindex-file.ts`), its dispatch in `src/cli/index.ts` (no header, no update notice, raw argv), `src/cli/lib/help.ts` (`COMMANDS` entry and `GLOBAL_HELP` line), and the 2.0.11 `update` migration note (`src/cli/commands/update.ts`).

**Why no `api.md`:** this change adds no MCP tool and removes none (nine remain). No MCP input schema or result shape changes, and there is no HTTP endpoint. The new surface is a CLI subcommand, which this report covers, plus agent hook wiring, which `hooks.md` covers. `compass_impact` / `compass_explore` keep their contract, and the dangling-id fix makes them honor it; `backend.md` has that evidence.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Lint + format | `npm run check` | ✅ exit 0 |
| Type-check + compile | `npm run build` | ✅ exit 0 |
| Tests + coverage | `npm test` | ✅ exit 0: `tests 925 · pass 925 · fail 0 · skipped 0`. `reindex-file.js` 97.96 % line / 88.68 % branch / 87.50 % funcs; `help.js` 100 / 100 / 100; e2e is excluded from the denominator by design |
| Change validation | `lawbook_change` `validate` | ✅ `valid: true` |
| Requirement coverage | `coverage --change reindex-on-edit --json` | ✅ `req~reindex-on-edit~1`: covered `utest`, `itest`, `impl`; 0 defects |

## Tests added / updated

- `test/integration/reindex-file.test.ts` (new, built CLI, `// Covers: req~reindex-on-edit~1`). Cases:
  - without an index it is silent and creates nothing;
  - path mode picks up an edit and a new function silently;
  - hook mode re-indexes the payload's file in the background;
  - hook mode does not wait for a locked index;
  - path mode swallows a locked database;
  - the last edit wins when a run waits for the lock;
  - ineligible targets and malformed payloads are ignored;
  - the run is not logged as a Compass call;
  - help lists `reindex-file`, and `--help` prints usage.
- `test/unit/reindex-file-cli.test.ts` (new). Covers:
  - `reindexPathArgs` (flags dropped, `--` honored);
  - `hookTarget` (`file_path` before `notebook_path`, relative paths resolved against the payload `cwd`);
  - `realPathOf` on a deleted path;
  - in-process `runReindexFile`: path mode never throws; hook mode spawns the detached child and returns; hook mode ignores bad payloads, outside targets, and a terminal.
- `test/e2e/cli.test.ts`: the per-command help table picks up `reindex-file` from `COMMANDS` (green; it does not hang because `--help` short-circuits before stdin is read).
- This is new behavior, not a bug fix, so no red-first output is owed.

## Manual verification (built CLI)

| Case | Command / input | Observed |
|------|-----------------|----------|
| Hook mode, Edit | `printf '<Edit payload>' \| CLAUDE_PROJECT_DIR=… /bin/sh -c '<compiled hook>'` | rc 0, stdout 0 B, stderr 0 B, wall 0.057 s; `addedSymOne` indexed after about 500 ms; `explore addedSymOne` → `function addedSymOne src/a.ts:4-6` |
| Hook mode, Write (new file) / MultiEdit (relative path + payload `cwd`) / NotebookEdit (`notebook_path`) | same | rc 0, 0 B/0 B, 0.054–0.058 s; each symbol indexed after about 500 ms |
| Detachment | `pgrep -fl reindex-file` after the child finishes | none left; the parent returned before the child's work (see `performance.md` C vs D) |
| Not logged | `.speclaw/compass-calls.jsonl` before and after the hook runs | not created, unchanged |
| Ineligible targets, path mode | `reindex-file <outside abs>`, `node_modules/x.ts`, `README.md`, `src/huge.ts` (2.86 MB), `../outside/o.ts`, `src/nonexistent.ts` | each rc 0, 0 B/0 B; index fingerprint identical |
| Ineligible / garbage, hook mode | outside, ignored dir, unknown ext, huge, `not json at all {{{`, empty stdin, Bash payload with no `file_path`, blank path, JSON array, 2 MB stdin | each rc 0, 0 B/0 B; index fingerprint identical; no `nmSym` / `outSym` / `v1000*` rows |
| Deleted file | hook payload for removed `src/c.ts`; `reindex-file nb.py` after `rm` | rows removed, 0 dangling ids |
| No index | hook, path mode, and `printf payload \| speclaw reindex-file` in a dir without `.speclaw/` | rc 0, silent, nothing created |
| Old binary | `/usr/local/bin/speclaw` 2.0.6 `reindex-file` | `✗ Unknown command: reindex-file`, exit 1, before any database access; via the hook: rc 0, nothing touched (see `hooks.md`) |
| Help | `speclaw reindex-file --help` / `-h` | rc 0; `Usage: speclaw reindex-file [--] <path>...` / `speclaw reindex-file < hook.json` plus a description (silent, always exit 0, PageRank and the map deferred) |
| Global help | `speclaw --help \| grep reindex-file` | `reindex-file [paths...]  Silent re-index of edited files (PostToolUse hook; stdin JSON)` |
| No arguments on a TTY (D25) | `script -q /dev/null speclaw reindex-file` | prints usage and returns; it does not block on stdin |
| Concurrency | 3× `index --force` while 40 hook edits fire | all rc 0, no output, nothing lost (see `backend.md`) |

## Spec-scenario coverage

CLI-facing scenarios of `req~reindex-on-edit~1` (`code-graph` delta):

| Scenario | Verified by |
|----------|-------------|
| No index means nothing happens | `reindex-file.test.ts`; manual no-index row |
| An edited file is picked up in path mode | `reindex-file.test.ts` path mode |
| A hook payload re-indexes the edited file | `reindex-file.test.ts` hook mode; manual Edit/Write/MultiEdit/NotebookEdit |
| Hook mode does not wait for the index | `reindex-file.test.ts` "does not wait for a locked index"; `performance.md` C |
| Ineligible targets write nothing | `reindex-file.test.ts`; manual ineligible rows |
| A malformed hook payload writes nothing | `reindex-file.test.ts`, `reindex-file-cli.test.ts`; manual garbage rows |
| A locked database is swallowed | `reindex-file.test.ts` "path mode swallows a locked database" |
| The last edit wins under overlapping runs | `reindex-file.test.ts` "the last edit wins when a run waits for the lock" |
| The per-file run is not logged as a Compass call | `reindex-file.test.ts`; manual |
| Help lists the reindex-file command | `reindex-file.test.ts`, e2e help table; manual help rows |
| The per-edit cost stays below a full refresh | `performance.md` |

`backend.md` maps every other scenario of the `code-graph` delta (141 in total), one row each. `hooks.md` maps every scenario of the `law-enforcement` delta (125 in total), one row each.

## Pre-existing / unrelated failures

None.

## Pending manual steps

None.

## Verdict

PASS
