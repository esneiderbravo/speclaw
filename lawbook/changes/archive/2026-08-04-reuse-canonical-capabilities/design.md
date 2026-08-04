# Design — reuse-canonical-capabilities

## Approach

Two engine additions plus skill-guidance edits. The `sync` copy stays untouched.

### Engine (`src/modules/lawbook/engine.ts`)

- **Canonical helpers (new, private):**
  - `canonicalCapabilities(root): string[]` — directory names under
    `lawbook/specs/` (reuse the `dirsIn` pattern already in `specList`).
  - `requirementHeaders(markdown): string[]` — the `### Requirement:` titles in a
    spec file (regex `/^###\s+Requirement:\s*(.+)$/gm`).
  - A small edit-distance (Levenshtein) helper for near-match detection; "near"
    = distance ≤ 2 and not equal (covers `transfer`↔`transfers`,
    `account`↔`accounts`). Kept local and dependency-free.

- **`ValidationResult` gains `warnings: string[]`.** `specValidate` populates it:
  for each delta capability (the first path segment under the change's `specs/`),
  if it is not a canonical capability but is a near-match of one → near-duplicate
  warning; if it *is* a canonical capability → diff requirement headers and warn
  on any canonical header missing from the delta. `valid` remains driven by
  `issues` only, so warnings never block.

- **`SyncResult` gains `created: string[]` and `updated: string[]`** (paths, split
  by `fs.existsSync(dest)` *before* the copy); `promoted: string[]` stays
  unchanged so existing callers/tests keep working. `ArchiveResult` surfaces the
  same two lists. `specSync`'s copy call is unchanged.

### CLI (`src/cli/commands/lawbook.ts`)

- `validate`: after issues, print warnings under a distinct heading; a change with
  only warnings still reports as valid.
- `sync` / `archive`: annotate each promoted path with `created`/`updated` (by
  membership in the two lists).

### Register (`src/modules/lawbook/register.ts`)

- Update the `lawbook_validate` and `lawbook_sync` tool descriptions to mention
  the advisory warnings and the created/updated distinction. Results already
  serialize via `text(...)`, so the new fields surface automatically.

### Skills (`src/modules/lawbook/assets/skills/` — packaged source of truth)

- `draft/SKILL.md`: Step 1 runs `compass_index` for freshness (not only when
  missing); a new sub-step lists canonical capabilities (`lawbook_list`) and
  reuses the exact name for existing behavior; Step 3 says to start an
  existing-capability delta from the current canonical content.
- `explore/SKILL.md`: run `compass_index` for freshness before investigating.
- `sync/SKILL.md`: note that the promotion report now flags created vs updated.

After editing the asset sources, refresh speclaw's own `ai-specs/skills/` (its
symlinked copies) so the repo dogfoods the update.

## Alternatives weighed

- **Hard-block near-duplicate / dropped requirements in `specValidate`.** Rejected:
  a new capability and a real `REMOVED` requirement are legitimate; the
  `reconcile-specs-on-sync` law favors advisory recommendations over hard blocks.
  Warnings keep the human in control.
- **Auto-merge delta requirements into the canonical (OpenSpec-style ADDED/
  MODIFIED/REMOVED).** Rejected for this change: it replaces the whole-file model
  and is a much larger design. The whole-file model plus "start the delta from the
  canonical" reaches the same safety with far less surface.
- **Auto-rename a near-duplicate to the matched canonical.** Rejected: guessing the
  author's intent risks clobbering a deliberately new capability. Warn, don't act.
- **Fuzzy-match capabilities inside `lawbook_sync`.** Rejected: `sync` must stay a
  deterministic, code-blind copy. Name/header comparison lives in `validate`
  (advisory) and the created/updated split is a pure path check.

## Trade-offs

- Edit-distance ≤ 2 is a heuristic: it can miss a very different rename or flag an
  unrelated short name. Acceptable — it is advisory and the author judges it.
- `SyncResult`/`ArchiveResult` grow two fields but keep `promoted` intact, so the
  change is additive — no existing caller or test needs to change for the shape.
