# Backend checks — keep-speclaw-content-local (2026-08-11)

Date 2026-08-11 · Branch `feat/keep-speclaw-content-local` · Env: macOS (Darwin
25.5.0), Node v24.17.0, cwd `/Users/esneiderbravo/Projects/speclaw` (gates);
manual verification in throwaway temp dirs under `/tmp`.

Scope note: this change gitignores **only `ai-specs/`**. The agent IDE
directories (`.claude/`, `.cursor/`, …) are left untouched so a user's own
skills/commands there stay committable.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Lint + format | `npm run check` | ✅ Prettier — all files styled; ESLint — 0 errors |
| Type-check + compile | `npm run build` | ✅ `tsc` strict clean; assets copied for 3 modules |
| Tests + coverage | `npm run test` | ✅ tests 129, pass 129, fail 0 — coverage 97.90% lines / 92.10% branch / 98.18% func (floor 80%) |

Coverage of touched/new source: `git.js` 100/100/100, `agents.js` 100/100/100,
`scaffold.js` 100 lines / 96.15 branch, `install.js` 100/100/100. The CLI command
files (`init.ts`, `update.ts`) and `cli/lib/untrack.ts` are not loaded in-process
by the suite (verified via e2e/manual, as elsewhere in this repo), so they are
outside the in-process coverage denominator.

## Tests added / updated

- **`test/unit/git.test.ts` (new, 4 tests).** `isGitRepo` true inside a work
  tree / false outside; `listTrackedPaths` returns `[]` outside a git repo,
  reports only candidates git actually tracks (a staged `ai-specs` file → returns
  `ai-specs`; an unstaged `.claude/skills` → excluded), and returns `[]` when a
  present-but-unstaged path is not tracked.
- **`test/unit/agents.test.ts` (+1 guard test).** `configureAgent` leaves the IDE
  dir out of `.gitignore` — none of `.claude`, `.claude/`, `.claude/skills`,
  `.claude/commands` is ignored (only the MCP config is, from `writeMcpConfig`).
- **`test/integration/scaffold.test.ts` (updated).** Asserts `scaffold` writes an
  `ai-specs/` entry into `.gitignore` alongside `.speclaw/` and `*.bak`.

## Spec-scenario coverage

| Scenario (specs/local-content) | Verified by |
|--------------------------------|-------------|
| R1 · init ignores ai-specs | `scaffold.test.ts` "writes … gitignore" (asserts `ai-specs/`); manual [1] |
| R1 · update ignores ai-specs for an already-installed project | manual [3] — `update --migrate-only` printed the untrack step; `ai-specs/` added by scaffold |
| R1 · ignore entry not duplicated on re-run | `install.test.ts` "ensureGitignore … de-duplicates"; `scaffold.test.ts` additive re-run |
| R2 · configuring an agent does not gitignore its IDE content | `agents.test.ts` "leaves the IDE dir out of .gitignore"; manual [1] ("OK: no .claude entries") |
| R2 · a user's own skill in the IDE directory stays committable | manual [2] — `git check-ignore` reports `.claude/skills/my-skill.md` is not ignored |
| R3 · tracked ai-specs prints untrack instructions; index not modified | manual [3] — prints `git rm -r --cached ai-specs`, index md5 unchanged; `git.test.ts` `listTrackedPaths` |
| R3 · nothing tracked means no instructions | `git.test.ts` "returns [] when none of the candidates are tracked"; manual [1] (fresh non-committed dir prints nothing) |
| R3 · outside a git repository, no git command is attempted | `git.test.ts` "returns [] outside a git repository" + `isGitRepo` false |

## Manual verification (agent-executed, isolated in `/tmp`)

Built CLI (`node dist/cli/index.js`) run in fresh `mktemp -d` dirs — no real data
touched.

1. **Fresh `init --yes --no-index`.** `.gitignore` contains `.speclaw/`, `*.bak`,
   `ai-specs/`, `.mcp.json` — and **no** `.claude/*` entry; the `.claude/*`
   symlinks are still created.
2. **User's own `.claude/skills`.** In a git repo, created a real
   `.claude/skills/my-skill.md` before running `init`; `git check-ignore` confirms
   it is **not** ignored (stays committable), and speclaw did not clobber the real
   directory (skipped linking because the path exists).
3. **Old install with `ai-specs/` committed → `update --migrate-only`.** update
   printed exactly `git rm -r --cached ai-specs` and added `ai-specs/` to
   `.gitignore`; `git ls-files` md5 identical before and after (index untouched).

Dogfood applied to this repo: `.gitignore` gains `ai-specs/` and
`git rm -r --cached ai-specs` staged 15 index deletions; the files remain on
disk. The repo's `.claude/*` symlinks stay committed. Build and test green after.

## Pre-existing / unrelated failures

None. Full suite green (129/129).

## Pending manual steps

None. (The dogfood `git rm --cached ai-specs` deletions are staged on the feature
branch and land with the change's commit.)

## Verdict

✅ All gates green, all 8 spec scenarios covered by tests and/or isolated manual
verification. Behavior matches the narrowed `local-content` delta spec
(only `ai-specs/` is gitignored; IDE dirs left to the user).
