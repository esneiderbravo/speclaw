# Keep speclaw's regenerable content local (not committed)

## Why

speclaw installs its workflow content into a project under `ai-specs/`
(skills, commands, rules, agent packs, and the `.speclaw.json` manifest) and
wires each agent's IDE directory to it with relative symlinks
(`.claude/skills -> ../ai-specs/skills`, and the same for `.cursor`, `.codex`,
`.windsurf`, `.agents`). Today all of that is committed to git.

That content is **fully regenerable** from the package: `installWorkflow` /
`installPack` copy it out of `src/modules/*/assets/`, and `configureAgent`
recreates the symlinks and MCP config. Committing it therefore duplicates the
package inside every consuming repo and produces churn in git on every
`speclaw update` (the managed-file refresh rewrites those tracked files). The
symlinks are a per-checkout mechanism, not shared source.

We want to treat *that* content the way a dependency is treated (like
`node_modules`): ignore only `ai-specs/`, and reconstruct it locally with
`speclaw init` / `speclaw update`. The agents keep reaching it through the
existing symlinks. Only the *personalized* source stays in git (`LAWS.md`,
`CLAUDE.md`, `AGENTS.md`, `docs/standards/*`, `docs/compass.md`, `lawbook/`).

Crucially, we **do not** touch the agent IDE directories in `.gitignore`. Many
projects are already set up with their own skills/commands under `.claude/`,
`.cursor/`, etc.; ignoring those paths would stop a user committing their own
content. Ignoring just `ai-specs/` is enough — the regenerable speclaw content
stays out of git while everyone keeps full control of their `.claude`/`.cursor`.

## What

- On `speclaw init` and `speclaw update`, ensure `.gitignore` ignores
  `ai-specs/` (which also covers the local `.speclaw.json` manifest). That is
  the only path speclaw adds.
- Leave the agent IDE directories (`.claude/`, `.cursor/`, …) and their
  symlinked subdirectories out of `.gitignore` entirely — their git-tracking is
  the user's decision. The symlinks into `ai-specs/` are still created as today.
- For projects that are **already installed** (`ai-specs/` already tracked by
  git), detect that and print the exact `git rm -r --cached ai-specs` command
  for the user to run. speclaw MUST NOT modify the git index itself (adding to
  `.gitignore` does not untrack already-tracked files; untracking is a git-index
  change the user authorizes and runs).
- Apply the same treatment to this repository's own dogfooded `ai-specs/` (the
  authored source lives in `src/modules/*/assets/`, so untracking the generated
  copy here is safe). The repo's `.claude/*` symlinks stay committed.

## Non-goals

- Changing where the authored content lives (`src/modules/*/assets/`) or how it
  is rendered/copied.
- Changing what is committed as personalized source
  (`LAWS.md`, `CLAUDE.md`, `AGENTS.md`, `docs/standards/*`, `docs/compass.md`,
  `lawbook/`) — unchanged.
- Gitignoring or otherwise dictating the git-tracking of the agent IDE
  directories — a user's own skills/commands there stay committable.
- Auto-running `git rm --cached` on the user's behalf.
- Migrating away from symlinks or changing the MCP-config gitignore (already
  handled by `writeMcpConfig`).

## Migrations

No manifest/schema migration. The behavior lands in `scaffold()`, which both
`init` and `update` call, so already-installed projects pick up the new
`.gitignore` entries on their next `speclaw update`. The one manual step for
existing projects — untracking already-committed content — is surfaced as
printed `git rm -r --cached` instructions rather than an automatic step.
