# release-on-publish

**Level:** 0 (proposed: 1, confirmed by: human)
**Why:** 1 file(s), 1 module(s), 0 affected test(s), 0 blast node(s), no public API, global file, hotspot=0.01 → score 5 → level 1 (cuts 3/8/15) — quick forced level 0; promote if scope grows

## What changes

`publish.yml` published to npm but never created the `v<version>` tag or the
GitHub release, so 2.0.4 shipped without either. A new idempotent step now tags
the version and creates the release from its `CHANGELOG.md` section, checking
the notes before tagging. Permissions move to `contents: write`.

## Steps

- [x] Make the fix
- [x] Add or update a regression test — no workflow test runner; the step was
  simulated locally with stubbed `git`/`gh` (see `reports/infra.md`)
- [x] Record evidence under reports/

## Evidence

- `reports/infra.md`
