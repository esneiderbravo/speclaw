# ship-on-stop-archived

**Level:** 0 (proposed: n/a, confirmed by: human)
**Why:** 0 file(s), 0 module(s), 0 affected test(s), 0 blast node(s), no public API, no global file, hotspot=0.00, degraded:[no-targets] → score 0 → level none (cuts 3/8/15)

## What changes

The Stop hook no longer re-ships committed work (fingerprint = diff against the merge base, not HEAD), ships the change last shipped by name on the branch instead of the branch-named one (marker records branch + change), and hashes untracked file contents. Before, it rewrote an archived change's report with another change's files.

## Steps

- [x] Make the fix
- [x] Add or update a regression test
- [x] Record evidence under reports/

## Evidence

- `reports/` — add a discipline report before archive
