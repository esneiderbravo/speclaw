# Design — compass-map-not-work

## Approach

- Compare `docs/compass.md` at the merge base (`git show base:docs/compass.md`) with the
  worktree after `stripCompassMapBlock` on both; equal → not work. Missing base copy or markers
  → treated as work (never hides a real edit).
- The fingerprint hashes the stripped text for that file, so a later re-index does not count
  as new work either.
- Helpers live in `shared/` because `lawbook` must not import `foundation` (no module cycles).
