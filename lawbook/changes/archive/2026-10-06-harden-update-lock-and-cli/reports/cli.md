# CLI checks — harden-update-lock-and-cli (2026-10-06)

Date 2026-10-06 · Branch `feat/coordinator-status-updates` · gates in cwd `/Users/esneiderbravo/Projects/speclaw`; manual runs in the throwaway root `/tmp/speclaw-mv.IlR3ps` (`help/`, `help2/`, `p1/`, `p4/`) with the built CLI `node /Users/esneiderbravo/Projects/speclaw/dist/cli/index.js`, `HOME=/tmp/speclaw-mv.IlR3ps/home` (so the update cache never touched the real `~/.speclaw`), and a `node --import stub.mjs` preload that answers `https://registry.npmjs.org/…/latest` locally (`STUB_LATEST` set → `{version}`; unset → offline `TypeError`; any other URL blocked). Nothing was installed globally, and the real registry was never contacted.

Scope: per-command `--help` (`req~per-command-help~1`), the `update` flags and self-update (`req~update-self-update~1`), `laws lock --force` in the CLI surface (`req~laws-integrity-cli~1`), and the pinned `.mcp.json` launcher entry (`req~mcp-entry-pinned~1`). The lock-drift and lock-refusal semantics are covered in `security.md`.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Lint + format | `npm run check` | ✅ "All matched files use Prettier code style!", ESLint clean, exit 0 |
| Type-check + build | `npm run build` | ✅ `tsc` clean, "copy-assets: copied assets for 3 module(s)", exit 0 |
| Full suite + coverage | `npm test` | ✅ tests 833, pass 833, fail 0, cancelled 0, skipped 0, todo 0 (39.6 s); all files 86.32% line / 82.68% branch / 88.22% funcs (floor 80) |
| CLI-touched tests | `node --test --test-concurrency=1 dist-test/test/e2e/cli.test.js dist-test/test/unit/{help,self-update,update,agents}.test.js` | ✅ tests 135, pass 135, fail 0 (includes the 62 `<cmd> --help/-h prints usage without side effects` rows and the notifier control) |
| Coverage of touched modules | from `npm test` | `cli/lib/help.js` 100/100/100; `cli/lib/self-update.js` 98.15/82.76/100 (uncovered 104-105: the `invalid version` early return, covered via `update.ts` instead); `shared/agents.js` 100/97.78/100; `cli/commands/update.js` 79.57/87.88/75 (331-415 = `applyProjectMigrations` body, exercised by e2e/manual runs in a child process the coverage collector does not see) |
| Change validation | `lawbook_change` action `validate` | ✅ `valid: true`, `issues: []` (EARS style warnings only) |
| Requirement coverage | `lawbook_change` action `coverage`, `change: harden-update-lock-and-cli`, `onlyDefects: true` (after `speclaw index`; see below) | ✅ 111 items, 26 identified, 26 shallow + 26 deep covered, 0 direct / 0 transitive defects. `req~per-command-help~1` utest+impl (7 links), `req~update-self-update~1` utest+impl (18), `req~mcp-entry-pinned~1` utest+impl (6), `req~laws-integrity-cli~1` utest+itest+impl (10) |

Coverage note: the first `coverage --change` run, against the stale Compass index, reported 5 of the 8 new ids as `uncovered impl,utest`. The `Covers:` tags were present (grep confirmed them). `node dist/cli/index.js index` refreshed `.speclaw/index.db` (33 files re-read), and the re-run reported 0 defects. That reindex rewrote the generated map block in `docs/compass.md`; I restored it with `git checkout -- docs/compass.md` (D20). The canonical-only run (`coverage --json`, no change) sees just the 3 amended ids (`lock-refresh-update`, `laws-accept-human`, `laws-integrity-cli`), all deep-covered. The 5 new ids become visible there after sync.

## Tests added / updated

- `test/unit/help.test.ts` (new): the dispatcher switch equals `COMMANDS`; every entry has `Usage:` text; promised flags exist (`update` → `--check/--backup/--minimal/--no-self-update`; `laws` → `lock/--force/accept/scan/verify/compile/import`; `index` → `--force/--prune`; `lawbook` → `draft <name>/--level/--bug/investigate`; search/recall → `--focus/--max-tokens/--explain`); aliases; `wantsHelp`.
- `test/e2e/cli.test.ts`: a table over `COMMANDS` × {`--help`, `-h`} in an empty temp dir checks exit 0, `/Usage/`, a byte-identical directory (recursive listing + hashes), no header, and no notice with `SPECLAW_UPDATE_NOTIFIER=force`, under a 15 s timeout. A control test proves the forced notice does print for `laws scan --json`. **TDD: all 62 rows failed before `help.ts` existed** (verbatim output below).
- `test/unit/self-update.test.ts` (new): `safeForwardArgs`; POSIX fake-`npx` on a temp `PATH` (argv, `SPECLAW_SELF_UPDATED`, exit 0/3, ENOENT → `unavailable`); `isSafeVersion`; an unsafe version is never spawned; Windows `npx.cmd` missing → `unavailable` (`platform: "win32"` option); `onPath`.
- `test/unit/update.test.ts`: a fresh newer version re-executes and skips migration; exit code propagation; opt-outs, loop guard, and `fresh:false`; unavailable npx; non-semver `latest`; unsafe tokens; no latest; the 2.0.8 note, with the 2.0.1 entry unchanged; the `child_process` ban is kept.
- `test/unit/agents.test.ts`: fresh pin; stock unpinned re-pinned and reported; old pin re-pinned; custom entry kept (`report.skipped`); current pin left as is.

## Manual verification (tester-executed, isolated)

| # | What | Command(s) | Observed |
|---|------|-----------|----------|
| M1 | Help, empty dir | `node $CLI <cmd> --help` and `-h` for `init update mcp watch laws lawbook index` (each under `perl -e 'alarm 10; exec @ARGV'`, `SPECLAW_UPDATE_NOTIFIER=force`) | 14/14 exit 0. First stdout line `Usage: speclaw <cmd> …`, stderr 0 bytes, `ls -A` of the dir = 0 entries after every run, `$HOME` still empty (no cache written, so no registry lookup). `mcp`/`watch` returned at once (no alarm). `update --help` lists `--check`, `--backup`, `--minimal`, `--no-self-update`; `laws -h` lists `lock [--force]`, `accept`, `scan` |
| M2 | Help with a cached newer version | `HOME` cache `{"latest":"99.0.0"}`, `SPECLAW_UPDATE_NOTIFIER=force node --import stub.mjs $CLI update --help` | exit 0, stderr 0 bytes, no tagline in stdout, `--no-self-update` mentioned twice, dir empty. Control `laws scan --json` with the same env printed `⬆ speclaw 2.0.7 → 99.0.0 … run speclaw update (or npx @esneiderbravo/speclaw@latest update) — it upgrades itself through npx…` |
| M3 | MCP pin on init | `git init` + `init </dev/null` in `p1/` | `.mcp.json` → `{"type":"stdio","command":"npx","args":["-y","@esneiderbravo/speclaw@2.0.7","mcp"]}`; `package.json` version 2.0.7 |
| M13 | Self-update re-exec | fake `npx` first on `PATH` (records argv to a file, prints env `SPECLAW_SELF_UPDATED`, exits `$FAKE_NPX_EXIT`), `STUB_LATEST=99.0.0`, `update --backup --minimal 'bad;rm -rf /'` | Output: `2.0.7 → 99.0.0`, `! Not forwarding unsafe argument(s): bad;rm -rf /`, `◇ Re-running npx -y @esneiderbravo/speclaw@99.0.0 update`. Child argv `-y @esneiderbravo/speclaw@99.0.0 update --backup --minimal`, child env `SPECLAW_SELF_UPDATED=99.0.0`. Exit 0 for child 0 and **exit 3 for child 3**. No `Applying what's new` in the parent; `git status --short` empty afterwards (no migration ran in the parent) |
| M14 | Opt-outs / fallbacks | same fake `npx` | `--no-self-update` → no spawn, migrated, `Not re-running at 99.0.0: self-update is turned off.` + hint · `SPECLAW_NO_SELF_UPDATE=1` → same · `SPECLAW_SELF_UPDATED=99.0.0` → `already re-executed once`, migrated · `--check` → no spawn, no migration, `Run speclaw update — it upgrades itself to 99.0.0 through npx…` · offline + cached 99.0.0 → `the registry was unreachable (cached version only)`, migrated · `STUB_LATEST="99.0.0 & calc"` → `the registry reported an invalid version "99.0.0 & calc"`, no spawn, migrated · `STUB_LATEST=2.0.7` → `Already on the latest version (2.0.7).`, migrated · `PATH=/nonexistent` → `! Could not start npx (spawn npx ENOENT) — migrating with the installed binary.`, migrated. All exit 0 |
| M15 | `init` never re-executes | fresh repo `p4/`, fake `npx`, `STUB_LATEST=99.0.0`, `init` | exit 0, fake npx **not** spawned; advisory `You're on 2.0.7 — latest is 99.0.0. Recommended: run npx @esneiderbravo/speclaw@latest init instead … Later, speclaw update upgrades itself through npx.` |
| M16 | MCP pin on update | hand-edit `.mcp.json` `speclaw` entry, then `update --no-self-update` | stock unpinned → `@2.0.7`, printed `✓ .mcp.json (speclaw MCP entry pinned to 2.0.7)` · stock `@1.0.0` → `@2.0.7`, same line · custom `{"command":"node","args":["/opt/speclaw/dist/cli/index.js","mcp"]}` → unchanged · stock + `env` → unchanged (custom shape) · already `@2.0.7` → unchanged, no line |
| M4 | `update` with a drifted strict file | `p1/`: append to `CLAUDE.md`, `update --no-self-update` | `! CLAUDE.md drifted from speclaw.lock — kept the locked digest; run speclaw laws accept CLAUDE.md`; `speclaw.lock` sha256 identical (`shasum -c` OK); the 2.0.8 migration note printed (self-update, `--no-self-update`, pin, `laws accept`). Exit 0 |
| M7 | `laws lock --force` without a TTY | `laws lock --force </dev/null` | `✗ speclaw laws lock --force requires an interactive TTY — re-baselining is human-only.`, exit 1, lock sha256 OK |
| M8/M9 | `laws lock --force` on a TTY | real pty via `script -q <typescript> node … laws lock --force`, keys fed with delays | Prompt lists `CLAUDE.md` / `expected sha256:02f11a…` / `actual sha256:5fcaf3…`. `n` → `Re-baseline cancelled — lockfile unchanged.`, exit 1, bytes unchanged. `y` with `--note "tester manual"` → exit 0, `! CLAUDE.md re-baselined by --force (recorded in accepted[])`, `accepted[]` = `{path: "CLAUDE.md", digest: "sha256:5fcaf3…", by: "esneiderbravo", note: "laws lock --force: tester manual"}`, then `verify` exit 0 |

How the TTY confirm was exercised: with a real pseudo-terminal from macOS `script(1)` (`script -q <file> node …`), with `n`/`y` and Enter written to its stdin after 3 s and 1 s delays. The transcript files were read back with ANSI stripped. The injected `lawsConfirm` seam covers the same paths in `unit/lock.test.ts`.

### Not exercised on this platform

