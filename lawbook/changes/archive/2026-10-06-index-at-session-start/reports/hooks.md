# Hooks checks — index-at-session-start (2026-10-06)

Date 2026-10-06 · Branch `fix/compass-source-and-session-index` · cwd
`/Users/esneiderbravo/Projects/speclaw` (gates); manual runs in throwaway repos
under `/tmp/speclaw-mv.RlefRR` (`mktemp -d`), with a sandboxed `HOME` and
`CLAUDE_PROJECT_DIR` unset except where pinned. macOS 26.5.1 arm64 (Apple M1
Max), Node v24.17.0, npm 11.13.0.

Re-tested 2026-10-06 after rework 2 (`npm_config_update_notifier=false` on
the npx branch; review 3 PASS in `review.md`). Re-test manual runs used
`/tmp/speclaw-e.aofZhl` (trap check e) and `/tmp/speclaw-reg.qfQj6S`
(regression a–d), both `mktemp -d`, sandboxed `HOME`, deleted afterwards.

Scope: the `SessionStart` command hook (`src/modules/foundation/hooks.ts`:
`SESSION_START_COMMAND`, `SESSION_START_MARKER`, `isSpeclawHook`, the legacy
marker, `compileHooks`, `mergeHooks`) and its install via `init` and `update`.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Lint + format | `npm run check` | ✅ exit 0, "All matched files use Prettier code style!", ESLint clean |
| Type-check + compile | `npm run build` | ✅ exit 0 (`tsc` + "copy-assets: copied assets for 3 module(s)") |
| Tests + coverage | `npm test` (with `CLAUDE_PROJECT_DIR` unset) | ✅ exit 0, tests 663, pass 663, fail 0, skipped 0. All files 85.77% line / 82.56% branch / 87.80% funcs (floor 80%). `hooks.js` 100 / 94.64 / 100 |
| Spec coverage | `node dist/cli/index.js coverage --change index-at-session-start` | ✅ 12/12 ok; `req~session-start-hook~1 (utest, itest, impl)`. Before the graph was reindexed, the three new requirements read `not ok` (missing impl/test) because the new `// Covers:` tags and untracked files were not yet in the graph. This was a stale graph, not a code defect. |
| Change validation | `lawbook_change validate` | ✅ `valid: true`, 0 issues (EARS style warnings only) |
| Manual: npx branch makes no registry contact (first test) | real `npx` only on `PATH`, registry and proxy pointed at a local trap server | ❌ **1 registry request per run** (`GET /npm`, `npm-command: exec`) whenever npm's update-notifier stamp is stale. See the finding below (now resolved). |
| **Re-test after rework 2:** lint + format | `npm run check` | ✅ exit 0, "All matched files use Prettier code style!", ESLint clean |
| Re-test: type-check + compile | `npm run build` | ✅ exit 0 ("copy-assets: copied assets for 3 module(s)") |
| Re-test: tests + coverage | `env -u CLAUDE_PROJECT_DIR npm test` | ✅ exit 0, tests 663, pass 663, fail 0, cancelled 0, skipped 0. All files 85.77 / 82.56 / 87.80 (line / branch / funcs, floor 80). `hooks.js` 100 / 94.64 / 100 |
| Re-test: spec coverage | `node dist/cli/index.js index` then `node dist/cli/index.js coverage --change index-at-session-start` | ✅ `ok - 12 total`; `req~session-start-hook~1 (itest, impl, utest)`, `req~session-start-index~1 (itest, impl)`, `req~index-noop-fast-path~1 (itest, impl)` |
| Re-test: change validation | `lawbook_change validate` | ✅ `valid: true`, `issues: []` (EARS style warnings only) |
| Re-test: R5 mutation check | mutant `dist-test` copy with the two npm prefixes removed from `SESSION_START_COMMAND`, run with and without `npm_config_offline=true npm_config_update_notifier=false` in the caller env | ✅ the npx test **fails** on the mutant in both envs (`✖ the npx fallback runs offline and never installs`); the real build passes even with those vars set in the caller env (`✔`, pass 1) |
| **Re-test: manual (e) npx branch, no registry contact** | shipped `SESSION_START_COMMAND` read from `dist/modules/foundation/hooks.js`; real npx 11.13.0 + node only on `PATH`; registry and `HTTP(S)_PROXY` at a local trap; fresh sandboxed cache per run | ✅ **0 requests** in 3 fresh-cache runs; the positive control without the notifier prefix made 1 (`GET /npm`). Table below. |

## Tests added / updated

- Added in `test/unit/hooks.test.ts` (review R2):
  - `the session-start command resolves a project path that contains a space`:
    `CLAUDE_PROJECT_DIR` is `<tmp>/my project` and the cwd is elsewhere. The
    local stub is invoked with `session-start`, exit 0, empty stdout and stderr.
  - `a nonexistent CLAUDE_PROJECT_DIR exits 0 silently and runs nothing`: the
    cwd has an index and a local stub, and the project dir does not exist. Exit
    0, empty output, the stub is not run (no fallback to the cwd), and nothing
    is created.

  Both pass (`✔ … (222ms)`, `✔ … (9ms)`).
