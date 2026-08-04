# Backend report — add-reports-and-archive-gates

Scope: the engine archive gate (`specArchivePreconditions` + its wiring into
`specArchive`) and the mandatory-step / reports scaffolding. speclaw has no
`node:test` runner yet (see `docs/standards/testing-standards.md`), so coverage
here is the compile-time gates plus an executable end-to-end exercise of the
built engine — not a unit suite. Wiring `node:test` + a `test` script is a
separate change.

## Quality gates

- `npm run check` (Prettier `--check` + ESLint) → **pass** — "All matched files
  use Prettier code style!" (engine.ts reflowed via `npm run format`).
- `npm run build` (`tsc` strict + `copy-assets`) → **pass** — no type errors;
  "copied assets for 3 module(s)".

## Integration / end-to-end (built engine, scratch workspace)

Driver: a Node script against `dist/modules/lawbook/engine.js`, creating a temp
lawbook workspace and a `demo` change, then calling
`specArchivePreconditions` / `specArchive` / `specSync`. Maps 1:1 to the
`lawbook-workflow` delta-spec scenarios.

| Scenario (spec) | Setup | Observed | Verdict |
| :-- | :-- | :-- | :-- |
| Unchecked task blocks archive | one `- [ ]` in tasks.md | blocker `1 unchecked task(s) in tasks.md` | ✅ |
| Missing reports block archive | no `reports/` | blocker `no discipline report under reports/` | ✅ |
| README scaffold is not a report | `reports/README.md` only | still blocked (README excluded) | ✅ |
| Unsynced specs block archive | delta ≠ canonical (missing) | blocker `spec not synced: … (run sync first)` | ✅ |
| Archive refuses while blocked | all three above | `specArchive` **throws** with the reason list | ✅ |
| A complete change archives | tasks checked + `backend.md` + `sync` run | blockers `[]`; archived to `…/archive/2026-08-04-demo`; no active change left | ✅ |

Raw output of the run is in the build transcript (each step printed its
`specArchivePreconditions` result, the thrown error, and the successful archive
path).

## Notes

- The gate is enforced in `specArchive`, which both the `lawbook_archive` MCP
  tool and the CLI (`runSpec`) call — so both entry points are covered by one
  check (verified by inspection of `register.ts` / `cli/commands/lawbook.ts`
  callers).
- Frontend: none — this change touches no UI. `frontend.md` intentionally
  omitted (the gate requires a relevant report, not a fixed set).
