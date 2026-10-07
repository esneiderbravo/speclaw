# Docs checks — reindex-on-edit (2026-10-07)

Date 2026-10-07 · Branch `feat/reindex-on-edit` · cwd `/Users/esneiderbravo/Projects/speclaw`

Scope (task 10.1, design §7):

- `docs/compass.md`, hand-written prose only;
- `src/modules/foundation/assets/docs/compass.template.md`, the shipped template;
- `README.md`, the hook paragraph;
- `src/cli/lib/help.ts`, the global list and `reindex-file` usage;
- `src/cli/commands/update.ts`, the 2.0.11 migration note.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Format (markdown included) | `npm run check` | ✅ exit 0: "All matched files use Prettier code style!" |
| Build (copies the template asset) | `npm run build` | ✅ exit 0: "copy-assets: copied assets for 3 module(s)" |
| Tests | `npm test` | ✅ 925 of 925 pass; `help.js` coverage 100 / 100 / 100 |
| Compact map untouched | `diff <(git show HEAD:docs/compass.md \| sed -n '/speclaw:map:start/,/speclaw:map:end/p') <(sed -n '…' docs/compass.md)` | ✅ `MAP_EQUALS_HEAD`. The map block is at lines 319–324; the edit hunks are at lines 48 and 261–312 |
| `docs/compass.md` preserved across the tester's reindexes | sha1 before / after | ✅ `ff0319b2077b224d654e3c7b44aa4d921f3194bd`, mtime 1791380179. The file was backed up before each `speclaw index` in this repo and restored after |
| Strict lock paths untouched (D12) | `git diff --quiet HEAD -- CLAUDE.md AGENTS.md speclaw.lock` | ✅ no change |
| Integrity | `node dist/cli/index.js verify` | ✅ exit 0. It reports one advisory, `integrity~advisory-mismatch~1` on `docs/compass.md`, which is the intended prose edit. Standards docs are advisory, so this is not an error. The archiver re-locks the file |

## What was updated

- **`docs/compass.md`.**
  - The freshness line now names per-edit reindexing, linked to the new section.
  - A new "Reindex on edit (hooks)" section covers:
    - the compiled `PostToolUse` entry (matcher, `type: command`, timeout 10, no other keys);
    - hook versus path mode, and the detached child;
    - eligibility rules;
    - deferral of PageRank and the compact map until the next full run (`meta.post_pending`);
    - what is not covered: Bash-created or renamed files, and agents without hooks;
    - the rule that an older binary rejects the command without indexing.
- **`compass.template.md`.** The same freshness model, condensed into the section that existing projects receive.
- **`README.md`.** The hook paragraph now describes the separate `PostToolUse` reindex hook: silent, always exits 0, and PageRank and the map catch up on the next full run.
- **`help.ts`.**
  - The `GLOBAL_HELP` line reads `reindex-file [paths...]  Silent re-index of edited files (PostToolUse hook; stdin JSON)`.
  - The `reindex-file` usage was verified with `speclaw reindex-file --help`; see `cli.md`.
- **`update.ts`.** The 2.0.11 migration note describes the new hook and the one-time `refreshedDiverged`. It printed during the manual `update --no-self-update`; see `hooks.md`.

## D12 flag (for the human)

`CLAUDE.md` and `AGENTS.md` were **not** edited. They are strict lock paths, and changing them needs a human to run `speclaw laws accept` on a TTY. If you want `CLAUDE.md` and `AGENTS.md` to mention reindex-on-edit, edit them yourself and then run `speclaw laws accept CLAUDE.md AGENTS.md` on a TTY.

## Tests added / updated

None specific to docs. Prose cannot be unit-tested. In its place:

- the format gate;
- the map-block equality check;
- the strict-path diff;
- the `--help` output checks in `cli.md`;
- the global-help line asserted by `reindex-file.test.ts` "help lists reindex-file and its --help prints usage".

## Spec-scenario coverage

| Scenario | Verified by |
|----------|-------------|
| `req~reindex-on-edit~1` — Help lists the reindex-file command | `reindex-file.test.ts`, the e2e help table, and manual `--help` (`cli.md`) |
| `req~index-noop-fast-path~1` — A no-op run leaves the compact map untouched | `index-noop.test.ts` (green); the map block is byte-equal to HEAD here |

Every scenario of the two delta specs is mapped one by one in `backend.md` (`code-graph`, 141) and `hooks.md` (`law-enforcement`, 125).

## Pre-existing / unrelated failures

None.

## Pending manual steps

Human only, and optional: the D12 `CLAUDE.md` / `AGENTS.md` mention, through a TTY `laws accept`.

## Verdict

PASS
