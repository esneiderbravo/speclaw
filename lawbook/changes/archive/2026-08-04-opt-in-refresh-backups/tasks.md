# Tasks — opt-in refresh backups

- [x] **Step 0: Create the feature branch (must be first).**
      `feat/opt-in-refresh-backups` off `main`.

- [x] **1. Gate the `.bak` copy behind a `backup` flag in `install.ts`.**
      Add `backup?: boolean` to `CopyOpts` (default false) and
      `refreshedDiverged: string[]` to `InstallReport` (+ `emptyReport`). In the
      diverged branch of `copyRendered`, always push to `refreshedDiverged`; only
      copy to `<file>.bak` and push to `backedUp` when `opts.backup` is true.
      Update the doc comments.

- [x] **2. Thread `backup` and add the `*.bak` gitignore in `scaffold.ts`.**
      Extend `scaffold`'s opts with `backup?: boolean`; set `managedOpts.backup`.
      Add `ensureGitignore(projectPath, "*.bak", "speclaw refresh backups", report)`
      next to the existing `.speclaw/` entry.

- [x] **3. Add `--backup` and fix the divergence messages in `update.ts`.**
      Parse `flags.backup`; pass it through `applyProjectMigrations` into
      `scaffold({ refreshManaged: true, backup })`. Report `report.backedUp` with
      the ".bak saved" wording; report `report.refreshedDiverged` (minus any
      already in `backedUp`) with "overwritten — recover from git, or re-run with
      `--backup`". No version bump — the single `0.1.13` bump ships via the
      `professional-discipline-reports` change (the deploy PR, merged last).

- [x] **4. Review and update the affected tests.**
      No unit runner exists yet (see testing standard). If any `node:test`
      fixture exercises `copyRendered`/`scaffold` backup behavior, update it;
      otherwise record that coverage is the end-to-end exercise below.

- [x] **5. Run the quality gates and verify they pass.**
      `npm run check` (Prettier + ESLint) and `npm run build` (strict `tsc` +
      copy-assets). Both green (see docs/standards/testing-standards.md).

- [x] **6. Perform manual verification — the agent executes this itself.**
      On a scratch project: init, edit one managed skill file, then
      (a) `speclaw update` → file refreshed, **no** `.bak`, message says
      overwritten + names `--backup`, `.gitignore` contains `*.bak`;
      (b) repeat with `speclaw update --backup` → `.bak` written and reported;
      (c) an untouched managed file is refreshed silently with no `.bak` either way.

- [x] **7. Produce the discipline reports under `reports/`.**
      Write `reports/backend.md` following the required report structure
      (header, gates table, tests-added, spec-scenario coverage for this change's
      scenarios, pre-existing failures, pending manual, verdict).

- [x] **8. Update the technical documentation touched by the change.**
      Update `README.md` where it documents the `.bak`-on-refresh behavior to
      describe the new default + `--backup` flag + gitignored `*.bak`.

- [x] **9. Archive the change within the same PR (`lawbook:archive`).**
      Run `sync` then `archive` after gates are green and reports are present.
