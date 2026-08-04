# Backend checks — opt-in-refresh-backups (2026-08-04)

Date: 2026-08-04 · Branch: `feat/opt-in-refresh-backups` · Environment:
Node/TypeScript CLI, commands run from the repo root and from a temp scratch
project (`node dist/cli/index.js …`).

Scope: `.bak` on managed-file refresh becomes opt-in — `src/shared/install.ts`
(gate the copy behind `CopyOpts.backup`, new `InstallReport.refreshedDiverged`),
`src/modules/foundation/scaffold.ts` (thread `backup`, add the `*.bak`
gitignore), `src/cli/commands/update.ts` (`--backup` flag + split divergence
messages), and the README. No `package.json` bump — the single `0.1.13` release
bump ships via `professional-discipline-reports` (the deploy PR, merged last).

## Gates & results

| Check | Command | Result |
| :-- | :-- | :-- |
| Lint + format | `npm run check` (Prettier `--check` + ESLint) | ✅ "All matched files use Prettier code style!", ESLint clean |
| Type-check + compile | `npm run build` (`tsc` strict + copy-assets) | ✅ no type errors — the new required `refreshedDiverged` field type-checks across all `InstallReport` consumers; "copied assets for 3 module(s)" |

speclaw has no `node:test` runner yet (see `docs/standards/testing-standards.md`),
so coverage is the two compile-time gates plus the end-to-end CLI exercise below.

## Tests added / updated

None. No `node:test` runner is wired, so there is no fixture exercising
`copyRendered`/`scaffold` to update. `tsc` in strict mode acts as the structural
check that every `InstallReport` producer/consumer handles the new
`refreshedDiverged` field (only `emptyReport` constructs the report; only
`update.ts` reads the divergence lists). Behavior is verified end-to-end below.

## Spec-scenario coverage

Delta spec: `specs/project-update/spec.md`. Scenarios changed by this change are
marked **(changed/new)**; the rest restate unchanged capability behavior in the
full delta and are untouched here.

| Scenario | Verified by |
| :-- | :-- |
| A diverged managed file is refreshed and reported (default) **(new)** | E2E (A): edited `sync/SKILL.md` overwritten; message "had local edits — overwritten … re-run with --backup"; **no** `.bak`; edit gone from live file |
| A diverged managed file is backed up on request **(new)** | E2E (B): `update --migrate-only --backup` wrote `sync/SKILL.md.bak` (reported) and the `.bak` holds the edit |
| Backups are gitignored **(new)** | E2E: fresh `init` wrote `*.bak` to `.gitignore` (line 6) via `ensureGitignore` |
| An outdated managed file is refreshed / reported | E2E: the diverged file was refreshed and reported in both runs |
| An up-to-date managed file needs no change | E2E: untouched `archive/SKILL.md` got no `.bak` in either run; "16 left untouched" |
| Personalized files not auto-edited; agent prompt on/off; laggard cohort; every crossed migration applied; agent-generic handoff | Unchanged; not touched by this change (no `MIGRATIONS` entry added) |

## Manual / end-to-end verification (built CLI, scratch project)

Built `dist/`, then in a fresh temp git repo: `init --yes --agents claude
--no-index`, edited `ai-specs/skills/sync/SKILL.md`, and:

- **(A) `update --migrate-only`** (no flag) → `1 file(s) refreshed · 16 left
  untouched`; warned `… had local edits — overwritten with the current version.
  Recover from git, or re-run with --backup to keep a .bak.`; **no** `*.bak` on
  disk; the `LOCAL EDIT` marker gone from the live file. ✅
- **(B)** re-edited, `update --migrate-only --backup` → warned `… saved as
  …/SKILL.md.bak before refreshing.`; `SKILL.md.bak` present and containing the
  edit. ✅
- Untouched `archive/SKILL.md` received **no** `.bak` in either run. ✅
- `.gitignore` contains `*.bak` after `init`. ✅

## Pre-existing / unrelated failures

None. Both gates were green on a clean tree before and after the change.

## Pending manual steps

None. (Existing projects get the `*.bak` gitignore line automatically on their
next `speclaw update`, because `ensureGitignore` runs on every managed refresh —
no migration entry required.)

## Verdict

✅ `.bak` is now opt-in: default refresh overwrites in place and reports it (git
is the recovery path), `--backup` restores the `.bak`, and `*.bak` is gitignored.
Gates green. No frontend in this change — `frontend.md` omitted.
