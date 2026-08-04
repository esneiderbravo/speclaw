# Backend checks — professional-discipline-reports (2026-08-04)

Date: 2026-08-04 · Branch: `feat/professional-discipline-reports` · Environment:
Node/TypeScript CLI, commands run from the repo root `/Users/esneiderbravo/Projects/speclaw`.

Scope: the required report structure — `build` skill Step 5, the `draft` skill
`reports/` guidance, the `testing-standards` law (shipped template + repo copy),
the `0.1.13` migration prompt for the personalized standard, and the version
bump. Shipped templates under `src/modules/**/assets/` and their dogfood copies
(`ai-specs/…`, `docs/standards/…`) were edited identically.

## Gates & results

| Check | Command | Result |
| :-- | :-- | :-- |
| Lint + format | `npm run check` (Prettier `--check` + ESLint) | ✅ "All matched files use Prettier code style!", ESLint clean |
| Type-check + compile | `npm run build` (`tsc` strict + copy-assets) | ✅ no type errors; "copied assets for 3 module(s)" |

speclaw has no `node:test` runner yet (see `docs/standards/testing-standards.md`),
so coverage is the two compile-time gates plus the end-to-end CLI exercise below.

## Tests added / updated

None. This change edits skill text, a standard, one `MIGRATIONS` entry, and the
package version — no runtime code path with unit coverage. No existing
`node:test` fixture governs the skill/standard text (there is no test runner
wired), so nothing to update. The behavior is verified end-to-end below.

## Spec-scenario coverage

Delta spec: `specs/lawbook-workflow/spec.md`. Scenarios newly introduced or
modified by this change are marked **(new)**; the rest restate unchanged
capability behavior carried in the full delta and are verified by the existing
engine/skills, untouched here.

| Scenario | Verified by |
| :-- | :-- |
| Draft scaffolds the reports folder + README references the structure **(new clause)** | `draft` SKILL (both copies) now names the required structure in the `reports/` bullet — text inspection; `diff` confirms shipped == dogfood |
| A discipline report carries the required sections **(new)** | `build` SKILL Step 5 (both copies) prescribes the 7-part skeleton; this very report dogfoods it |
| Pre-existing failures are declared honestly **(new)** | Step 5 item 5 + standard §Reports item 5; enforced by convention (see "Pre-existing / unrelated failures" below) |
| Every delta-spec scenario is accounted for **(new)** | Step 5 item 4 + this coverage table |
| Build records evidence of testing | `build` SKILL Step 5 (unchanged requirement); this report exists under `reports/` |
| Behavior built after drafting is captured before promotion (sync) | Unchanged; `lawbook_sync` + `sync` skill, not touched by this change |
| Unchecked task / missing reports / README-only / unsynced specs block archive; complete change archives; drift reconciled before archive | Unchanged; enforced deterministically by the archive engine, not touched by this change |

## Manual / end-to-end verification (built CLI, scratch project)

Built `dist/`, then in a fresh temp git repo:

1. `node dist/cli/index.js init --yes --agents claude --no-index` →
   - `ai-specs/skills/build/SKILL.md` contains "Spec-scenario coverage" (new Step 5) — ✅
   - `docs/standards/testing-standards.md` contains "spec-scenario coverage table" — ✅
   - manifest version `0.1.13` — ✅
2. Downgraded the scratch manifest to `0.1.12`, then
   `node dist/cli/index.js update --migrate-only` →
   - the **`0.1.13`** personalized-standard prompt printed (the full Reports-structure
     instruction), and **only** that prompt — the `0.1.12` prompt correctly did not
     re-fire (strict `isNewer`) — ✅
   - ended "On 0.1.13. No re-init needed." — ✅

Template/dogfood parity: `diff` of both skill files (shipped vs `ai-specs`) →
IDENTICAL. `dist/` assets carry the new shipped `build` SKILL and the new
`testing-standards.template.md` Reports section (grep count 1 each) — ✅.

Incidental note: an early verification run of `init` without a path landed in the
repo itself and rewrote the tracked manifest `ai-specs/.speclaw.json` (0.1.7 →
0.1.13); it was reverted with `git checkout` so the change diff stays clean. The
correct scratch run used a subshell `cd` into a temp dir.

## Pre-existing / unrelated failures

None. Both gates were green on a clean tree before and after the change.

## Pending manual steps

None for this change. (For downstream projects, applying the `0.1.13` prompt to
their personalized `testing-standards.md` is the user's step by design — speclaw
never auto-edits personalized files.)

## Verdict

✅ Gates green, shipped/dogfood copies identical, the required report structure
lands in fresh projects, and the `0.1.13` prompt reaches existing `0.1.12`
projects. No frontend in this change — `frontend.md` omitted.
