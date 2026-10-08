# Review — stop-hook-feedback

Verdict: **PASS**

Branch `fix/stop-hook-feedback` · reviewed diff main..HEAD against proposal.md, design.md, tasks.md and specs/ship/spec.md.

## Blocking findings

None.

## Non-blocking notes

1. `src/cli/commands/ship-on-stop.ts:22-34`: the `systemMessage` line is written before `process.exit(2)`. Claude Code reads hook JSON on stdout only on exit 0, so the user never sees the blocked-stop summaries ("owes … — sent back to the agent", "gate FAILED … — sent back to the agent"). design.md says this ("shows the user on exit 0"), but the spec ("Whatever happened… the result… owed artifacts, a failing gate") reads as if the user always sees it. As built, the user sees only unblocked stops: pass, or the second stop under `stop_hook_active`. To show both, print `{"decision":"block","reason":<stderr text>,"systemMessage":…}` and exit 0, or reword the requirement.
2. `src/modules/lawbook/api-surface.ts:96`: `git diff -U0 <base>` uses the user's porcelain diff config. With `diff.mnemonicPrefix` (`c/`, `w/`) or `diff.noprefix`, the header regex at :101 matches nothing, so every tracked file yields no lines. Routes and DTOs are then missed silently; contract files still count, because they are judged by name. A configured `diff.external` would also replace the output. Passing `--no-ext-diff --src-prefix=a/ --dst-prefix=b/` makes the parse independent of config. Also, git adds a trailing TAB to `---`/`+++` names that contain a space, so `(.+)$` captures `name\t` and that file's lines are dropped. Header parsing for adds (`--- /dev/null`), deletes (`+++ /dev/null` keeps the `---` name) and renames (the `+++ b/` name wins) is correct.
3. `src/modules/lawbook/api-surface.ts:22`: the Express receiver list includes `api`, and the regex only needs a string or `/` as the first argument. A frontend client line such as `api.get("/users");` (an axios instance on its own line after `=>`) is therefore a "route". So is Express's settings getter `app.get("port")`. Either hit makes the file a public API, raises the level to 1 or more (`publicApi: 5` equals `cuts[0]`), and owes `reports/api.md`. Consider dropping `api` or requiring a handler argument after the path.
4. `src/modules/lawbook/ship.ts:576-588,1104,1117`: `.speclaw/level-cache.json` is shared across branches and stores no branch. On a branch stacked on another, `grownFromCache` can take the parent branch's measurement as the floor. That is harmless, since a floor only rises. Also, the floor proposal's `signals` and `rationale` (for example "12 file(s)" while the diff has 70) are what `scaffoldMeasured` and `promoteCeremonyLevel` record. If the exact measurement later lands at the same level, `remeasure` (:651) does not rewrite them, so `change.json` and the hint's "(why)" keep the subset's numbers. `pendingArtifacts` re-reads the API surface from the current files, so the owed set stays correct.
5. `src/modules/lawbook/ship.ts:1083-1085,1098-1103`: the single-in-flight rule works. `measuredSince` (cache mtime ≥ `pending.at`) plus a 2-minute grace lets only one detached job run at a time, and a finished job unblocks the next one. No test asserts that a second hook call within the grace period starts no second `measure-diff`.
6. `src/modules/lawbook/ship.ts:775`: an existing `reports/api.md` counts as written whatever its content. If a project sets `ship.discipline: api` in config (fallback at :836), ship's own generated `api.md` satisfies the owed API report. `disciplineOf` (:333) protects only per-package names. Consider mapping a fallback of `api` to `backend`, or treating an `api.md` that carries `GENERATED_MARK` as missing.
7. `src/modules/lawbook/levels.ts:400-404`: the entry match `p.endsWith('/' + e)` is unchanged, but it now runs on any project's `package.json`. If `main` is `index.js`, every nested `*/index.js` in the diff counts as public API. This is pre-existing matching, but it is more exposed now that entries are no longer speclaw's own.
8. `src/modules/lawbook/ship.ts:362-383,386-402`: report grouping is right. Repo-wide gates go into every report. Files under a package go only to its discipline, and unclaimed files appear as "outside this discipline's package" unless a root (`.`) group owns them. `dropStaleReports` removes only `.md` files that carry the generated mark, so `README.md` and agent-written reports (including `api.md`) are left alone. If a package test gate fails mid-split (:912-914), reports exist only for the disciplines that ran. That is acceptable for a FAIL.
9. Spec scenarios with thin coverage:
   - "A mention is not a route" (a decorator inside a string or regex) has no test. `test/unit/api-surface.test.ts` covers only the DTO comment half.
   - "A workspace root names no entry" is tested on `packageEntries` (`test/unit/package-entries.test.ts:23`), not on the generated map's missing `entry:` line.
   - "Passing gates at level 3" is tested on `stopSummary` only. Nothing asserts that `runShipOnStop` writes the JSON line, or that `SHIP_ON_STOP_COMMAND` no longer sends stdout to `/dev/null` (`test/unit/hooks.test.ts:187` matches only the subcommand).
10. Laws: `src/shared/package-entries.ts` imports only `node:*`, so shared stays the innermost layer. `api-surface.ts` → `compass/affected-config` follows the existing lawbook → compass edge in `levels.ts`, so no module cycle is added. Nothing on the ship path writes to stdout besides the summary: there is no `console.log` or `process.stdout.write` under `src/modules`, and gates run through `spawnSync` with output captured.

## Follow-up (3e33fc2)

- Note 1 fixed: a blocked stop prints `{"decision":"block","reason":…,"systemMessage":…}` and exits 0; verified with the built CLI in a scratch repo (first stop blocks with the reason, a second stop with `stop_hook_active` only informs).
- Note 2 fixed: `git diff` runs with `--no-ext-diff --no-renames --src-prefix=a/ --dst-prefix=b/`; a header's trailing tab (path with a space) is accepted. Test added.
- Note 3 fixed: the router pattern needs a `/path` plus a handler argument and no longer includes `api`, so `api.get("/users")` and `app.get("port")` are not routes. Test added (strings, regexes, client calls).
- Note 5 fixed: a report carrying ship's "Generated by" mark does not satisfy the owed `reports/api.md`.
- Notes 4 and 6 stay as known limits (cache not keyed by branch; suffix match of `main`).
