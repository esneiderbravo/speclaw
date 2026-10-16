# harness-stage-times

**Level:** 1 (proposed: 1, confirmed by: measured)
**Why:** 3 file(s), 2 module(s), 39 affected test(s), 108 blast node(s), no public API, no global file, hotspot=0.33 → score 12 → level 1 (cuts 5/16/25)

## What changes

fix(lawbook): time harness stages from their evidence, not the stop

The stop wrote harness.json in one burst, so every stage carried the same
second. Ship now stamps each stage with the time its evidence shows: the
first Compass lookup or edit since the branch began, the first edit, the
level's confirmation, and the gates' own start and end — never earlier than
the entry before it. At level 1+ the stop records the work up to
implementing; review stays with the PR.

## Steps

- [x] Make the change
- [x] Add or update tests
- [x] Record evidence under reports/

## Evidence

- `reports/` — add a discipline report before archive