- Hardened in `test/unit/hooks.test.ts` (review R5, re-test): `runHookCommand`
  now passes `npm_config_offline: ""` and `npm_config_update_notifier: ""`
  before the per-test overrides, so the npx assertion (`"true false"`) can only
  pass through the hook command's own prefixes, not the developer's
  environment. A mutation run proved it (gates table).
- Existing (implementer), reviewed and green: compile with zero laws, identity,
  one-entry merge with legacy and user entries, Claude-only install with no
  drift, no index, local binary preferred, `PATH` fallback, older binary,
  offline npx stub, failing refresh.

## Spec-scenario coverage

Delta `specs/law-enforcement/spec.md`. Changed and new requirements:

| Scenario | Verified by |
|----------|-------------|
| Idempotent hook merge: Pre-existing user hooks are preserved | `mergeHooks preserves foreign entries and is idempotent`; manual: init into a repo with a foreign hook |
| Idempotent hook merge: A user SessionStart command hook is preserved | `mergeHooks keeps exactly one speclaw SessionStart entry and preserves a user one`; manual: the seeded `echo user-hook` `SessionStart` hook survived init ×2 and update (count 1) |
| Idempotent hook merge: Re-running produces no drift (exactly one speclaw `SessionStart`) | `installHooks writes the SessionStart entry for Claude only and reruns without drift`; manual: `.claude/settings.json` byte-identical after a second `init --agents claude --yes` and after `update`, with 1 speclaw entry and keys `["command","timeout","type"]` |
| Session-start index hook: The session-start entry is installed without laws | `compileHooks always emits the SessionStart index-refresh command, even with zero laws`; manual: fresh `init` wrote matcher `startup\|resume\|clear\|compact`, `type: command`, `timeout: 30`, and the marker plus the offline npx substring |
| …: The command does nothing without an index | `the session-start command does nothing without an index`; manual (a): the settings command via `/bin/sh -c` with `CLAUDE_PROJECT_DIR` pointing at a repo with no index gave exit 0, 0 B stdout and stderr, file listing (name/size/mtime) identical, no `.speclaw/` |
| …: The local binary is preferred | `the session-start command prefers the local binary`; manual (b) and (c) through a `node_modules/.bin/speclaw` shim to the branch build |
| …: An older speclaw on PATH does nothing | `an older speclaw on PATH rejects the command and touches nothing`; manual (d): the **real** `/usr/local/bin/speclaw` 2.0.6 first on `PATH` with no local binary gave exit 0, 0 B output, 68 ms, repo file listing and `index.db` bytes unchanged even with a pending edit. Run directly, 2.0.6 prints `✗ Unknown command: session-start` and exits 1. |
| …: The npx fallback runs offline | `the npx fallback runs offline and never installs` (stub: argv and `npm_config_offline=true`) ✅; manual (e) with real npx 11.13.0: exit 0, 0 B output, about 230–355 ms, `ENOTCACHED` (`cache mode is 'only-if-cached'`), 0 packages in `_npx`, repo untouched ✅. First test: the requirement's "SHALL NOT … contact a package registry" failed ❌ (see the finding). **Re-test after rework 2: ✅ 0 registry requests** in 3 fresh-cache runs of the shipped command; the stub test now also asserts `npm_config_update_notifier=false` with a hermetic env |
| …: A failing refresh never fails the session | `a failing refresh never fails the session` |
| …: Agents without hook support get no session-start entry | `installHooks writes the SessionStart entry for Claude only and reruns without drift` (non-hook agent gets no entry) |
| Hook generation (4 scenarios, text unchanged) | existing `compileHooks` / `installHooks` tests, all green |
| All other law-enforcement scenarios (carried verbatim from the canonical spec) | not touched by this change; full suite 663/663 green |

## Finding (blocking, first test; resolved by rework 2): the npx branch contacted the registry

The spec (`req~session-start-hook~1`) says the command "SHALL NOT install or
download a package nor contact a package registry". With only the real `npx` on
`PATH`, and `npm_config_registry` and `HTTPS_PROXY` pointed at a local HTTP
trap, each run with a fresh npm cache made exactly one request:

```
GET http://127.0.0.1:19010/npm cmd=exec
```

This is npm's own **update notifier** fetching the `npm` packument.
`npm_config_offline=true` stops the speclaw packument fetch (`ENOTCACHED`) but
not this one. Repeatable results:

| Run | requests |
|-----|----------|
| shipped command, fresh cache #1 | 1 (`GET /npm`) |
| shipped command, fresh cache #2 | 1 (`GET /npm`) |
| shipped command, same cache rerun (notifier stamp now fresh) | 0 |
| experiment: same command with `npm_config_update_notifier=false` added, fresh cache | **0** |

In real use the default registry is `registry.npmjs.org`, so a machine without
a local or `PATH` speclaw contacts the registry from a session-start hook about
once per notifier interval. This is the reviewer's optional R3, and it is
reproduced here as a real spec violation. The hook still exits 0, is silent,
and installs nothing.

