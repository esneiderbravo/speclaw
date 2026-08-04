# Backend checks — reuse-canonical-capabilities (2026-08-04)

Date: 2026-08-04 · Branch: `feat/reuse-canonical-capabilities` · Environment:
local macOS, cwd `/Users/esneiderbravo/Projects/speclaw`, Node ≥ 22.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Format + lint | `npm run check` | ✅ Prettier "All matched files use Prettier code style!" + ESLint clean (after `prettier --write src/cli/commands/lawbook.ts`) |
| Type-check + build | `npm run build` | ✅ `tsc` strict clean; `copy-assets: copied assets for 3 module(s)` |
| Tests + coverage | `npm run test` | ✅ `tests 124 · pass 124 · fail 0`; all-files 97.87% lines / 91.99% branches / 98.15% funcs; `engine.js` 99.46% lines / 94.38% branches (floor 80%) |

## Tests added / updated

In `test/unit/engine.test.ts` (all new — added `TWO_REQ_SPEC` fixture and a
`seedDelta` helper):

- **"specValidate warns when a delta capability resembles an existing one"** —
  canonical `transfers`, delta under `transfer`; asserts `valid: true` (warnings
  never block) and a warning naming `transfers`. Covers the near-match branch.
- **"specValidate warns when a delta drops a canonical requirement"** — exact
  name `transfers`, delta keeps only `Alpha`; asserts a warning "drops 1
  requirement(s) … (Beta)". Covers the dropped-requirement branch.
- **"specValidate raises no divergence warning for an exact-name delta that keeps
  every requirement"** — asserts `warnings` is empty. Covers the clean path.
- **"specSync classifies each promoted spec as created or updated"** —
  pre-existing canonical `cap` + new `new`; asserts `updated` and `created` split
  and `promoted.length === 2`. Covers the created/updated classification.

Existing `specSync`/`specValidate` tests are unchanged and still pass —
`promoted` kept its `string[]` shape (the created/updated split is additive).

## Spec-scenario coverage

New requirements introduced by this change:

| Scenario | Verified by |
|----------|-------------|
| Draft refreshes the index before locating code | `draft/SKILL.md` Step 1 (index-first) — doc/manual |
| Explore refreshes the index before investigating | `explore/SKILL.md` (index-first) — doc/manual |
| A change to existing behavior reuses the canonical capability name | `draft/SKILL.md` Step 2 + unit "resembles an existing one" + manual CLI |
| A genuinely new capability is introduced deliberately | `draft/SKILL.md` Step 2 — doc; manual CLI `refunds` created |
| Updating a capability preserves its existing requirements | `draft/SKILL.md` Step 3 + unit "drops a canonical requirement" + this change's own delta (carried all 7 canonical requirements) |
| Near-duplicate capability name raises a warning | unit "resembles an existing one" + manual CLI (`validate near`) |
| Dropping a canonical requirement raises a warning | unit "drops a canonical requirement" + manual CLI (`validate drop`) |
| An exact-name delta that keeps all requirements raises no such warning | unit "raises no divergence warning" |
| A new capability is reported as created | unit "classifies … created or updated" + manual CLI (`sync` → `created: refunds`) |
| An existing capability is reported as updated | unit "classifies … created or updated" + manual CLI (`sync` → `updated: transfers`) |

The seven carried-over requirements (sync reconciliation, reports folder,
per-discipline reports, report structure, verification data-safety, archive gate,
archive drift reconciliation) are unchanged behavior; they remain covered by the
pre-existing `test/unit/engine.test.ts` and integration suites, which still pass.

## Manual verification

Ran the built CLI (`node dist/cli/index.js lawbook …`) in a `mktemp -d` scratch
repo (isolated by construction — the real `lawbook/` was never touched; the temp
dir was removed at the end):

- `lawbook validate near` → valid + advisory warning: `capability "transfer" …
  resembles "transfers"`.
- `lawbook validate drop` → valid + advisory warning: `delta drops 1
  requirement(s) … (Beta)`.
- `lawbook sync drop` → `created: lawbook/specs/refunds/spec.md` and
  `updated: lawbook/specs/transfers/spec.md`.

No real data store is involved (the module is filesystem-only under `lawbook/`);
verification used a throwaway temp workspace.

## Pre-existing / unrelated failures

None. All 124 tests pass; the only red before this change was a Prettier style
warning on `src/cli/commands/lawbook.ts`, fixed with `npm run format`-equivalent.

## Pending manual steps

None automated away for a human. Propagating the updated skills into consumer
repos (e.g. `cashbook`) is a follow-up in each consumer (upgrade
`@esneiderbravo/speclaw` + re-scaffold), out of scope here (see proposal
non-goals).

## Verdict

✅ All gates green (124/124 tests, coverage well above floor), behavior verified
end-to-end in an isolated workspace. Ready to sync and archive.
