# Docs checks — index-at-session-start (2026-10-06)

Date 2026-10-06 · Branch `fix/compass-source-and-session-index` · cwd
`/Users/esneiderbravo/Projects/speclaw`

Scope:

- `docs/compass.md` (§ Session-start refresh (hooks));
- `src/modules/foundation/assets/docs/compass.template.md`;
- `src/modules/foundation/assets/{CLAUDE,AGENTS}.template.md`;
- `CLAUDE.md`, `AGENTS.md`, `README.md`;
- the "run `compass_index` if missing" lines in
  `src/modules/lawbook/assets/{agents/explorer.md,skills/{build,draft,explore,investigate}/steps/*.md}`
  and their `ai-specs/` mirrors;
- the stale task bullets in `tasks.md` (review R1).

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Prettier over markdown | `npm run check` | ✅ exit 0, all files formatted |
| Asset copy | `npm run build` (`copy-assets`) | ✅ exit 0 |
| No stale flag in docs | `grep -rln -- "--session-start" docs README.md CLAUDE.md AGENTS.md src/modules/foundation/assets src/modules/lawbook/assets ai-specs` | ✅ none |
| New command documented | `grep -l "session-start"` | ✅ present in `docs/compass.md`, the compass template, `CLAUDE.md`, `AGENTS.md`, `README.md`. The CLAUDE and AGENTS templates describe the `SessionStart` refresh in prose. |
| Asset ↔ `ai-specs/` mirrors | `cmp` on the 5 edited skill and agent files | ✅ all 5 identical |
| Explorer brief regex still matches | `test/unit/explorer-brief.test.ts` (in `npm test`) | ✅ green (663/663 suite) |
| Lock integrity of strict docs | `node dist/cli/index.js verify` | ✅ exit 0, "No violations." See the note under pending steps on the human `laws accept` (task 9.3). |

## Tests added / updated

No doc tests apply beyond the ones above.

Edited `tasks.md` (review R1):

- §2 now describes the top-level `speclaw session-start` command; the old
  `index --session-start` flag wording is gone.
- 2.2 says help lists `session-start` and `index --help` does not mention it.
- The 4.3 bullet now reads "the top-level help lists `session-start`;
  `index --help` does not."

## Spec-scenario coverage

| Scenario | Verified by |
|----------|-------------|
| code-graph, Session-start index refresh: Help lists the session-start command | the grep checks above, plus `help lists session-start and index --help no longer offers a flag` |

Behavioral scenarios are mapped in `hooks.md`, `cli.md`, and `backend.md`.

## Pre-existing / unrelated failures

None.

## Pending manual steps

- ~~`docs/compass.md` says "Local first, never the network … npx neither
  installs nor revalidates against the registry". This is true for the speclaw
  packument but not for npm's update-notifier request (see `hooks.md`).~~
  Resolved in rework 2: `docs/compass.md:160-165` now names
  `npm_config_update_notifier=false` and says the notifier stays off. The
  re-test confirmed 0 registry requests (`hooks.md`).
- Task 9.3: `CLAUDE.md` and `AGENTS.md` are strict lock paths. The human
  `accepted` digests in `speclaw.lock` (`ace580…` and `13f4ac…`, at 23:33Z) do
  not match the current files (`edfca9…` and `3c8610…`, modified at 18:39 local
  after that accept). The human must re-run `speclaw laws accept` on a TTY.
  `verify` passes today only because `init` and `update` re-baseline the `files`
  digests.

## Verdict

**PASS** for the docs. The wording note was resolved in rework 2.
