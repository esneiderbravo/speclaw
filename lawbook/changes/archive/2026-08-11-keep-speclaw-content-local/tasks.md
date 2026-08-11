# Tasks — keep speclaw's regenerable content local

- [x] **Step 0: Create the feature branch (must be first).**
      `feat/keep-speclaw-content-local`.

- [x] Gitignore `ai-specs/` in `scaffold()` (`src/modules/foundation/scaffold.ts`),
      alongside the existing `.speclaw/` and `*.bak` entries. This is the only
      path speclaw adds to `.gitignore`.

- [x] Leave the agent IDE directories alone: `configureAgent`
      (`src/shared/agents.ts`) still creates the symlinks but adds **no**
      `.gitignore` entry for `.claude/`, `.cursor/`, etc. — a user's own
      skills/commands there stay committable.

- [x] Add a git-tracking detection helper (`src/shared/git.ts`: `isGitRepo` +
      `listTrackedPaths` via `git ls-files`) that reports whether `ai-specs/` is
      still tracked.

- [x] Call the helper from `runInit` (`src/cli/commands/init.ts`) and
      `applyProjectMigrations` (`src/cli/commands/update.ts`) via
      `reportTrackedLocalContent` (`src/cli/lib/untrack.ts`); when `ai-specs/`
      is tracked, print `git rm -r --cached ai-specs`. Never modify the git index.

- [x] Apply to this repo: add `ai-specs/` to `.gitignore` and untrack the
      tracked `ai-specs/` files (`git rm -r --cached ai-specs`) — the authored
      source is in `src/modules/*/assets/`. The repo's `.claude/*` symlinks stay
      committed. (15 index deletions staged; files remain on disk.)

- [x] **Review and update the affected tests.** `test/unit/git.test.ts` (new);
      `test/unit/agents.test.ts` (guard: configureAgent leaves the IDE dir out of
      `.gitignore`); `test/integration/scaffold.test.ts` (`ai-specs/` ignored).

- [x] **Run the quality gates and verify they pass**: `npm run check` ✅,
      `npm run build` ✅, `npm run test` ✅ (129 pass / 0 fail; coverage 97.90%
      lines, new/touched files 100%).

- [x] **Perform manual verification of the behavior — the agent executes this
      itself, never the user.** Built CLI in throwaway temp dirs: fresh `init`
      (`ai-specs/` ignored, no `.claude/*` entries, symlinks still created); a
      user's own `.claude/skills/my-skill.md` stays committable and is not
      clobbered; `update --migrate-only` on an old install prints
      `git rm -r --cached ai-specs` only and leaves the git index untouched. See
      `reports/backend.md`.

- [x] **Produce the discipline reports under `reports/`** — `reports/backend.md`.

- [x] **Update the technical documentation touched by the change**: README
      "What lands in your project" (committed vs. local; IDE dirs left to the
      user) and "Staying up to date"; the `init` handoff tip.

- [x] **Archive the change within the same PR** (`lawbook:archive`).
