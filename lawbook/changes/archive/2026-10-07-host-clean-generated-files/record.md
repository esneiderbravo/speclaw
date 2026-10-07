# host-clean-generated-files

**Level:** 0 (proposed: n/a, confirmed by: human)
**Why:** 0 file(s), 0 module(s), 0 affected test(s), 0 blast node(s), no public API, no global file, hotspot=0.00, degraded:[no-targets] → score 0 → level none (cuts 3/8/15)

## What changes

Generated files stay clean in host repos: lawbook JSON (change.json, harness.json, anchors) is written in Prettier's layout via shared formatJson; .gitignore entries sharing a comment join one block; and the generated AGENTS.md block states the Compass-first + Cortex workflow when the hand-written file lacks it, since update never edits personalized AGENTS.md.

## Steps

- [x] Make the fix
- [x] Add or update a regression test
- [x] Record evidence under reports/

## Evidence

- `reports/` — add a discipline report before archive
