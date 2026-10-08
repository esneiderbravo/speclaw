# compass-map-not-work

## Why

In ftd-admin-finanzas the Stop hook archived an empty change (`2026-10-08-far-1934-receive-teammate-order`):
the branch had no work, but a session-start re-index had rewritten the generated map block of
`docs/compass.md`, and ship read that as the agent's change. The agent could not delete the
leftover archive (permission), so it stayed for the user to clean up.

## What changes

- The branch diff and the work fingerprint ignore `docs/compass.md` when it differs from the
  merge base only inside `<!-- speclaw:map:start -->…<!-- speclaw:map:end -->`.
- The map-block helpers move to `shared/compass-map.ts` (re-exported from `foundation/lock.ts`)
  so the lawbook can use them without a module cycle.

## Impact

- `lawbook/ship.ts`, `shared/compass-map.ts`, `foundation/lock.ts`.
- Measured as level 3 because ship measures the whole branch, which also carries
  `doc-hint-background`; this change itself is small.
