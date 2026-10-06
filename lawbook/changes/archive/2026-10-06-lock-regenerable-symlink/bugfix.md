# Bugfix: lock-regenerable-symlink

**Level:** 1 · **Type:** bug · **Severity:** normal

## 1. Observed symptom

In a consumer repo, every `speclaw update` rewrites `speclaw.lock`:

```diff
-  "symlinks": {},
+  "symlinks": {
+    ".claude/rules/speclaw": {
+      "target": "../../ai-specs/rules"
+    }
+  },
```

Once that lock is committed, the repo's CI fails `speclaw verify`.

## 2. Minimal reproduction

1. In a scratch project with Claude configured, run `speclaw update` (or
   `speclaw laws compile` / `speclaw laws lock`). `ensureClaudeRulesSymlink`
   creates `.claude/rules/speclaw -> ../../ai-specs/rules`, and the lock refresh
   pins it under `symlinks`.
2. Delete `.claude/rules/speclaw`. This simulates a clean CI clone of a repo
   that ignores the link, as this repo does in `.gitignore`. The scaffold
   itself gitignores only `ai-specs/`, so where the link is committed it
   dangles on a clean clone instead.
3. `speclaw verify` → `integrity~symlink~1` error "Managed symlink missing",
   non-zero exit.

When the lock is refreshed on a machine without the link, `symlinks` flips back
to `{}`, so the file churns between machines.

## 3. Root cause

`discoverIntegrityPaths` (`src/modules/foundation/lock.ts:190`, symlink probe at
line 229) reports `.claude/rules/speclaw` whenever it exists on disk.
`snapshotLockEntries` (`src/modules/foundation/lock.ts:308`) pins it in
`lock.symlinks`. `verifyIntegrity` (`src/modules/foundation/integrity.ts:66`) then
treats a missing pinned symlink as a strict error. That link is a regenerable
IDE mirror of the gitignored `ai-specs/rules`, the same class as `.cursor/rules/`
that `isRegenerableIdeMirror` already excuses for files. Symlinks never got that
exemption.

## 4. Blast radius

`discoverIntegrityPaths` callers: `snapshotLockEntries` → `refreshLockfile`
(callers: `scaffold`, `compileLaws`, `runLaws`); `verifyIntegrity` (`speclaw
verify`, `laws scan`); `scanAll`; doctor `integrityChecks`. The lock format is
unchanged (`symlinks` stays a map).

## 5. Proposed fix

- `snapshotLockEntries` stops pinning symlinks that are regenerable IDE mirrors.
  `.claude/rules/speclaw` is classified as one in `isRegenerableIdeMirror`, so
  refreshed locks keep `"symlinks": {}` on every machine.
- `verifyIntegrity`: a lock entry for a regenerable mirror symlink (left over in
  locks written by older versions) that is missing only **warns**, as missing
  mirror files already do. A non-mirror managed symlink keeps the strict
  missing/retarget errors.
- Discarded: committing `.claude/rules/speclaw` instead of ignoring it. That
  doesn't work, because the link targets the gitignored
  `ai-specs/` and would dangle in CI anyway.

## 6. Regression test

`test/unit/integrity.test.ts`:

- refreshing the lock with `.claude/rules/speclaw` present writes `symlinks: {}`
- verify with a legacy lock pinning `.claude/rules/speclaw` and the link absent
  is ok, with a warning instead of an error

Both must fail before the fix.

## 7. Prevention

Spec delta on `req~integrity-verify~1`: regenerable IDE mirror symlinks are not
pinned in `speclaw.lock`, and a missing legacy entry warns only.
