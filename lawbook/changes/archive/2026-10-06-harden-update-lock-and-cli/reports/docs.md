# Docs checks — harden-update-lock-and-cli (2026-10-06)

Date 2026-10-06 · Branch `feat/coordinator-status-updates` · cwd `/Users/esneiderbravo/Projects/speclaw` (read-only review of the docs touched by task 9.1 against the behavior observed in the manual runs).

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Lint + format | `npm run check` | ✅ exit 0 (`*.md` is in `.prettierignore` by design: hand-wrapped markdown) |
| Build | `npm run build` | ✅ exit 0 |
| Full suite | `npm test` | ✅ 833/833 |
| Docs diff | `git diff --stat main -- README.md docs/ brand/ .github/workflows/publish.yml` | `README.md` +37/−8, `docs/cortex.md` +61/−2 (the latter shared with the sibling); `brand/` and `publish.yml` unchanged |
| Protected files | `git status --short CLAUDE.md AGENTS.md speclaw.lock docs/compass.md` | ✅ clean. `docs/compass.md` was rewritten by my `speclaw index` (generated map block) and restored with `git checkout -- docs/compass.md` |

## Docs reviewed against observed behavior

| Doc | Claim | Matches? |
|-----|-------|----------|
| `README.md:305-306` | `laws accept` and `laws lock --force` are interactive TTY only | ✅ M7 (`</dev/null` → exit 1), M8/M9 (pty prompt) |
| `README.md:309-316` | a drifted strict file keeps its locked digest and warns `run speclaw laws accept <path>`; `verify` keeps failing until a human accepts; the `accepted[]` audit trail lasts until the next refresh, after which git history holds it (N7) | ✅ M4/M5/M6 |
| `README.md:316-325` | `--force` lists the drifted files with digests, defaults to No, takes `--note`, and re-checks after the confirmation; an unreadable or structurally invalid lock makes the CLI (including `laws accept`) exit non-zero until repaired or deleted | ✅ M8/M9/M10/M11 |
| `README.md:362-370, 382-384, 387` | `update` self-upgrades through npx, with opt-outs `--no-self-update` / `SPECLAW_NO_SELF_UPDATE=1` and the offline/cached fallback; `init`/`agent add`/`update` pin the MCP entry | ✅ M13/M14/M16 |
| `docs/cortex.md:44, 50, 137` | archive completes the harness, restores it if the move fails, and reports `harnessCompleted`; archived changes are read through `status`/`brief`, and mutating ops are read-only | ✅ M17/M18 |
| `brand/terminal-quickstart.svg:11` | `$ npm i -g @esneiderbravo/speclaw` | ✅ an install line, not "upgrade the binary separately", so correctly left unchanged |
| `.github/workflows/publish.yml` | no upgrade-before-update wording | ✅ unchanged, nothing stale |
| `src/cli/lib/help.ts` (`update`, `laws` usage) | describes self-update and `lock [--force]` | ✅ M1/M2 |

Lock docs location: no `docs/*.md` page mentions `speclaw.lock`, so the README integrity section is that page, and it is updated.

## Tests added / updated

None (docs only). `unit/help.test.ts` pins the help-text flags.

## Spec-scenario coverage

Docs carry no scenario of their own. All 343 delta scenarios are mapped: `cli.md` (`cli` 67 + `project-update` 34), `security.md` (`law-enforcement` 114), and `backend.md` (`lawbook-workflow` 128). `api.md` and `skills.md` map the subsets for their surfaces.

## Pre-existing / unrelated failures

None.

## Pending manual steps

- For the coordinator (task 9.2): the 2.0.8 CHANGELOG lines and the version bump (`package.json` is still 2.0.7 while the `MIGRATIONS` entry is 2.0.8).
- Optional doc follow-ups already listed in `tasks.md` (N8 note on stale-binary re-pinning; N3 spec flags).

## Verdict

PASS
