# Design — opt-in refresh backups

## Approach

The `.bak` is written in one place: the diverged branch of `copyRendered`
(`src/shared/install.ts`), when `opts.overwrite` is set and the destination
differs from its recorded baseline. Gate that copy behind a new
`CopyOpts.backup` flag (default `false`).

Divergence still needs to be *reported* even when no backup is written — the
user must know which of their edits were overwritten so they can recover from
git. Today `update` reports from `report.backedUp`. Split the concept:

- `report.backedUp` — files that got a `<file>.bak` (only when `--backup`).
- `report.refreshedDiverged` — files that had local edits and were overwritten
  (always populated when a diverged managed file is refreshed).

`update` then reports:
- with `--backup`: "had local edits — saved as `<file>.bak` before refreshing."
- default: "had local edits — overwritten; recover with `git diff` / restore, or
  re-run with `--backup` to keep a `.bak`."

Threading the flag:
`runUpdate(flags)` reads `flags.backup` → `applyProjectMigrations(cwd, backup)`
→ `scaffold(cwd, …, { refreshManaged: true, backup })` → `managedOpts.backup` →
`copyRendered`.

Gitignore: add `ensureGitignore(projectPath, "*.bak", "speclaw refresh backups", report)`
alongside the existing `.speclaw/` entry in `scaffold`. A trailing-slash-free
`*.bak` matches at any depth, so one entry covers the whole tree. It is
idempotent, so re-running update never duplicates it.

## Alternatives weighed

- **Persist a `backupOnRefresh` preference in config/manifest, asked once at
  init.** Rejected in explore in favour of a flag: a per-run flag keeps `update`
  stateless and scriptable, and the default (no backup) is safe because git is
  the real backup. A config knob is more machinery for a rare need.
- **Interactive prompt each update.** Rejected: breaks CI / non-interactive runs
  and nags for the common case where the user never edited the managed file.
- **Keep `.bak` always, just gitignore it.** Rejected: the clutter on disk
  remains, and the redundancy with git is the actual complaint.

## Trade-offs

- The default now discards a diverged managed file's on-disk copy (git still has
  it). Accepted and mitigated: `update` explicitly reports every diverged file
  it overwrote and names `--backup` as the opt-in — no silent loss.
- `report.refreshedDiverged` is a new field on `InstallReport`; any consumer that
  read `backedUp` for "diverged" semantics must move to the new field. Only
  `update.ts` reads it today.

## Files touched

- `src/shared/install.ts` — `CopyOpts.backup`, new `InstallReport.refreshedDiverged`,
  gate the `.bak` copy, always record divergence.
- `src/modules/foundation/scaffold.ts` — thread `backup` into `managedOpts`;
  add the `*.bak` gitignore entry.
- `src/cli/commands/update.ts` — parse `--backup`; thread it; update the
  divergence-reporting messages.

## Version coordination

This change does **not** bump `package.json` — it adds no `MIGRATIONS` entry, and
its behavior ships with the package code while the `*.bak` gitignore auto-applies
on the next `speclaw update`. The single `0.1.13` bump lives in the
`professional-discipline-reports` change (whose migration is tagged `0.1.13` and
must ship at that version). That change merges **last** so its version bump is
the one release/deploy trigger; this change merges **first**, on `0.1.12`.