- **Windows shell spawn path** (`npx.cmd` through `shell: true`, and `onPath` reporting `npx.cmd not found on PATH` as `unavailable`) is **untested on POSIX**. Only the `platform: "win32"` branch logic runs, in `self-update.test.ts` ("on Windows a missing npx.cmd is unavailable, not a shell exit 1"). The real `cmd.exe` quoting of the forwarded args was not run. `SAFE_TOKEN` and `isSafeVersion` keep `&`, `|`, `%`, `^`, and spaces out of the command line.
- **N8 (by design, D1):** a stale binary running `agent add` or `update --no-self-update` re-pins the stock MCP entry to **its own** version, which can be older. M16 shows this: the 2.0.7 binary rewrote `@1.0.0` to `@2.0.7`, and it would also rewrite a newer pin down to 2.0.7.

## Spec-scenario coverage

Every `#### Scenario` of the `cli` delta (67) and the `project-update` delta (34) is listed below. Both deltas are full copies of the canonical spec. Rows marked "Unchanged carry-over" are canonical scenarios this change did not edit; they are guarded by the full suite and by their existing `Covers:` tags. The `law-enforcement` delta (114) is mapped in `security.md`, and `lawbook-workflow` (128) in `backend.md`.

### `cli` delta

| # | Scenario | Requirement | How verified |
|---|----------|-------------|--------------|
| CLI-1 | `help` shows the branded header | Present a branded header on interactive commands | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-2 | The header appears once, ahead of command output | Present a branded header on interactive commands | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-3 | `--version` stdout stays a bare version string | Never contaminate machine-consumed output | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-4 | Query-command output carries no header | Never contaminate machine-consumed output | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-5 | Piped output omits the header | Never contaminate machine-consumed output | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-6 | `budget --json` emits no header | Never contaminate machine-consumed output | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-7 | `doctor --json` emits no header | Never contaminate machine-consumed output | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-8 | Every command prints usage for --help and -h | `req~per-command-help~1` | e2e `` `<cmd> --help\|-h` prints usage without side effects `` (62 rows = every `COMMANDS` entry × 2, byte-identical dir, 15 s timeout) green; manual M1 (7 commands × 2 flags, exit 0, `Usage:` on stdout, dir still empty). Red before green: `.red-4.txt` below |
| CLI-9 | Init --help writes nothing | `req~per-command-help~1` | e2e rows `init --help` / `init -h` (red before fix: `init --help` ran `init` — header, update advisory, setup — instead of printing usage, see `.red-4.txt`); manual M1: `init --help` exit 0, `Usage: speclaw init [options]`, dir entries 0 |
| CLI-10 | Server commands do not start on --help | `req~per-command-help~1` | e2e rows `mcp`/`watch` × `--help`/`-h` (red before fix: `watch` timed out at 15 s, `.red-4.txt`); manual M1: `mcp`/`watch` exit 0 under a 10 s perl alarm, stderr empty |
| CLI-11 | Help carries no notifier and no header | `req~per-command-help~1` | e2e help table with `SPECLAW_UPDATE_NOTIFIER=force` + control test "the forced notifier prints for a non-help command"; manual M2: cached `latest` 99.0.0, `update --help` stderr 0 bytes, no tagline, `--no-self-update` mentioned; control `laws scan --json` printed the notice |
| CLI-12 | A command without usage text cannot ship | `req~per-command-help~1` | `unit/help.test.ts` "the dispatcher's switch cases equal the help registry's commands" + "every registered command has usage text starting with Usage" |
| CLI-13 | `help` lists verify | Verify command is a first-class CLI entry | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-14 | `verify` emits no header | Verify command is a first-class CLI entry | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-15 | `help` lists budget | Budget command is a first-class CLI entry | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-16 | `budget` prints the surface table | Budget command is a first-class CLI entry | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-17 | `help` lists doctor | Doctor command exposes structured diagnostics | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-18 | `doctor --json` prints only the report | Doctor command exposes structured diagnostics | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-19 | `help` lists telemetry | Telemetry status is a first-class CLI entry | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-20 | `telemetry status` runs without a header when piped | Telemetry status is a first-class CLI entry | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-21 | `help` lists coverage and keeps trace as call-path | Coverage command is a first-class CLI entry | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-22 | `coverage --json` prints only the report | Coverage command is a first-class CLI entry | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-23 | `coverage` does not register as `trace` | Coverage command is a first-class CLI entry | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-24 | Validate prints EARS diagnostics without a new MCP tool | `req~ears-cli-surface~1` | Unchanged carry-over; tagged tests `unit/coverage.test.ts` green in `npm test` (833/833) |
| CLI-25 | Coverage reports missing ptest | `req~ears-cli-surface~1` | Unchanged carry-over; tagged tests `unit/coverage.test.ts` green in `npm test` (833/833) |
| CLI-26 | `help` lists drift | Drift command is a first-class CLI entry | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-27 | `drift --json` prints only the report | Drift command is a first-class CLI entry | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-28 | `help` documents impact | Impact query prints grouped blast radius | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-29 | Impact stdout has no branded header | Impact query prints grouped blast radius | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-30 | Default impact output is summarised | Impact query prints grouped blast radius | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-31 | `help` lists affected-tests | Affected-tests query selects a runnable command | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-32 | Diff mode runs without a branded header | Affected-tests query selects a runnable command | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-33 | Explicit files produce a command | Affected-tests query selects a runnable command | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-34 | `help` lists hotspots and coupling | Hotspots and coupling are first-class CLI entries | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-35 | Hotspots stdout has no branded header | Hotspots and coupling are first-class CLI entries | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-36 | Coupling JSON parses without a header | Hotspots and coupling are first-class CLI entries | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-37 | `help` lists quick | Quick and level are first-class CLI entries | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-38 | Quick JSON has no branded header | Quick and level are first-class CLI entries | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-39 | Help documents draft --bug | Bug draft is a first-class CLI entry | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-40 | Bug draft JSON has no branded header | Bug draft is a first-class CLI entry | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-41 | Help documents feature draft | Feature draft is a first-class CLI and MCP entry | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-42 | Feature draft JSON has no branded header | Feature draft is a first-class CLI and MCP entry | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-43 | Draft is an action, not a new tool | Feature draft is a first-class CLI and MCP entry | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-44 | Warn-mode advance prints a warning on stderr | Cortex advance surfaces the Compass gate | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-45 | Strict-mode rejection exits non-zero | Cortex advance surfaces the Compass gate | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-46 | Help lists investigate | Investigate is a first-class CLI entry | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-47 | Investigate JSON parses without a header | Investigate is a first-class CLI entry | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-48 | Unicode-capable terminal uses unicode glyphs | Render safely across Linux and Windows terminals | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-49 | Legacy console falls back to ASCII | Render safely across Linux and Windows terminals | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-50 | Help documents diff context | Diff context CLI entry | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-51 | MCP tool list excludes scaffold | Scaffold is CLI-only | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-52 | MCP tool list excludes doctor | Doctor and law verify stay CLI-first | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-53 | Help lists force and prune | Index reports cache and skip statistics | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-54 | No-op index reports root unchanged | Index reports cache and skip statistics | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-55 | A no-op index still reports repository totals | Index reports cache and skip statistics | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-56 | Help lists laws compile and import | Laws compile and import are first-class CLI entries | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-57 | Compile JSON has no branded header | Laws compile and import are first-class CLI entries | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-58 | Import requires a from tool | Laws compile and import are first-class CLI entries | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-59 | Help lists hybrid controls | Hybrid find/search CLI controls | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-60 | Explain output includes ranking signals | Hybrid find/search CLI controls | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-61 | Doctor JSON includes FTS availability | Doctor reports FTS and Node readiness for retrieval | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| CLI-62 | Help lists lock accept scan | `req~laws-integrity-cli~1` | Unchanged carry-over; tagged tests `unit/accept.test.ts`, `unit/lock.test.ts`, `integration/integrity.test.ts` green in `npm test` (833/833) |
| CLI-63 | Laws help documents lock --force | `req~laws-integrity-cli~1` | `unit/help.test.ts` "update, laws, index, and lawbook usage carry their promised flags"; manual M1 `laws -h` shows `lock [--force]` |
| CLI-64 | Verify includes integrity without a new MCP tool | `req~laws-integrity-cli~1` | Unchanged carry-over; tagged tests `unit/accept.test.ts`, `unit/lock.test.ts`, `integration/integrity.test.ts` green in `npm test` (833/833) |
| CLI-65 | Help lists owners | `req~owners-cli~1` | Unchanged carry-over; tagged tests `integration/owners.test.ts`, `unit/owners-cli.test.ts` green in `npm test` (833/833) |
| CLI-66 | Write updates CODEOWNERS without a new MCP tool | `req~owners-cli~1` | Unchanged carry-over; tagged tests `integration/owners.test.ts`, `unit/owners-cli.test.ts` green in `npm test` (833/833) |
| CLI-67 | Check mode reports drift without writing | `req~owners-cli~1` | Unchanged carry-over; tagged tests `integration/owners.test.ts`, `unit/owners-cli.test.ts` green in `npm test` (833/833) |

### `project-update` delta

