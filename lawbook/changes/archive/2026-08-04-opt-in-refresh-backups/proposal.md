# Opt-in refresh backups

## Why

When `speclaw update` refreshes a managed file (a skill, command, rule, or agent
pack under `ai-specs/`) that has diverged from the version speclaw last wrote,
it copies the current file to `<file>.bak` before overwriting it
(`src/shared/install.ts`). That backup is always created and is **not**
gitignored, so `.bak` files accumulate in the tree and can be committed by
accident.

Managed files are speclaw-owned by design — the whole point of the managed
refresh is that speclaw regenerates them from the template. In a git repo, the
prior content is already recoverable with `git diff` / `git checkout`, so the
`.bak` is redundant safety that mostly produces clutter. Users rarely edit these
internal files, so a backup on every refresh is noise for the common case.

## What

- Make `.bak` **opt-in**: by default `speclaw update` overwrites a diverged
  managed file **without** writing a `.bak`, and still reports which files it
  refreshed so the user can recover via git.
- Add a `--backup` flag to `speclaw update` that restores the current behavior
  (write `<file>.bak` before overwriting a diverged managed file).
- Gitignore `*.bak` unconditionally, so a backup — whether from `--backup` or
  from an external tool — is never committed.

## Non-goals

- No change to how divergence is detected (still the manifest baseline hash).
- No change to personalized-file handling — those are never overwritten and this
  change does not touch them.
- No interactive prompt on every update (rejected in explore: it would break
  non-interactive / CI use).

## Migrations

None needed as a `MIGRATIONS` entry. The `*.bak` gitignore line is added by
`ensureGitignore`, which runs on every `scaffold` — including the
`refreshManaged` path that `update` already executes — so existing projects get
the ignore rule on their next `speclaw update`. The behavior change ships with
the upgraded package. This change does **not** bump `package.json`: the single
`0.1.13` release bump ships via `professional-discipline-reports` (whose
migration requires that version), which merges last as the deploy trigger.