Suggested fix (rework, not applied by the tester): prefix
`npm_config_update_notifier=false` **before** `npm_config_offline=true` so the
scenario substring `npm_config_offline=true npx --no-install
@esneiderbravo/speclaw` still matches. Extend the npx stub test to assert
`npm_config_update_notifier=false`. Correct the "Local first, never the
network" text in `docs/compass.md` if the wording changes, and re-run `update`
for the dogfood settings.

## Re-test after rework 2: manual check (e)

Setup, as in the first test: a local Node HTTP trap on `127.0.0.1:19011`
logging every request and `CONNECT` (self-test `GET /selftest` was logged, so
the trap records traffic). `PATH` held only symlinks to the real
`/usr/local/bin/npx` (11.13.0) and `node`. Each run used `env -i` with a fresh
`HOME`, a fresh `npm_config_cache`, `npm_config_registry`,
`HTTP_PROXY`/`HTTPS_PROXY` (both cases) at the trap, and `CLAUDE_PROJECT_DIR`
pointing at a fresh repo holding an empty `.speclaw/index.db`. The command was
the shipped constant, read from `dist/modules/foundation/hooks.js`:

```
… else npm_config_update_notifier=false npm_config_offline=true npx --no-install @esneiderbravo/speclaw session-start; fi; } >/dev/null 2>&1 || true
```

| Run | Command | exit | stdout / stderr | time | requests | `_npx` packages | repo |
|-----|---------|------|-----------------|------|----------|-----------------|------|
| 1, fresh cache | shipped | 0 | 0 B / 0 B | 359 ms | **0** | 0 | unchanged |
| 2, fresh cache | shipped | 0 | 0 B / 0 B | 207 ms | **0** | 0 | unchanged |
| 3, fresh cache | shipped | 0 | 0 B / 0 B | 208 ms | **0** | 0 | unchanged |
| 4, fresh cache (control) | shipped minus `npm_config_update_notifier=false` | 0 | 0 B / 0 B | 222 ms | 1 (`GET /npm cmd=exec`) | 0 | unchanged |

The trap log for the whole session held exactly one line, from the control
run. Run 1's sandbox debug log shows npx was reached and refused offline:
`argv "exec" "--yes" "false" "--" "@esneiderbravo/speclaw" "session-start"`,
`error code ENOTCACHED` (`cache mode is 'only-if-cached'`), `exit 1`, which the
hook swallows. "Repo unchanged" compares a name/size/mtime listing taken before
and after each run. The real `~/.npm` was never used: its
`_update-notifier-last-checked` is still dated Sep 30 2026.

## Re-test after rework 2: regression (a)–(d), abbreviated

Throwaway repo, sandboxed `HOME`, `CLAUDE_PROJECT_DIR` unset unless pinned,
the branch build `dist/cli/index.js`:

- Install: `init --agents claude --yes` gave exactly one `SessionStart` group
  and one entry equal to the constant (`startup|resume|clear|compact`,
  `type: command`, `timeout: 30`). `update` exit 0, still one entry,
  `.claude/settings.json` byte-identical.
- (a) No index: `session-start` exit 0, 0 B stdout and stderr, no
  `index.db`. The hook via `/bin/sh -c` gave exit 0, 0 B, no `index.db`.
- (b) After `index`: `session-start` exit 0, 0 B output, `docs/compass.md`
  checksum and mtime unchanged, `compass-calls.jsonl` unchanged.
- (c) Edited `src/a.ts` (added `betaNew`), ran the hook through `/bin/sh -c`
  with a `node_modules/.bin/speclaw` shim to the branch build: exit 0, 0 B.
  `explore betaNew` then printed `function betaNew  src/a.ts:2-2`.
- (d) The real `/usr/local/bin/speclaw` 2.0.6 first on `PATH`, no local
  binary, a pending new file: hook exit 0, 0 B. The repo listing and the
  `index.db` bytes were unchanged. Run directly, 2.0.6 prints
  `✗ Unknown command: session-start` and exits 1.
- This repo's `.claude/settings.json`, read only: `jq` shows 1 `SessionStart`
  hook in total, and 1 equal to `SESSION_START_COMMAND`. `init` and `update`
  were not run here.

## Pre-existing / unrelated failures

None. All gates are green. The finding above is caused by this change's npx
branch.

## Pending manual steps

- The npx **cache-hit** path (a speclaw already in the user's `~/.npm/_npx`) was
  not run for real: doing so would read and write the user's real npm cache.
  Only the cache-miss path, with a sandboxed `npm_config_cache`, was exercised.
- ~~Re-run manual check (e) after the rework.~~ Done (above): 0 requests.

## Verdict

**PASS** (re-test after rework 2): the shipped npx fallback made 0 registry
requests in 3 fresh-cache runs against a trap, and every other hook check
still passes. History: the first test FAILED because npm's update notifier
made 1 request per run (`req~session-start-hook~1`).