| # | Scenario | Requirement | How verified |
|---|----------|-------------|--------------|
| PRO-1 | An outdated managed file is refreshed | Update refreshes managed files automatically | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| PRO-2 | An up-to-date managed file needs no change | Update refreshes managed files automatically | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| PRO-3 | A diverged managed file is refreshed and reported (default) | A locally edited managed file is refreshed and reported; backup is opt-in | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| PRO-4 | A diverged managed file is backed up on request | A locally edited managed file is refreshed and reported; backup is opt-in | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| PRO-5 | Backups are gitignored | A locally edited managed file is refreshed and reported; backup is opt-in | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| PRO-6 | Personalized changes are delivered as an agent prompt | Update does not auto-edit personalized files | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| PRO-7 | No personalized changes means no prompt | Update does not auto-edit personalized files | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| PRO-8 | A project on the previously shipped version still gets the prompt | Update does not auto-edit personalized files | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| PRO-9 | A project several releases behind loses no migration | Update applies every migration crossed since the project's version | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| PRO-10 | A newer registry version re-executes update and skips local migration | `req~update-self-update~1` | `unit/update.test.ts` "a fresh newer version re-executes update…"; `unit/self-update.test.ts` fake-`npx` POSIX tests; manual M13: argv `-y @esneiderbravo/speclaw@99.0.0 update --backup --minimal`, `SPECLAW_SELF_UPDATED=99.0.0`, no `Applying what's new`, git status clean |
| PRO-11 | A failing child propagates its exit code | `req~update-self-update~1` | `unit/update.test.ts` "a failing child propagates its exit code…", `unit/self-update.test.ts` "selfUpdate returns the child's non-zero exit code"; manual M13: fake npx exit 3 → parent exit 3, no migration |
| PRO-12 | Opt-outs and the loop guard migrate in process | `req~update-self-update~1` | `unit/update.test.ts` "opt-outs and the loop guard migrate in process without spawning"; manual M14: `--no-self-update`, `SPECLAW_NO_SELF_UPDATE=1`, `SPECLAW_SELF_UPDATED=99.0.0` → npx not spawned, migrated, hint printed |
| PRO-13 | An offline cached latest does not re-execute | `req~update-self-update~1` | `unit/update.test.ts` (opt-outs table includes `fresh:false`); manual M14: stub offline + cached 99.0.0 → `the registry was unreachable (cached version only)`, no spawn, migrated |
| PRO-14 | A missing npx falls back to in-process migration | `req~update-self-update~1` | `unit/update.test.ts` "an unavailable npx falls back…", `unit/self-update.test.ts` "selfUpdate reports unavailable when npx cannot be spawned"; manual M14: `PATH=/nonexistent` → `Could not start npx (spawn npx ENOENT) — migrating with the installed binary.` |
| PRO-15 | Check mode never re-executes | `req~update-self-update~1` | `unit/update.test.ts` "runUpdate --check reports only and skips migrate"; manual M14 `--check`: no spawn, no migration |
| PRO-16 | Unsafe argument tokens are dropped | `req~update-self-update~1` | `unit/self-update.test.ts` "safeForwardArgs keeps safe flags and drops everything else", `unit/update.test.ts` "unsafe argument tokens are dropped before forwarding"; manual M13: `'bad;rm -rf /'` → `! Not forwarding unsafe argument(s): bad;rm -rf /`, absent from child argv |
| PRO-17 | The update module never imports child_process | `req~update-self-update~1` | `unit/update.test.ts` "update.ts never spawns npm install -g" (bans `child_process` in `update.ts`) |
| PRO-18 | Crossing the self-update release surfaces a note | `req~update-self-update~1` | `unit/update.test.ts` "the 2.0.9 migration note mentions self-update; the 2.0.1 entry is unchanged" (renamed from 2.0.8 in rework 3); manual M4 printed the note (self-update, `--no-self-update`, pin, `laws accept`); rework 3 re-test RT3-3: manifest 2.0.8 → note shown, manifest 2.0.9 → not shown |
| PRO-19 | A fresh config is pinned | `req~mcp-entry-pinned~1` | `unit/agents.test.ts` "a fresh MCP config is pinned to the running version"; manual M3: `.mcp.json` args `["-y","@esneiderbravo/speclaw@2.0.7","mcp"]` (pkg 2.0.7) |
| PRO-20 | A stock unpinned entry is re-pinned on update | `req~mcp-entry-pinned~1` | `unit/agents.test.ts` "a stock unpinned entry is re-pinned and the rewrite is reported"; manual M16: re-pinned to 2.0.7, printed `✓ .mcp.json (speclaw MCP entry pinned to 2.0.7)` |
| PRO-21 | An entry pinned to an older version is re-pinned | `req~mcp-entry-pinned~1` | `unit/agents.test.ts` "an entry pinned to an older version is re-pinned"; manual M16: `@1.0.0` → `@2.0.7` |
| PRO-22 | A custom entry is kept | `req~mcp-entry-pinned~1` | `unit/agents.test.ts` "a custom speclaw entry is kept and reported" (asserts `report.skipped` holds `(custom speclaw entry kept)`); manual M16: `node /opt/…` and stock+`env` entries unchanged. Observation O2: the CLI does not print that `skipped` line (update prints only a count when files changed) |
| PRO-23 | Init handoff does not hardcode a single agent | Agent handoff language is agent-generic | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| PRO-24 | A project without the workflow receives it on update | Update installs the verify workflow when missing | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| PRO-25 | A project that already has the workflow keeps it | Update installs the verify workflow when missing | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| PRO-26 | Crossing the adaptive-ceremony release surfaces a prompt | Update notes adaptive ceremony | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| PRO-27 | Crossing the bugfix-specs release surfaces a prompt | Update notes bugfix specs | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| PRO-28 | Crossing the tool-surface release surfaces a prompt | Update notes consolidated MCP tool surface | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| PRO-29 | Managed assets use canonical tool names after update | Update notes consolidated MCP tool surface | Unchanged carry-over; guarded by the full `npm test` run (833/833 green); no `Covers:` tag on this requirement |
| PRO-30 | Init creates a lockfile | `req~lock-refresh-update~1` | Unchanged carry-over; tagged tests `unit/lock.test.ts`, `integration/integrity.test.ts` green in `npm test` (833/833) |
| PRO-31 | Update notes the integrity release | `req~lock-refresh-update~1` | Unchanged carry-over; tagged tests `unit/lock.test.ts`, `integration/integrity.test.ts` green in `npm test` (833/833) |
| PRO-32 | Update does not re-baseline a drifted strict file | `req~lock-refresh-update~1` | `integration/integrity.test.ts` "an update-path scaffold refresh keeps a drifted CLAUDE.md digest" (red: `.red-2.txt`); manual M4: `update --no-self-update` → `CLAUDE.md drifted from speclaw.lock — kept the locked digest; run speclaw laws accept CLAUDE.md`, lock sha256 OK |
| PRO-33 | Update refreshes an existing owners block | `req~owners-refresh-update~1` | Unchanged carry-over; tagged tests `unit/owners.test.ts` green in `npm test` (833/833) |
| PRO-34 | Update notes the owners release | `req~owners-refresh-update~1` | Unchanged carry-over; tagged tests `unit/owners.test.ts` green in `npm test` (833/833) |

## Regression — red before green (help defect, item 4)

Captured by the implementer before `src/cli/lib/help.ts` existed: 62 of 62 rows failed. For example, `init --help` ran `init` (header, update advisory, setup), and `watch --help` hit the 15 s timeout. Folded verbatim from `reports/.red-4.txt`. After the fix, the same 62 rows pass inside `npm test` (833/833).

````text
# Red before green — proposal item 4 (per-command --help), captured 2026-10-07T00:44:28Z on feat/coordinator-status-updates before src/cli/lib/help.ts existed
$ node --test --test-name-pattern="prints usage without side effects" dist-test/test/e2e/cli.test.js
✖ `help --help` prints usage without side effects (37.471167ms)
✖ `help -h` prints usage without side effects (34.205375ms)
✖ `version --help` prints usage without side effects (42.247791ms)
✖ `version -h` prints usage without side effects (36.812625ms)
✖ `mcp --help` prints usage without side effects (149.246541ms)
✖ `mcp -h` prints usage without side effects (125.786167ms)
✖ `init --help` prints usage without side effects (138.71725ms)
✖ `init -h` prints usage without side effects (136.17975ms)
✖ `update --help` prints usage without side effects (525.953417ms)
✖ `update -h` prints usage without side effects (463.710084ms)
✖ `agent --help` prints usage without side effects (39.377708ms)
✖ `agent -h` prints usage without side effects (39.9195ms)
✖ `index --help` prints usage without side effects (46.113375ms)
✖ `index -h` prints usage without side effects (43.383791ms)
✖ `watch --help` prints usage without side effects (15009.411791ms)
✖ `watch -h` prints usage without side effects (15008.957833ms)
✖ `session-start --help` prints usage without side effects (47.531375ms)
✖ `session-start -h` prints usage without side effects (38.225042ms)
✖ `explore --help` prints usage without side effects (42.01275ms)
✖ `explore -h` prints usage without side effects (44.556542ms)
✖ `search --help` prints usage without side effects (44.111875ms)
✖ `search -h` prints usage without side effects (41.937917ms)
✖ `recall --help` prints usage without side effects (42.976709ms)
✖ `recall -h` prints usage without side effects (42.895834ms)
✖ `impact --help` prints usage without side effects (41.499208ms)
✖ `impact -h` prints usage without side effects (47.450417ms)
✖ `trace --help` prints usage without side effects (41.8605ms)
✖ `trace -h` prints usage without side effects (43.534542ms)
✖ `affected-tests --help` prints usage without side effects (40.972958ms)
✖ `affected-tests -h` prints usage without side effects (39.843ms)
✖ `diff-context --help` prints usage without side effects (41.990792ms)
✖ `diff-context -h` prints usage without side effects (41.289583ms)
✖ `hotspots --help` prints usage without side effects (79.862375ms)
✖ `hotspots -h` prints usage without side effects (79.880084ms)
✖ `coupling --help` prints usage without side effects (40.204834ms)
✖ `coupling -h` prints usage without side effects (40.117375ms)
✖ `visualize --help` prints usage without side effects (38.040208ms)
✖ `visualize -h` prints usage without side effects (38.683042ms)
✖ `quick --help` prints usage without side effects (40.502416ms)
✖ `quick -h` prints usage without side effects (38.849625ms)
✖ `cortex --help` prints usage without side effects (36.328667ms)
✖ `cortex -h` prints usage without side effects (37.758583ms)
✖ `lawbook --help` prints usage without side effects (48.688458ms)
✖ `lawbook -h` prints usage without side effects (44.333292ms)
✖ `doctor --help` prints usage without side effects (400.638334ms)
✖ `doctor -h` prints usage without side effects (425.341375ms)
✖ `budget --help` prints usage without side effects (68.025583ms)
✖ `budget -h` prints usage without side effects (66.757834ms)
✖ `coverage --help` prints usage without side effects (41.269917ms)
✖ `coverage -h` prints usage without side effects (40.83425ms)
✖ `drift --help` prints usage without side effects (41.27075ms)
✖ `drift -h` prints usage without side effects (40.255ms)
✖ `telemetry --help` prints usage without side effects (35.729167ms)
✖ `telemetry -h` prints usage without side effects (34.81225ms)
✖ `owners --help` prints usage without side effects (35.530667ms)
✖ `owners -h` prints usage without side effects (35.129542ms)
✖ `check --help` prints usage without side effects (41.496875ms)
✖ `check -h` prints usage without side effects (40.936417ms)
✖ `laws --help` prints usage without side effects (51.902416ms)
✖ `laws -h` prints usage without side effects (52.89725ms)
✖ `verify --help` prints usage without side effects (50.085625ms)
✖ `verify -h` prints usage without side effects (48.323917ms)
ℹ tests 62
ℹ suites 0
ℹ pass 0
ℹ fail 62
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 34765.117583

✖ failing tests:

test at dist-test/test/e2e/cli.test.js:337:9
✖ `help --help` prints usage without side effects (37.471167ms)
  AssertionError [ERR_ASSERTION]: no branded header
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:358:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.start (node:internal/test_runner/test:1177:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:385:17) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\nspeclaw — spec-driven, agent-ready projects (Foundation + Compass + Lawbook + Cortex)\n\nUsage: speclaw <command> [options]\n\nInstall globally so the command is always available:\n  npm i -g @esneiderbravo/speclaw\n\nSetup\n  init                     Interactive setup: pick agents, scaffold, index, get the prompt\n                           (--minimal omits setup/lifecycle MCP tools)\n  update                   Apply project migrations (advisory if a newer binary exists)\n                           (--check reports version only; --minimal persists minimal exposure)\n  agent list               Show which agents are configured\n  agent add <id>           Configure another agent later (symlinks + MCP)\n\nCompass (code intelligence — the same surface agents use via MCP)\n  index                    (Re)build the local code graph (--force / --prune / --json)\n  session-start            Silent, fail-safe refresh of an existing index (SessionStart hook)\n  watch                    Keep the index fresh on file changes\n  explore <node>           A node\'s source + callers/callees\n  search <query>           Hybrid find (BM25+vector+name); --focus --max-tokens --explain\n  recall "<query>"         Hybrid find with concept weights; same flags as search\n  impact <node>            Blast radius (grouped by module; --flat / --json)\n  affected-tests           Tests affected by a change (--file / --from-diff / --json)\n  diff-context             Change context for a diff (--file / --rev / --worktree / --json)\n  hotspots                 Rank files by recent churn × AST complexity (--json / --sort)\n  coupling <file>          Temporal co-change partners for a file (--json)\n  trace <from> <to>        A call path between two nodes\n  visualize [node]         Interactive HTML graph → .speclaw/graph.html\n\nCortex (One brain. Many agents. — multi-agent loop)\n  cortex <op>              status|start|advance|rework|brief — drive harness.json (--change)\n\nLawbook (spec-driven workflow)\n  quick <name>             Scaffold a level-0 change (record.md + reports)\n  lawbook init             Create the lawbook/ workspace\n  lawbook list             Active/archived changes and capabilities\n  lawbook level <mode>     Propose/set/promote/explain ceremony level (--json)\n  lawbook draft <name>     Scaffold a feature change (--level N, --capability C, --json)\n  lawbook draft --bug <c>  Scaffold a bug change (bugfix.md + reports)\n  lawbook investigate      Rank bug suspects from graph (--symptom / --stack-trace, --json)\n  lawbook validate <c>     Validate a change\'s artifacts\n  lawbook sync <c>         Promote delta specs to canonical\n  lawbook archive <c>      Finalize and archive a change\n  lawbook harness <op>     Deprecated alias for `speclaw cortex` (compat)\n\nOther\n  doctor                   Verify the installation (--json, --offline, --strict)\n  budget                   Measure always-on context cost (tools, skills, instructions)\n  coverage                 Requirement → impl → test coverage (--json, --tap, --adopt, --write)\n  drift                    Spec↔code drift (--json, --reseal, --reverse, --fail-on)\n  owners                   Compile team.owners → .github/CODEOWNERS (--write / --check / --diff)\n  telemetry status         Confirm speclaw ships no telemetry\n  check                    Evaluate an action against the laws (hooks call this; --dry-run to preview)\n  laws verify              Verify the deterministic dependency/graph laws against the index\n  laws compile             Compile laws into agent rule dialects (AGENTS / Claude / Cursor / …)\n  laws import              Import third-party rules as draft laws (--from rulesync)\n  laws lock                Create/refresh committed speclaw.lock digests for rule files\n  laws accept <path>       Interactively accept a changed rule-file digest (TTY only)\n  laws scan                Scan rule/skill files for prompt-injection patterns\n  verify                   Verify laws + integrity for CI: exit codes, --sarif, --json, --strict-engines\n  mcp                      Start the MCP server (used by your agent\'s config)\n  help                     Show this help\n  --version                Print the installed speclaw version\n\n',
    expected: /where specs become law/,
    operator: 'doesNotMatch',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `help -h` prints usage without side effects (34.205375ms)
  AssertionError [ERR_ASSERTION]: no branded header
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:358:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\nspeclaw — spec-driven, agent-ready projects (Foundation + Compass + Lawbook + Cortex)\n\nUsage: speclaw <command> [options]\n\nInstall globally so the command is always available:\n  npm i -g @esneiderbravo/speclaw\n\nSetup\n  init                     Interactive setup: pick agents, scaffold, index, get the prompt\n                           (--minimal omits setup/lifecycle MCP tools)\n  update                   Apply project migrations (advisory if a newer binary exists)\n                           (--check reports version only; --minimal persists minimal exposure)\n  agent list               Show which agents are configured\n  agent add <id>           Configure another agent later (symlinks + MCP)\n\nCompass (code intelligence — the same surface agents use via MCP)\n  index                    (Re)build the local code graph (--force / --prune / --json)\n  session-start            Silent, fail-safe refresh of an existing index (SessionStart hook)\n  watch                    Keep the index fresh on file changes\n  explore <node>           A node\'s source + callers/callees\n  search <query>           Hybrid find (BM25+vector+name); --focus --max-tokens --explain\n  recall "<query>"         Hybrid find with concept weights; same flags as search\n  impact <node>            Blast radius (grouped by module; --flat / --json)\n  affected-tests           Tests affected by a change (--file / --from-diff / --json)\n  diff-context             Change context for a diff (--file / --rev / --worktree / --json)\n  hotspots                 Rank files by recent churn × AST complexity (--json / --sort)\n  coupling <file>          Temporal co-change partners for a file (--json)\n  trace <from> <to>        A call path between two nodes\n  visualize [node]         Interactive HTML graph → .speclaw/graph.html\n\nCortex (One brain. Many agents. — multi-agent loop)\n  cortex <op>              status|start|advance|rework|brief — drive harness.json (--change)\n\nLawbook (spec-driven workflow)\n  quick <name>             Scaffold a level-0 change (record.md + reports)\n  lawbook init             Create the lawbook/ workspace\n  lawbook list             Active/archived changes and capabilities\n  lawbook level <mode>     Propose/set/promote/explain ceremony level (--json)\n  lawbook draft <name>     Scaffold a feature change (--level N, --capability C, --json)\n  lawbook draft --bug <c>  Scaffold a bug change (bugfix.md + reports)\n  lawbook investigate      Rank bug suspects from graph (--symptom / --stack-trace, --json)\n  lawbook validate <c>     Validate a change\'s artifacts\n  lawbook sync <c>         Promote delta specs to canonical\n  lawbook archive <c>      Finalize and archive a change\n  lawbook harness <op>     Deprecated alias for `speclaw cortex` (compat)\n\nOther\n  doctor                   Verify the installation (--json, --offline, --strict)\n  budget                   Measure always-on context cost (tools, skills, instructions)\n  coverage                 Requirement → impl → test coverage (--json, --tap, --adopt, --write)\n  drift                    Spec↔code drift (--json, --reseal, --reverse, --fail-on)\n  owners                   Compile team.owners → .github/CODEOWNERS (--write / --check / --diff)\n  telemetry status         Confirm speclaw ships no telemetry\n  check                    Evaluate an action against the laws (hooks call this; --dry-run to preview)\n  laws verify              Verify the deterministic dependency/graph laws against the index\n  laws compile             Compile laws into agent rule dialects (AGENTS / Claude / Cursor / …)\n  laws import              Import third-party rules as draft laws (--from rulesync)\n  laws lock                Create/refresh committed speclaw.lock digests for rule files\n  laws accept <path>       Interactively accept a changed rule-file digest (TTY only)\n  laws scan                Scan rule/skill files for prompt-injection patterns\n  verify                   Verify laws + integrity for CI: exit codes, --sarif, --json, --strict-engines\n  mcp                      Start the MCP server (used by your agent\'s config)\n  help                     Show this help\n  --version                Print the installed speclaw version\n\n',
    expected: /where specs become law/,
    operator: 'doesNotMatch',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `version --help` prints usage without side effects (42.247791ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '2.0.7\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '2.0.7\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `version -h` prints usage without side effects (36.812625ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '2.0.7\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '2.0.7\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `mcp --help` prints usage without side effects (149.246541ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  ''
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `mcp -h` prints usage without side effects (125.786167ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  ''
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `init --help` prints usage without side effects (138.71725ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '\n' +
    '  \x1B[38;2;153;158;163m╭────────╮\x1B[0m\n' +
    '  \x1B[38;2;153;158;163m│ \x1B[0m\x1B[38;2;153;158;163m──────\x1B[0m\x1B[38;2;153;158;163m │\x1B[0m   \x1B[1m\x1B[38;2;244;244;243ms p e c l a w\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;153;158;163m│ \x1B[0m\x1B[38;2;153;158;163m────  \x1B[0m\x1B[38;2;153;158;163m │\x1B[0m   \x1B[38;2;153;158;163mwhere specs become law\x1B[0m\n' +
    '  \x1B[38;2;153;158;163m│ \x1B[0m\x1B[38;2;153;158;163m─────\x1B[0m \x1B[38;2;153;158;163m │\x1B[0m\n' +
    '  \x1B[38;2;153;158;163m│ \x1B[0m\x1B[38;2;0;227;253m▇▇▇▇▇▇\x1B[0m\x1B[38;2;153;158;163m │\x1B[0m\n' +
    '  \x1B[38;2;153;158;163m╰────────╯\x1B[0m\n' +
    '\n' +
    "  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243mYou're on \x1B[38;2;153;158;163m2.0.7\x1B[0m — latest is \x1B[1m\x1B[38;2;0;227;253m999.0.0\x1B[0m\x1B[0m.\x1B[0m\n" +
    '  \x1B[38;2;153;158;163mRecommended: refresh the binary with \x1B[38;2;0;227;253mnpx @esneiderbravo/speclaw@latest init\x1B[0m (or \x1B[38;2;0;227;253mnpm i -g @esneiderbravo/speclaw@latest\x1B[0m), then run \x1B[38;2;0;227;253mspeclaw init\x1B[0m again.\x1B[0m\n' +
    '\n' +
    '\n' +
    '\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mSetting up \x1B[1m\x1B[38;2;0;227;253mspeclaw-help-rHnRoD\x1B[0m\x1B[0m\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mFoundation \x1B[38;2;153;158;163m— LAWS.md + 8 standards + CLAUDE.md/AGENTS.md\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mLawbook workflow \x1B[38;2;153;158;163m— cortex · explore · draft · build · sync · archive\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mRole agents \x1B[38;2;153;158;163m— explorer · planner · implementer · reviewer · tester · archiver\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mLawbook workspace \x1B[38;2;153;158;163m— lawbook/\x1B[0m\x1B[0m\n' +
    '\n' +
    '\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mConfiguring agents\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mClaude Code \x1B[38;2;153;158;163m— symlinks + MCP\x1B[0m\x1B[0m\n' +
    '\n' +
    '\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mIndexing your code with Compass\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m\x1B[1m\x1B[38;2;244;244;243m0\x1B[0m\x1B[0m\x1B[38;2;153;158;163m files · \x1B[0m\x1B[1m\x1B[38;2;244;244;243m0\x1B[0m\x1B[0m\x1B[38;2;153;158;163m nodes · \x1B[0m\x1B[1m\x1B[38;2;244;244;243m0\x1B[0m\x1B[0m\x1B[38;2;153;158;163m edges · \x1B[0m\x1B[1m\x1B[38;2;244;244;243m0\x1B[0m\x1B[0m\x1B[38;2;153;158;163m embeddings\x1B[0m\x1B[0m\n' +
    '\n' +
    "\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mYou're set — one last step\x1B[0m\x1B[0m\n" +
    '\n' +
    "  \x1B[38;2;153;158;163mCopy this and paste it into \x1B[38;2;0;227;253mthe agent you're using\x1B[0m:\x1B[0m\n" +
    '\n' +
    "\x1B[38;2;244;244;243mComplete speclaw's foundation: analyze this repo and fill LAWS.md and docs/standards/* with its real architecture, quality gates and conventions. Infer the working language and conventions from the repo itself — docstrings, commit messages, branch names, PR and ticket language — don't assume. Start with init_project.\x1B[0m\n" +
    '\n' +
    '  \x1B[38;2;153;158;163mNon-trivial work runs through Cortex — use \x1B[38;2;0;227;253m/lawbook/cortex\x1B[0m (or the cortex skill).\x1B[0m\n' +
    '\n' +
    '  \x1B[38;2;153;158;163mAdd an agent:   \x1B[38;2;0;227;253mspeclaw agent add cursor\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;153;158;163mRefresh index:  \x1B[38;2;0;227;253mspeclaw index\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;153;158;163mHealth check:   \x1B[38;2;0;227;253mspeclaw doctor\x1B[0m\x1B[0m\n' +
    '\n' +
    '  \x1B[38;2;153;158;163m\x1B[38;2;153;158;163mai-specs/ is local (gitignored) — teammates run\x1B[0m \x1B[38;2;0;227;253mspeclaw init\x1B[0m \x1B[38;2;153;158;163mafter cloning to regenerate it.\x1B[0m\x1B[0m\n' +
    '\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: "\n  \x1B[38;2;153;158;163m╭────────╮\x1B[0m\n  \x1B[38;2;153;158;163m│ \x1B[0m\x1B[38;2;153;158;163m──────\x1B[0m\x1B[38;2;153;158;163m │\x1B[0m   \x1B[1m\x1B[38;2;244;244;243ms p e c l a w\x1B[0m\x1B[0m\n  \x1B[38;2;153;158;163m│ \x1B[0m\x1B[38;2;153;158;163m────  \x1B[0m\x1B[38;2;153;158;163m │\x1B[0m   \x1B[38;2;153;158;163mwhere specs become law\x1B[0m\n  \x1B[38;2;153;158;163m│ \x1B[0m\x1B[38;2;153;158;163m─────\x1B[0m \x1B[38;2;153;158;163m │\x1B[0m\n  \x1B[38;2;153;158;163m│ \x1B[0m\x1B[38;2;0;227;253m▇▇▇▇▇▇\x1B[0m\x1B[38;2;153;158;163m │\x1B[0m\n  \x1B[38;2;153;158;163m╰────────╯\x1B[0m\n\n  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243mYou're on \x1B[38;2;153;158;163m2.0.7\x1B[0m — latest is \x1B[1m\x1B[38;2;0;227;253m999.0.0\x1B[0m\x1B[0m.\x1B[0m\n  \x1B[38;2;153;158;163mRecommended: refresh the binary with \x1B[38;2;0;227;253mnpx @esneiderbravo/speclaw@latest init\x1B[0m (or \x1B[38;2;0;227;253mnpm i -g @esneiderbravo/speclaw@latest\x1B[0m), then run \x1B[38;2;0;227;253mspeclaw init\x1B[0m again.\x1B[0m\n\n\n\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mSetting up \x1B[1m\x1B[38;2;0;227;253mspeclaw-help-rHnRoD\x1B[0m\x1B[0m\x1B[0m\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mFoundation \x1B[38;2;153;158;163m— LAWS.md + 8 standards + CLAUDE.md/AGENTS.md\x1B[0m\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mLawbook workflow \x1B[38;2;153;158;163m— cortex · explore · draft · build · sync · archive\x1B[0m\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mRole agents \x1B[38;2;153;158;163m— explorer · planner · implementer · reviewer · tester · archiver\x1B[0m\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mLawbook workspace \x1B[38;2;153;158;163m— lawbook/\x1B[0m\x1B[0m\n\n\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mConfiguring agents\x1B[0m\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mClaude Code \x1B[38;2;153;158;163m— symlinks + MCP\x1B[0m\x1B[0m\n\n\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mIndexing your code with Compass\x1B[0m\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m\x1B[1m\x1B[38;2;244;244;243m0\x1B[0m\x1B[0m\x1B[38;2;153;158;163m files · \x1B[0m\x1B[1m\x1B[38;2;244;244;243m0\x1B[0m\x1B[0m\x1B[38;2;153;158;163m nodes · \x1B[0m\x1B[1m\x1B[38;2;244;244;243m0\x1B[0m\x1B[0m\x1B[38;2;153;158;163m edges · \x1B[0m\x1B[1m\x1B[38;2;244;244;243m0\x1B[0m\x1B[0m\x1B[38;2;153;158;163m embeddings\x1B[0m\x1B[0m\n\n\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mYou're set — one last step\x1B[0m\x1B[0m\n\n  \x1B[38;2;153;158;163mCopy this and paste it into \x1B[38;2;0;227;253mthe agent you're using\x1B[0m:\x1B[0m\n\n\x1B[38;2;244;244;243mComplete speclaw's foundation: analyze this repo and fill LAWS.md and docs/standards/* with its real architecture, quality gates and conventions. Infer the working language and conventions from the repo itself — docstrings, commit messages, branch names, PR and ticket language — don't assume. Start with init_project.\x1B[0m\n\n  \x1B[38;2;153;158;163mNon-trivial work runs through Cortex — use \x1B[38;2;0;227;253m/lawbook/cortex\x1B[0m (or the cortex skill).\x1B[0m\n\n  \x1B[38;2;153;158;163mAdd an agent:   \x1B[38;2;0;227;253mspeclaw agent add cursor\x1B[0m\x1B[0m\n  \x1B[38;2;153;158;163mRefresh index:  \x1B[38;2;0;227;253mspeclaw index\x1B[0m\x1B[0m\n  \x1B[38;2;153;158;163mHealth check:   \x1B[38;2;0;227;253mspeclaw doctor\x1B[0m\x1B[0m\n\n  \x1B[38;2;153;158;163m\x1B[38;2;153;158;163mai-specs/ is local (gitignored) — teammates run\x1B[0m \x1B[38;2;0;227;253mspeclaw init\x1B[0m \x1B[38;2;153;158;163mafter cloning to regenerate it.\x1B[0m\x1B[0m\n\n",
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `init -h` prints usage without side effects (136.17975ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '\n' +
    '  \x1B[38;2;153;158;163m╭────────╮\x1B[0m\n' +
    '  \x1B[38;2;153;158;163m│ \x1B[0m\x1B[38;2;153;158;163m──────\x1B[0m\x1B[38;2;153;158;163m │\x1B[0m   \x1B[1m\x1B[38;2;244;244;243ms p e c l a w\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;153;158;163m│ \x1B[0m\x1B[38;2;153;158;163m────  \x1B[0m\x1B[38;2;153;158;163m │\x1B[0m   \x1B[38;2;153;158;163mwhere specs become law\x1B[0m\n' +
    '  \x1B[38;2;153;158;163m│ \x1B[0m\x1B[38;2;153;158;163m─────\x1B[0m \x1B[38;2;153;158;163m │\x1B[0m\n' +
    '  \x1B[38;2;153;158;163m│ \x1B[0m\x1B[38;2;0;227;253m▇▇▇▇▇▇\x1B[0m\x1B[38;2;153;158;163m │\x1B[0m\n' +
    '  \x1B[38;2;153;158;163m╰────────╯\x1B[0m\n' +
    '\n' +
    "  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243mYou're on \x1B[38;2;153;158;163m2.0.7\x1B[0m — latest is \x1B[1m\x1B[38;2;0;227;253m999.0.0\x1B[0m\x1B[0m.\x1B[0m\n" +
    '  \x1B[38;2;153;158;163mRecommended: refresh the binary with \x1B[38;2;0;227;253mnpx @esneiderbravo/speclaw@latest init\x1B[0m (or \x1B[38;2;0;227;253mnpm i -g @esneiderbravo/speclaw@latest\x1B[0m), then run \x1B[38;2;0;227;253mspeclaw init\x1B[0m again.\x1B[0m\n' +
    '\n' +
    '\n' +
    '\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mSetting up \x1B[1m\x1B[38;2;0;227;253mspeclaw-help-cyTNAz\x1B[0m\x1B[0m\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mFoundation \x1B[38;2;153;158;163m— LAWS.md + 8 standards + CLAUDE.md/AGENTS.md\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mLawbook workflow \x1B[38;2;153;158;163m— cortex · explore · draft · build · sync · archive\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mRole agents \x1B[38;2;153;158;163m— explorer · planner · implementer · reviewer · tester · archiver\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mLawbook workspace \x1B[38;2;153;158;163m— lawbook/\x1B[0m\x1B[0m\n' +
    '\n' +
    '\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mConfiguring agents\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mClaude Code \x1B[38;2;153;158;163m— symlinks + MCP\x1B[0m\x1B[0m\n' +
    '\n' +
    '\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mIndexing your code with Compass\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m\x1B[1m\x1B[38;2;244;244;243m0\x1B[0m\x1B[0m\x1B[38;2;153;158;163m files · \x1B[0m\x1B[1m\x1B[38;2;244;244;243m0\x1B[0m\x1B[0m\x1B[38;2;153;158;163m nodes · \x1B[0m\x1B[1m\x1B[38;2;244;244;243m0\x1B[0m\x1B[0m\x1B[38;2;153;158;163m edges · \x1B[0m\x1B[1m\x1B[38;2;244;244;243m0\x1B[0m\x1B[0m\x1B[38;2;153;158;163m embeddings\x1B[0m\x1B[0m\n' +
    '\n' +
    "\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mYou're set — one last step\x1B[0m\x1B[0m\n" +
    '\n' +
    "  \x1B[38;2;153;158;163mCopy this and paste it into \x1B[38;2;0;227;253mthe agent you're using\x1B[0m:\x1B[0m\n" +
    '\n' +
    "\x1B[38;2;244;244;243mComplete speclaw's foundation: analyze this repo and fill LAWS.md and docs/standards/* with its real architecture, quality gates and conventions. Infer the working language and conventions from the repo itself — docstrings, commit messages, branch names, PR and ticket language — don't assume. Start with init_project.\x1B[0m\n" +
    '\n' +
    '  \x1B[38;2;153;158;163mNon-trivial work runs through Cortex — use \x1B[38;2;0;227;253m/lawbook/cortex\x1B[0m (or the cortex skill).\x1B[0m\n' +
    '\n' +
    '  \x1B[38;2;153;158;163mAdd an agent:   \x1B[38;2;0;227;253mspeclaw agent add cursor\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;153;158;163mRefresh index:  \x1B[38;2;0;227;253mspeclaw index\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;153;158;163mHealth check:   \x1B[38;2;0;227;253mspeclaw doctor\x1B[0m\x1B[0m\n' +
    '\n' +
    '  \x1B[38;2;153;158;163m\x1B[38;2;153;158;163mai-specs/ is local (gitignored) — teammates run\x1B[0m \x1B[38;2;0;227;253mspeclaw init\x1B[0m \x1B[38;2;153;158;163mafter cloning to regenerate it.\x1B[0m\x1B[0m\n' +
    '\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: "\n  \x1B[38;2;153;158;163m╭────────╮\x1B[0m\n  \x1B[38;2;153;158;163m│ \x1B[0m\x1B[38;2;153;158;163m──────\x1B[0m\x1B[38;2;153;158;163m │\x1B[0m   \x1B[1m\x1B[38;2;244;244;243ms p e c l a w\x1B[0m\x1B[0m\n  \x1B[38;2;153;158;163m│ \x1B[0m\x1B[38;2;153;158;163m────  \x1B[0m\x1B[38;2;153;158;163m │\x1B[0m   \x1B[38;2;153;158;163mwhere specs become law\x1B[0m\n  \x1B[38;2;153;158;163m│ \x1B[0m\x1B[38;2;153;158;163m─────\x1B[0m \x1B[38;2;153;158;163m │\x1B[0m\n  \x1B[38;2;153;158;163m│ \x1B[0m\x1B[38;2;0;227;253m▇▇▇▇▇▇\x1B[0m\x1B[38;2;153;158;163m │\x1B[0m\n  \x1B[38;2;153;158;163m╰────────╯\x1B[0m\n\n  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243mYou're on \x1B[38;2;153;158;163m2.0.7\x1B[0m — latest is \x1B[1m\x1B[38;2;0;227;253m999.0.0\x1B[0m\x1B[0m.\x1B[0m\n  \x1B[38;2;153;158;163mRecommended: refresh the binary with \x1B[38;2;0;227;253mnpx @esneiderbravo/speclaw@latest init\x1B[0m (or \x1B[38;2;0;227;253mnpm i -g @esneiderbravo/speclaw@latest\x1B[0m), then run \x1B[38;2;0;227;253mspeclaw init\x1B[0m again.\x1B[0m\n\n\n\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mSetting up \x1B[1m\x1B[38;2;0;227;253mspeclaw-help-cyTNAz\x1B[0m\x1B[0m\x1B[0m\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mFoundation \x1B[38;2;153;158;163m— LAWS.md + 8 standards + CLAUDE.md/AGENTS.md\x1B[0m\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mLawbook workflow \x1B[38;2;153;158;163m— cortex · explore · draft · build · sync · archive\x1B[0m\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mRole agents \x1B[38;2;153;158;163m— explorer · planner · implementer · reviewer · tester · archiver\x1B[0m\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mLawbook workspace \x1B[38;2;153;158;163m— lawbook/\x1B[0m\x1B[0m\n\n\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mConfiguring agents\x1B[0m\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mClaude Code \x1B[38;2;153;158;163m— symlinks + MCP\x1B[0m\x1B[0m\n\n\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mIndexing your code with Compass\x1B[0m\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m\x1B[1m\x1B[38;2;244;244;243m0\x1B[0m\x1B[0m\x1B[38;2;153;158;163m files · \x1B[0m\x1B[1m\x1B[38;2;244;244;243m0\x1B[0m\x1B[0m\x1B[38;2;153;158;163m nodes · \x1B[0m\x1B[1m\x1B[38;2;244;244;243m0\x1B[0m\x1B[0m\x1B[38;2;153;158;163m edges · \x1B[0m\x1B[1m\x1B[38;2;244;244;243m0\x1B[0m\x1B[0m\x1B[38;2;153;158;163m embeddings\x1B[0m\x1B[0m\n\n\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mYou're set — one last step\x1B[0m\x1B[0m\n\n  \x1B[38;2;153;158;163mCopy this and paste it into \x1B[38;2;0;227;253mthe agent you're using\x1B[0m:\x1B[0m\n\n\x1B[38;2;244;244;243mComplete speclaw's foundation: analyze this repo and fill LAWS.md and docs/standards/* with its real architecture, quality gates and conventions. Infer the working language and conventions from the repo itself — docstrings, commit messages, branch names, PR and ticket language — don't assume. Start with init_project.\x1B[0m\n\n  \x1B[38;2;153;158;163mNon-trivial work runs through Cortex — use \x1B[38;2;0;227;253m/lawbook/cortex\x1B[0m (or the cortex skill).\x1B[0m\n\n  \x1B[38;2;153;158;163mAdd an agent:   \x1B[38;2;0;227;253mspeclaw agent add cursor\x1B[0m\x1B[0m\n  \x1B[38;2;153;158;163mRefresh index:  \x1B[38;2;0;227;253mspeclaw index\x1B[0m\x1B[0m\n  \x1B[38;2;153;158;163mHealth check:   \x1B[38;2;0;227;253mspeclaw doctor\x1B[0m\x1B[0m\n\n  \x1B[38;2;153;158;163m\x1B[38;2;153;158;163mai-specs/ is local (gitignored) — teammates run\x1B[0m \x1B[38;2;0;227;253mspeclaw init\x1B[0m \x1B[38;2;153;158;163mafter cloning to regenerate it.\x1B[0m\x1B[0m\n\n",
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `update --help` prints usage without side effects (525.953417ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n' +
    '\n' +
    '\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mChecking for updates\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mAlready on the latest version (2.0.7).\x1B[0m\n' +
    '\n' +
    '\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mProject\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;153;158;163mNo speclaw project here — run \x1B[38;2;0;227;253mspeclaw init\x1B[0m to set one up.\x1B[0m\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n\n\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mChecking for updates\x1B[0m\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mAlready on the latest version (2.0.7).\x1B[0m\n\n\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mProject\x1B[0m\x1B[0m\n  \x1B[38;2;153;158;163mNo speclaw project here — run \x1B[38;2;0;227;253mspeclaw init\x1B[0m to set one up.\x1B[0m\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `update -h` prints usage without side effects (463.710084ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n' +
    '\n' +
    '\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mChecking for updates\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mAlready on the latest version (2.0.7).\x1B[0m\n' +
    '\n' +
    '\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mProject\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;153;158;163mNo speclaw project here — run \x1B[38;2;0;227;253mspeclaw init\x1B[0m to set one up.\x1B[0m\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n\n\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mChecking for updates\x1B[0m\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mAlready on the latest version (2.0.7).\x1B[0m\n\n\x1B[38;2;0;227;253m◇ \x1B[0m\x1B[1m\x1B[38;2;244;244;243mProject\x1B[0m\x1B[0m\n  \x1B[38;2;153;158;163mNo speclaw project here — run \x1B[38;2;0;227;253mspeclaw init\x1B[0m to set one up.\x1B[0m\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `agent --help` prints usage without side effects (39.377708ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n' +
    '\n' +
    '\x1B[1m\x1B[38;2;0;227;253mAgents\x1B[0m\x1B[0m\n' +
    '  claude     Claude Code            —\n' +
    '  cursor     Cursor                 —\n' +
    '  codex      Codex                  —\n' +
    '  windsurf   Windsurf               —\n' +
    '  agents     Generic (AGENTS.md)    —\n' +
    '\n' +
    '  \x1B[38;2;153;158;163mAdd one:  speclaw agent add <id>\x1B[0m\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n\n\x1B[1m\x1B[38;2;0;227;253mAgents\x1B[0m\x1B[0m\n  claude     Claude Code            —\n  cursor     Cursor                 —\n  codex      Codex                  —\n  windsurf   Windsurf               —\n  agents     Generic (AGENTS.md)    —\n\n  \x1B[38;2;153;158;163mAdd one:  speclaw agent add <id>\x1B[0m\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `agent -h` prints usage without side effects (39.9195ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n' +
    '\n' +
    '\x1B[1m\x1B[38;2;0;227;253mAgents\x1B[0m\x1B[0m\n' +
    '  claude     Claude Code            —\n' +
    '  cursor     Cursor                 —\n' +
    '  codex      Codex                  —\n' +
    '  windsurf   Windsurf               —\n' +
    '  agents     Generic (AGENTS.md)    —\n' +
    '\n' +
    '  \x1B[38;2;153;158;163mAdd one:  speclaw agent add <id>\x1B[0m\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n\n\x1B[1m\x1B[38;2;0;227;253mAgents\x1B[0m\x1B[0m\n  claude     Claude Code            —\n  cursor     Cursor                 —\n  codex      Codex                  —\n  windsurf   Windsurf               —\n  agents     Generic (AGENTS.md)    —\n\n  \x1B[38;2;153;158;163mAdd one:  speclaw agent add <id>\x1B[0m\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `index --help` prints usage without side effects (46.113375ms)
  AssertionError [ERR_ASSERTION]: no branded header
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:358:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\nUsage: speclaw index [options]\n\n(Re)build the local Compass code graph for the current directory. Runs are\nincremental: unchanged files are skipped, and an unchanged project skips the\nglobal post-processing.\n\nOptions\n  --force              Re-extract every file\n  --prune              Also evict embedding-cache rows unused for --retention days\n  --retention <days>   Retention window for --prune (default 30)\n  --max-cache-mb <mb>  Embedding-cache size cap (default 256)\n  --json               Print the index statistics as JSON\n',
    expected: /where specs become law/,
    operator: 'doesNotMatch',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `index -h` prints usage without side effects (43.383791ms)
  AssertionError [ERR_ASSERTION]: no branded header
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:358:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\nUsage: speclaw index [options]\n\n(Re)build the local Compass code graph for the current directory. Runs are\nincremental: unchanged files are skipped, and an unchanged project skips the\nglobal post-processing.\n\nOptions\n  --force              Re-extract every file\n  --prune              Also evict embedding-cache rows unused for --retention days\n  --retention <days>   Retention window for --prune (default 30)\n  --max-cache-mb <mb>  Embedding-cache size cap (default 256)\n  --json               Print the index statistics as JSON\n',
    expected: /where specs become law/,
    operator: 'doesNotMatch',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `watch --help` prints usage without side effects (15009.411791ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr: )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `watch -h` prints usage without side effects (15008.957833ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr: )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `session-start --help` prints usage without side effects (47.531375ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  ''
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `session-start -h` prints usage without side effects (38.225042ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  ''
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `explore --help` prints usage without side effects (42.01275ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw explore <node>[0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `explore -h` prints usage without side effects (44.556542ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw explore <node>[0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `search --help` prints usage without side effects (44.111875ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw search <query>[0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `search -h` prints usage without side effects (41.937917ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw search <query>[0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `recall --help` prints usage without side effects (42.976709ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw recall "<query>"[0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `recall -h` prints usage without side effects (42.895834ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw recall "<query>"[0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `impact --help` prints usage without side effects (41.499208ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw impact <node> | impact --file <path>[0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `impact -h` prints usage without side effects (47.450417ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw impact <node> | impact --file <path>[0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `trace --help` prints usage without side effects (41.8605ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw trace <from> <to>[0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `trace -h` prints usage without side effects (43.534542ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw trace <from> <to>[0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `affected-tests --help` prints usage without side effects (40.972958ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw affected-tests --file <path> | --from-diff <ref>[0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `affected-tests -h` prints usage without side effects (39.843ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw affected-tests --file <path> | --from-diff <ref>[0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `diff-context --help` prints usage without side effects (41.990792ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw diff-context [--file <path>...] [--rev <ref>] [--worktree][0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `diff-context -h` prints usage without side effects (41.289583ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw diff-context [--file <path>...] [--rev <ref>] [--worktree][0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `hotspots --help` prints usage without side effects (79.862375ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '\n' +
    '\x1B[1m\x1B[38;2;0;227;253mHotspots (last 90 days (since 2026-07-09), sort=combined): 0\x1B[0m\x1B[0m\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '\n\x1B[1m\x1B[38;2;0;227;253mHotspots (last 90 days (since 2026-07-09), sort=combined): 0\x1B[0m\x1B[0m\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `hotspots -h` prints usage without side effects (79.880084ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '\n' +
    '\x1B[1m\x1B[38;2;0;227;253mHotspots (last 90 days (since 2026-07-09), sort=combined): 0\x1B[0m\x1B[0m\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '\n\x1B[1m\x1B[38;2;0;227;253mHotspots (last 90 days (since 2026-07-09), sort=combined): 0\x1B[0m\x1B[0m\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `coupling --help` prints usage without side effects (40.204834ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw coupling <file>[0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `coupling -h` prints usage without side effects (40.117375ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw coupling <file>[0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `visualize --help` prints usage without side effects (38.040208ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mNo index found. Run the compass_index tool (or `speclaw index`) first.[0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `visualize -h` prints usage without side effects (38.683042ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mNo index found. Run the compass_index tool (or `speclaw index`) first.[0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `quick --help` prints usage without side effects (40.502416ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw quick <name> [--path <file>] [--symbol <sym>] [--json][0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `quick -h` prints usage without side effects (38.849625ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw quick <name> [--path <file>] [--symbol <sym>] [--json][0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `cortex --help` prints usage without side effects (36.328667ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw cortex <status|start|advance|rework|brief> --change <name> [--verdict PASS|FAIL] [--question …] [--pause-questions] [--note …] [--json][0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `cortex -h` prints usage without side effects (37.758583ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw cortex <status|start|advance|rework|brief> --change <name> [--verdict PASS|FAIL] [--question …] [--pause-questions] [--note …] [--json][0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `lawbook --help` prints usage without side effects (48.688458ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw lawbook <init|list|validate|sync|archive|level|draft|investigate|harness> [change][0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `lawbook -h` prints usage without side effects (44.333292ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUsage: speclaw lawbook <init|list|validate|sync|archive|level|draft|investigate|harness> [change][0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `doctor --help` prints usage without side effects (400.638334ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n' +
    '\n' +
    '\x1B[1m\x1B[38;2;0;227;253mspeclaw doctor\x1B[0m\x1B[0m\n' +
    '\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243menvironment  [warn]\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  node                     v24.17.0 (requires >=22.16)\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  platform                 darwin arm64\x1B[0m\n' +
    '  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243m  git                      not a git repository\x1B[0m\n' +
    '      → git init\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  fts5                     node:sqlite FTS5 available\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  embedder                 active embedder: lexical-hash-v1+in2\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  ast engine               @ast-grep/napi not shipped yet — skip until executable-laws wires it\x1B[0m\n' +
    '\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mconfiguration  [warn]\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  manifest                 project not initialised\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  ownership                project not initialised\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  symlinks                 project not initialised\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  hooks                    project not initialised\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  laws                     project not initialised\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  budget                   project not initialised\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  tool-surface             project not initialised\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  index.freshness          project not initialised\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  specs.orphans            project not initialised\x1B[0m\n' +
    '  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243m  rule lockfile            no speclaw.lock — rule digests are not pinned\x1B[0m\n' +
    '      → speclaw laws lock\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  external rule imports    no external @import / @~/ paths detected in rule files\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  outside-pipeline rules   no outside-pipeline rule files discovered\x1B[0m\n' +
    '\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mauthentication  [ok]\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  credentials              none — speclaw stores no credentials and runs fully local\x1B[0m\n' +
    '\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mconnectivity  [ok]\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  npm registry             2.0.7 installed (latest)\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  outbound requests        1 possible: npm version check (disable with --offline). No analytics, no authenticated calls.\x1B[0m\n' +
    '\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mnotes  [ok]\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  post-compact rules       Rules with `paths:` are NOT re-injected after a context compact. No law manifest.\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  agent capabilities       claude: hooks=yes mcp=yes; cursor: hooks=no mcp=yes; codex: hooks=no mcp=yes; windsurf: hooks=no mcp=yes; agents: hooks=no mcp=no\x1B[0m\n' +
    '\n' +
    '  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243m2 warning(s). Run `speclaw doctor --json` and paste it into an issue.\x1B[0m\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n\n\x1B[1m\x1B[38;2;0;227;253mspeclaw doctor\x1B[0m\x1B[0m\n\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243menvironment  [warn]\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  node                     v24.17.0 (requires >=22.16)\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  platform                 darwin arm64\x1B[0m\n  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243m  git                      not a git repository\x1B[0m\n      → git init\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  fts5                     node:sqlite FTS5 available\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  embedder                 active embedder: lexical-hash-v1+in2\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  ast engine               @ast-grep/napi not shipped yet — skip until executable-laws wires it\x1B[0m\n\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mconfiguration  [warn]\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  manifest                 project not initialised\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  ownership                project not initialised\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  symlinks                 project not initialised\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  hooks                    project not initialised\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  laws                     project not initialised\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  budget                   project not initialised\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  tool-surface             project not initialised\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  index.freshness          project not initialised\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  specs.orphans            project not initialised\x1B[0m\n  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243m  rule lockfile            no speclaw.lock — rule digests are not pinned\x1B[0m\n      → speclaw laws lock\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  external rule imports    no external @import / @~/ paths detected in rule files\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  outside-pipeline rules   no outside-pipeline rule files discovered\x1B[0m\n\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mauthentication  [ok]\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  credentials              none — speclaw stores no credentials and runs fully local\x1B[0m\n\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mconnectivity  [ok]\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  npm registry             2.0.7 installed (latest)\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  outbound requests        1 possible: npm version check (disable with --offline). No analytics, no authenticated calls.\x1B[0m\n\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mnotes  [ok]\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  post-compact rules       Rules with `paths:` are NOT re-injected after a context compact. No law manifest.\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  agent capabilities       claude: hooks=yes mcp=yes; cursor: hooks=no mcp=yes; codex: hooks=no mcp=yes; windsurf: hooks=no mcp=yes; agents: hooks=no mcp=no\x1B[0m\n\n  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243m2 warning(s). Run `speclaw doctor --json` and paste it into an issue.\x1B[0m\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `doctor -h` prints usage without side effects (425.341375ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n' +
    '\n' +
    '\x1B[1m\x1B[38;2;0;227;253mspeclaw doctor\x1B[0m\x1B[0m\n' +
    '\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243menvironment  [warn]\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  node                     v24.17.0 (requires >=22.16)\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  platform                 darwin arm64\x1B[0m\n' +
    '  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243m  git                      not a git repository\x1B[0m\n' +
    '      → git init\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  fts5                     node:sqlite FTS5 available\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  embedder                 active embedder: lexical-hash-v1+in2\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  ast engine               @ast-grep/napi not shipped yet — skip until executable-laws wires it\x1B[0m\n' +
    '\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mconfiguration  [warn]\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  manifest                 project not initialised\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  ownership                project not initialised\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  symlinks                 project not initialised\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  hooks                    project not initialised\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  laws                     project not initialised\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  budget                   project not initialised\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  tool-surface             project not initialised\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  index.freshness          project not initialised\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  specs.orphans            project not initialised\x1B[0m\n' +
    '  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243m  rule lockfile            no speclaw.lock — rule digests are not pinned\x1B[0m\n' +
    '      → speclaw laws lock\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  external rule imports    no external @import / @~/ paths detected in rule files\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  outside-pipeline rules   no outside-pipeline rule files discovered\x1B[0m\n' +
    '\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mauthentication  [ok]\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  credentials              none — speclaw stores no credentials and runs fully local\x1B[0m\n' +
    '\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mconnectivity  [ok]\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  npm registry             2.0.7 installed (latest)\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  outbound requests        1 possible: npm version check (disable with --offline). No analytics, no authenticated calls.\x1B[0m\n' +
    '\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mnotes  [ok]\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  post-compact rules       Rules with `paths:` are NOT re-injected after a context compact. No law manifest.\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  agent capabilities       claude: hooks=yes mcp=yes; cursor: hooks=no mcp=yes; codex: hooks=no mcp=yes; windsurf: hooks=no mcp=yes; agents: hooks=no mcp=no\x1B[0m\n' +
    '\n' +
    '  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243m2 warning(s). Run `speclaw doctor --json` and paste it into an issue.\x1B[0m\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n\n\x1B[1m\x1B[38;2;0;227;253mspeclaw doctor\x1B[0m\x1B[0m\n\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243menvironment  [warn]\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  node                     v24.17.0 (requires >=22.16)\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  platform                 darwin arm64\x1B[0m\n  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243m  git                      not a git repository\x1B[0m\n      → git init\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  fts5                     node:sqlite FTS5 available\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  embedder                 active embedder: lexical-hash-v1+in2\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  ast engine               @ast-grep/napi not shipped yet — skip until executable-laws wires it\x1B[0m\n\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mconfiguration  [warn]\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  manifest                 project not initialised\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  ownership                project not initialised\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  symlinks                 project not initialised\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  hooks                    project not initialised\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  laws                     project not initialised\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  budget                   project not initialised\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  tool-surface             project not initialised\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  index.freshness          project not initialised\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  specs.orphans            project not initialised\x1B[0m\n  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243m  rule lockfile            no speclaw.lock — rule digests are not pinned\x1B[0m\n      → speclaw laws lock\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  external rule imports    no external @import / @~/ paths detected in rule files\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  outside-pipeline rules   no outside-pipeline rule files discovered\x1B[0m\n\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mauthentication  [ok]\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  credentials              none — speclaw stores no credentials and runs fully local\x1B[0m\n\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mconnectivity  [ok]\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  npm registry             2.0.7 installed (latest)\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  outbound requests        1 possible: npm version check (disable with --offline). No analytics, no authenticated calls.\x1B[0m\n\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mnotes  [ok]\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  post-compact rules       Rules with `paths:` are NOT re-injected after a context compact. No law manifest.\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243m  agent capabilities       claude: hooks=yes mcp=yes; cursor: hooks=no mcp=yes; codex: hooks=no mcp=yes; windsurf: hooks=no mcp=yes; agents: hooks=no mcp=no\x1B[0m\n\n  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243m2 warning(s). Run `speclaw doctor --json` and paste it into an issue.\x1B[0m\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `budget --help` prints usage without side effects (68.025583ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n' +
    '\n' +
    '\x1B[1m\x1B[38;2;0;227;253mspeclaw budget\x1B[0m\x1B[0m\n' +
    'Superficie                              tokens   presupuesto\n' +
    'A  tools MCP (29, full)                      4192     2200  OVER\n' +
    'B  skills + commands                         3558     3800  ok\n' +
    'C  always-on instructions                       0     8000  ok\n' +
    'D  path-scoped rules                            0        —\n' +
    '                                           ──────   ──────\n' +
    'TOTAL always-on                              7750    16000  ok\n' +
    '\n' +
    '  \x1B[38;2;153;158;163mprofile: full · tools registered: 29\x1B[0m\n' +
    '  \x1B[38;2;153;158;163mSpec Kit (commands only), for comparison: ~18,600 — github/spec-kit#1401\x1B[0m\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n\n\x1B[1m\x1B[38;2;0;227;253mspeclaw budget\x1B[0m\x1B[0m\nSuperficie                              tokens   presupuesto\nA  tools MCP (29, full)                      4192     2200  OVER\nB  skills + commands                         3558     3800  ok\nC  always-on instructions                       0     8000  ok\nD  path-scoped rules                            0        —\n                                           ──────   ──────\nTOTAL always-on                              7750    16000  ok\n\n  \x1B[38;2;153;158;163mprofile: full · tools registered: 29\x1B[0m\n  \x1B[38;2;153;158;163mSpec Kit (commands only), for comparison: ~18,600 — github/spec-kit#1401\x1B[0m\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `budget -h` prints usage without side effects (66.757834ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n' +
    '\n' +
    '\x1B[1m\x1B[38;2;0;227;253mspeclaw budget\x1B[0m\x1B[0m\n' +
    'Superficie                              tokens   presupuesto\n' +
    'A  tools MCP (29, full)                      4192     2200  OVER\n' +
    'B  skills + commands                         3558     3800  ok\n' +
    'C  always-on instructions                       0     8000  ok\n' +
    'D  path-scoped rules                            0        —\n' +
    '                                           ──────   ──────\n' +
    'TOTAL always-on                              7750    16000  ok\n' +
    '\n' +
    '  \x1B[38;2;153;158;163mprofile: full · tools registered: 29\x1B[0m\n' +
    '  \x1B[38;2;153;158;163mSpec Kit (commands only), for comparison: ~18,600 — github/spec-kit#1401\x1B[0m\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n\n\x1B[1m\x1B[38;2;0;227;253mspeclaw budget\x1B[0m\x1B[0m\nSuperficie                              tokens   presupuesto\nA  tools MCP (29, full)                      4192     2200  OVER\nB  skills + commands                         3558     3800  ok\nC  always-on instructions                       0     8000  ok\nD  path-scoped rules                            0        —\n                                           ──────   ──────\nTOTAL always-on                              7750    16000  ok\n\n  \x1B[38;2;153;158;163mprofile: full · tools registered: 29\x1B[0m\n  \x1B[38;2;153;158;163mSpec Kit (commands only), for comparison: ~18,600 — github/spec-kit#1401\x1B[0m\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `coverage --help` prints usage without side effects (41.269917ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n' +
    '1..0\n' +
    '# no identified requirements — run: speclaw coverage --adopt\n' +
    'ok - 0 total\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n1..0\n# no identified requirements — run: speclaw coverage --adopt\nok - 0 total\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `coverage -h` prints usage without side effects (40.83425ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n' +
    '1..0\n' +
    '# no identified requirements — run: speclaw coverage --adopt\n' +
    'ok - 0 total\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n1..0\n# no identified requirements — run: speclaw coverage --adopt\nok - 0 total\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `drift --help` prints usage without side effects (41.27075ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr: )
  
  2 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 2,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `drift -h` prints usage without side effects (40.255ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr: )
  
  2 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 2,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `telemetry --help` prints usage without side effects (35.729167ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mspeclaw includes no telemetry — nothing is collected or transmitted.\x1B[0m\n' +
    'Policy: 100% local. There is no enable path and no analytics endpoint.\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mspeclaw includes no telemetry — nothing is collected or transmitted.\x1B[0m\nPolicy: 100% local. There is no enable path and no analytics endpoint.\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `telemetry -h` prints usage without side effects (34.81225ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mspeclaw includes no telemetry — nothing is collected or transmitted.\x1B[0m\n' +
    'Policy: 100% local. There is no enable path and no analytics endpoint.\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mspeclaw includes no telemetry — nothing is collected or transmitted.\x1B[0m\nPolicy: 100% local. There is no enable path and no analytics endpoint.\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `owners --help` prints usage without side effects (35.530667ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mno team.owners declared — nothing to check\x1B[0m\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mno team.owners declared — nothing to check\x1B[0m\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `owners -h` prints usage without side effects (35.129542ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n' +
    '  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mno team.owners declared — nothing to check\x1B[0m\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '\x1B[38;2;0;227;253m◈\x1B[0m \x1B[1m\x1B[38;2;244;244;243mspeclaw\x1B[0m\x1B[0m  \x1B[38;2;153;158;163mv2.0.7\x1B[0m \x1B[38;2;153;158;163m· where specs become law\x1B[0m\n  \x1B[38;2;62;207;122m✓\x1B[0m \x1B[38;2;244;244;243mno team.owners declared — nothing to check\x1B[0m\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `check --help` prints usage without side effects (41.496875ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '\n' +
    '\x1B[1m\x1B[38;2;0;227;253mspeclaw check\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243mNo law manifest — run `speclaw init` to seed .speclaw/laws-manifest.json.\x1B[0m\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '\n\x1B[1m\x1B[38;2;0;227;253mspeclaw check\x1B[0m\x1B[0m\n  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243mNo law manifest — run `speclaw init` to seed .speclaw/laws-manifest.json.\x1B[0m\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `check -h` prints usage without side effects (40.936417ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '\n' +
    '\x1B[1m\x1B[38;2;0;227;253mspeclaw check\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243mNo law manifest — run `speclaw init` to seed .speclaw/laws-manifest.json.\x1B[0m\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '\n\x1B[1m\x1B[38;2;0;227;253mspeclaw check\x1B[0m\x1B[0m\n  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243mNo law manifest — run `speclaw init` to seed .speclaw/laws-manifest.json.\x1B[0m\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `laws --help` prints usage without side effects (51.902416ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUnknown laws subcommand: (none) — try [38;2;0;227;253mspeclaw laws verify|compile|import|lock|accept|scan[0m.[0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `laws -h` prints usage without side effects (52.89725ms)
  AssertionError [ERR_ASSERTION]: exit code (stderr:   [38;2;255;92;71m✗[0m [38;2;244;244;243mUnknown laws subcommand: (none) — try [38;2;0;227;253mspeclaw laws verify|compile|import|lock|accept|scan[0m.[0m
  )
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:355:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `verify --help` prints usage without side effects (50.085625ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '  \x1B[38;2;153;158;163mNo speclaw.lock — run `speclaw laws lock` to create the baseline.\x1B[0m\n' +
    '\n' +
    '\x1B[1m\x1B[38;2;0;227;253mspeclaw verify\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;153;158;163m0 passed · \x1B[38;2;255;92;71m0\x1B[0m failed · 0 skipped · 0 unknown (0.3 ms)\x1B[0m\n' +
    '  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243m0 batch laws evaluated — verify is not checking anything.\x1B[0m\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '  \x1B[38;2;153;158;163mNo speclaw.lock — run `speclaw laws lock` to create the baseline.\x1B[0m\n\n\x1B[1m\x1B[38;2;0;227;253mspeclaw verify\x1B[0m\x1B[0m\n  \x1B[38;2;153;158;163m0 passed · \x1B[38;2;255;92;71m0\x1B[0m failed · 0 skipped · 0 unknown (0.3 ms)\x1B[0m\n  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243m0 batch laws evaluated — verify is not checking anything.\x1B[0m\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }

test at dist-test/test/e2e/cli.test.js:337:9
✖ `verify -h` prints usage without side effects (48.323917ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Usage/. Input:
  
  '  \x1B[38;2;153;158;163mNo speclaw.lock — run `speclaw laws lock` to create the baseline.\x1B[0m\n' +
    '\n' +
    '\x1B[1m\x1B[38;2;0;227;253mspeclaw verify\x1B[0m\x1B[0m\n' +
    '  \x1B[38;2;153;158;163m0 passed · \x1B[38;2;255;92;71m0\x1B[0m failed · 0 skipped · 0 unknown (0.3 ms)\x1B[0m\n' +
    '  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243m0 batch laws evaluated — verify is not checking anything.\x1B[0m\n'
  
      at TestContext.<anonymous> (file:///Users/esneiderbravo/Projects/speclaw/dist-test/test/e2e/cli.test.js:356:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1306:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:897:18)
      at Test.postRun (node:internal/test_runner/test:1447:19)
      at Test.run (node:internal/test_runner/test:1372:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '  \x1B[38;2;153;158;163mNo speclaw.lock — run `speclaw laws lock` to create the baseline.\x1B[0m\n\n\x1B[1m\x1B[38;2;0;227;253mspeclaw verify\x1B[0m\x1B[0m\n  \x1B[38;2;153;158;163m0 passed · \x1B[38;2;255;92;71m0\x1B[0m failed · 0 skipped · 0 unknown (0.3 ms)\x1B[0m\n  \x1B[38;2;245;183;61m!\x1B[0m \x1B[38;2;244;244;243m0 batch laws evaluated — verify is not checking anything.\x1B[0m\n',
    expected: /Usage/,
    operator: 'match',
    diff: 'simple'
  }
````

## Rework 3 re-test (2026-10-06)

Final re-test after rework 3 (N-a accept routing, doctor remedy, release 2.0.9). Gates re-run in `/Users/esneiderbravo/Projects/speclaw`: `npm run check` exit 0; `npm run build` exit 0; `npm test` exit 0 with tests 833, pass 833, fail 0 (39.6 s), all files 86.32 / 82.68 / 88.22; `lawbook_change` validate `valid: true`, `issues: []` (EARS warnings only); after `node dist/cli/index.js index` (6 files re-indexed, 247 total) and `git checkout -- docs/compass.md`, change-scoped coverage with `onlyDefects` returned `Coverage clean: 26/26 shallow, 26 deep`.

Manual runs used a new throwaway repo `/tmp/speclaw-rt3.yY1t3f/p1` (`git init` + `speclaw init --yes`, committed). `HOME` pointed to `/tmp/speclaw-rt3.yY1t3f/home`, and a `node --import stub.mjs` preload answered the npm registry locally (`STUB_LATEST`) and blocked every other URL. The real registry was never contacted, and nothing ran in this repo.

| # | What | Observed |
|---|------|----------|
| RT3-1 | `laws accept .cursorrules` with a valid lock on a real pty (`script -q`, answered `y`) | `EXIT=1`; one line `✗ .cursorrules is scan-only — digests are not locked for this path.`; `grep -c -E "delete it\|speclaw laws lock\|left unchanged\|Repair it"` on the ANSI-stripped transcript = **0**; `speclaw.lock` sha256 `11feeb62…` before = after. The pty had zero columns, so the clack prompt drew one character per line; the prompt text was `Update speclaw.lock digest for .cursorrules?` |
| RT3-2 | `doctor` on a merge-conflict lock, and on `lockfileVersion: 99` | exit 1 for both. `✗ rule lockfile speclaw.lock: unreadable (Unexpected token '<', …)` / `unsupported lockfileVersion 99 (max 1)`, then `→ resolve the merge conflict in speclaw.lock or restore it from git (git checkout -- speclaw.lock); upgrade speclaw if the lockfileVersion is newer. Last resort: delete it and run speclaw laws lock — this re-baselines every pinned file and accepts any pending drift`. `doctor --json` `cfg.integrity.lock` has `status: "error"` and the same `remedy`. Lock bytes unchanged. With the lock restored: `✓ rule lockfile speclaw.lock root matches (12 files)` |
| RT3-3 | `update --no-self-update` migration gating at 2.0.9 (`STUB_LATEST=2.0.7`) | manifest `2.0.7` → exit 0, `One step for the agent you're using` with the self-update, MCP pin, and lock-drift bullets. Manifest `ai-specs/.speclaw.json` set to `2.0.8` → note shown (1 match). Set to `2.0.9` → no note, no agent step (0 matches). `src/cli/commands/update.ts` `MIGRATIONS` entry `version: "2.0.9"`; `unit/update.test.ts` "the 2.0.9 migration note mentions self-update; the 2.0.1 entry is unchanged" ✔ |

