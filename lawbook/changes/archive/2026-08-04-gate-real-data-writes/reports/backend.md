# Backend checks — gate-real-data-writes (2026-08-04)

Date: 2026-08-04 · Branch: `feat/gate-real-data-writes` · Environment:
Node/TypeScript CLI, commands run from the repo root and against a temp scratch
project (`node dist/cli/index.js …`). No real data store was touched — the
exercise ran only on throwaway scratch projects, which is exactly the rule this
change introduces.

Scope: the real-data-write stop condition — `build` skill Step 4, the testing
and base standards, `CLAUDE.md`/`AGENTS.md` Rule 6 (shipped templates + repo
dogfood copies), the `0.1.14` migration prompt, and the version bump.

## Gates & results

| Check | Command | Result |
| :-- | :-- | :-- |
| Lint + format | `npm run check` (Prettier `--check` + ESLint) | ✅ "All matched files use Prettier code style!", ESLint clean |
| Type-check + compile | `npm run build` (`tsc` strict + copy-assets) | ✅ no type errors; "copied assets for 3 module(s)" |

speclaw has no `node:test` runner yet (see `docs/standards/testing-standards.md`),
so coverage is the two compile-time gates plus the end-to-end CLI exercise below.

## Tests added / updated

None. This change edits skill/standard/constitution text, one `MIGRATIONS`
entry, and the package version — no runtime code path with unit coverage, and no
`node:test` fixture governs the text (no runner is wired). `tsc` structurally
validates the new `MIGRATIONS` entry. Behavior is verified end-to-end below.

## Spec-scenario coverage

Delta spec: `specs/lawbook-workflow/spec.md`. Scenarios **(new)** are introduced
by this change; the rest restate unchanged workflow behavior carried in the full
delta and are untouched here.

| Scenario | Verified by |
| :-- | :-- |
| Verification is isolated from real data by default **(new)** | `build` SKILL Step 4 + testing standard now mandate isolation; **this change's own verification** used only scratch projects/temp dirs — no real store touched |
| A real-data write is gated on explicit authorization **(new)** | Rule 6 (CLAUDE.md/AGENTS.md) + base-standards bullet now list real-store writes as a stop condition; text inspection, shipped == dogfood |
| Raw store commands not run against a live store unprompted **(new)** | Step 4 + testing standard explicitly forbid raw store commands (e.g. direct SQL) against a live store without authorization |
| The report records how verification stayed safe **(new)** | This report's header + this table record that verification ran only on scratch projects |
| Draft scaffolds reports / build produces reports / required structure / honest pre-existing failures / every scenario accounted for | Unchanged (shipped 0.1.13); this report follows the required structure |
| Sync reconciles; archive gates (unchecked/missing-reports/README-only/unsynced/complete); archive reconciles drift | Unchanged; enforced by the engine, not touched here |

## Manual / end-to-end verification (built CLI, scratch project — no real data)

Built `dist/`, then in a fresh temp git repo:

1. `node dist/cli/index.js init --yes --agents claude --no-index` →
   - `ai-specs/skills/build/SKILL.md` contains "isolated by construction" (new Step 4) — ✅
   - `CLAUDE.md` Rule 6 contains "writing to a real data store" — ✅
   - `docs/standards/testing-standards.md` contains "Verification never touches real data" — ✅
2. Downgraded the scratch manifest to `0.1.13`, then `update --migrate-only` →
   - the **`0.1.14`** prompt printed (the full real-data stop-condition instruction),
     and **only** that prompt — the `0.1.12`/`0.1.13` prompts correctly did not
     re-fire (strict `isNewer`) — ✅
   - ended "On 0.1.14. No re-init needed." — ✅

Parity: shipped templates vs dogfood copies carry the clause 1:1 — `build` SKILL
`diff` IDENTICAL; base-standards, CLAUDE, AGENTS, testing-standards each grep to
1 in both the `src/…/assets` template and the repo copy.

Isolation note (dogfooding the new rule): every step above ran against a temp
scratch project created with `mktemp`; the scratch dir was removed afterward. No
production or development data store was read or written.

## Pre-existing / unrelated failures

None. Both gates were green on a clean tree before and after the change.

## Pending manual steps

None. (Existing projects apply the `0.1.14` prompt to their personalized
constitution/standards — the user's step by design; speclaw never auto-edits
personalized files.)

## Verdict

✅ The real-data-write stop condition lands in the skill, the standards, and Rule
6; fresh projects inherit it and existing `0.1.13` projects get the `0.1.14`
prompt. Gates green, shipped/dogfood identical, verification itself touched no
real data. No frontend in this change — `frontend.md` omitted.
