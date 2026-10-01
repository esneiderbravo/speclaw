# update-no-global

**Level:** 0 (proposed: 0, confirmed by: human)
**Why:** 0 file(s), 0 module(s), 0 affected test(s), 0 blast node(s), no public API, no global file, hotspot=0.00 → score 0 → level 0 (cuts 3/8/15)

## What changes

`speclaw update` no longer runs `npm install -g` (EACCES on locked global npm).
Default path is project migrations only; a newer npm version prints an advisory
and binary-upgrade hint (`npm i -g …` or prefer `npx @…@latest update`), then
still migrates. `--check` is version-only; `--migrate-only` is a silent alias.

## Steps

- [x] Make the fix
- [x] Add or update a regression test
- [x] Record evidence under reports/

## Evidence

- `reports/` — add a discipline report before archive (tester)
- Unit: `test/unit/update.test.ts` — no `spawnSync`/`npm install -g`; hooks prove
  migrate-on-update and `--check` / `--migrate-only` behavior
- Docs: README + CLI help + `upgradeNotice` + init stale tip

## Notes

- Package bumped to **2.0.1** so npm Trusted Publishing ships this fix
  step per conventions; coordinator/release owner should bump when shipping.
