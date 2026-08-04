# Reuse canonical capabilities on draft

## Why

speclaw's `sync` promotes a change's delta specs into the canonical specs by a
**whole-file copy keyed on the capability folder name** (`specSync` →
`fs.copyFileSync(delta, canonical)` in `src/modules/lawbook/engine.ts`). Two gaps
in the surrounding workflow let a change silently diverge from the source of
truth:

1. **Accidental capability forks.** `draft` never consults the existing canonical
   capabilities. When a change touches behavior that already has a canonical
   spec but the drafter names its delta folder slightly differently
   (`transfer` vs `transfers`, `global66-transfers` vs `transfers`), `sync`
   writes a **new** `lawbook/specs/<new-name>/spec.md` and leaves the real
   capability untouched — it "doesn't update." You end up with near-duplicate
   specs and the true one goes stale. Nothing warns about it: `specValidate`
   only checks normative language, and `specArchivePreconditions` only checks the
   same-named canonical, which a freshly-forked folder trivially satisfies.

2. **Silent requirement loss.** Because `sync` overwrites the whole file, a delta
   must carry the capability's *full* intended spec. A delta that contains only
   the new requirement (natural if "delta" is read as "just the diff") silently
   drops every other requirement from the canonical on promotion. Nothing warns.

Separately, `draft` and `explore` only run `compass_index` "if missing", so both
can reason over a **stale** graph — the wrong footing for locating the real code
and, for `draft`, for judging which capability a change belongs to.

## What

Ground drafts (and explores) in the current, real state of the project — a fresh
index and the existing canonical capabilities — and make promotion divergence
visible, without changing the deterministic whole-file `sync` mechanic.

- **`draft`** lists the canonical capabilities first, reuses the **exact** name
  when a change modifies existing behavior, introduces a new capability only
  deliberately for a genuinely distinct behavior area, and, when updating an
  existing capability, starts the delta from the **current canonical content**.
- **`draft` and `explore`** refresh the code index (`compass_index`, incremental
  by hash) before understanding the code.
- **`lawbook_validate`** emits **advisory warnings** (non-blocking) when a delta
  capability is a near-match of an existing canonical one, and when a delta drops
  `### Requirement:` headers present in the matching canonical.
- **`lawbook_sync` / `lawbook_archive`** report which capabilities were **created**
  (new file) versus **updated** (overwrote an existing one), so a silent fork is
  visible in the promotion output.

## Non-goals

- Changing the `sync` model. It stays a deterministic, code-blind whole-file copy
  (per the `reconcile-specs-on-sync` law: `lawbook_sync` MUST NOT inspect code).
  Comparing capability **names** and requirement **headers** is not code
  inspection.
- Auto-merging delta requirements into the canonical, auto-renaming capabilities,
  or hard-blocking a new capability. The near-duplicate and dropped-requirement
  signals are advisory — a new capability or a real `REMOVED` requirement is
  sometimes correct; the author decides.
- Propagating the updated skills into consumer repos (e.g. `cashbook`). Those pick
  up the change when they upgrade `@esneiderbravo/speclaw` and re-run scaffold;
  that is a follow-up in each consumer, not part of this change.

## Migrations

None. No data store, no persisted schema — engine, CLI, and skill-asset changes
only.