This repo's `speclaw.lock` / `CLAUDE.md` / `AGENTS.md` sha256 are unchanged (`63d45909…`, `edfca9c6…`, `3c8610ca…`), and `git status` is clean for them and for `docs/compass.md`.

## Pre-existing / unrelated failures

None in the gates. Observations (non-blocking, not regressions):

- **O1:** `speclaw lawbook archive --json` prints the text lines rather than JSON (seen in M17, `backend.md`). `harnessCompleted` is visible in the MCP result (`api.md`).
- **O2:** the `custom speclaw entry kept` line goes only into `InstallReport.skipped` (asserted by `agents.test.ts`). `update` prints just `N file(s) added/refreshed · M left untouched` when files changed, and nothing when nothing changed, so a user never sees that the custom entry was kept. The scenario's "SHALL report it as a kept custom entry" is met at the report level, not on the terminal.
- **O3:** the `MIGRATIONS` entry is `2.0.8` while `package.json` is still `2.0.7`, so a 2.0.7 project already sees the 2.0.8 note. The coordinator owns the version bump (tasks 9.2). Rework 3 moved the entry to `2.0.9` (R3.4); `package.json` is still `2.0.7`, so the same note on a 2.0.7 project is expected until the coordinator bumps the version.

## Pending manual steps

None for the tester. The Windows `cmd.exe` spawn path stays unverified on POSIX (above).

## Verdict

PASS
