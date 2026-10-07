# Skills checks — harden-update-lock-and-cli (2026-10-06)

Date 2026-10-06 · Branch `feat/coordinator-status-updates` · cwd `/Users/esneiderbravo/Projects/speclaw` (read-only text inspection and tests; nothing scaffolded into this repo; D20 respected, no `init`/`update` here).

Scope: the shipped Cortex skill step `skills/cortex/steps/02-dispatch-loop.md` and the role agent `agents/archiver.md`. They must not direct an `advance` after a successful archive, and they must direct a read-only `status` check that the stage is `done`. The reviewer's N5 wording fix is also checked.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Lint + format / build | `npm run check`, `npm run build` | ✅ exit 0 / exit 0 (assets copied: "copied assets for 3 module(s)") |
| Full suite | `npm test` | ✅ 833/833 |
| Skill/asset tests | `node --test --test-concurrency=1 dist-test/test/unit/harness.test.js dist-test/test/unit/cortex-skill-status.test.js dist-test/test/integration/scaffold.test.js dist-test/test/unit/skill-steps.test.js dist-test/test/unit/feature-draft.test.js` | ✅ tests 52, pass 52, fail 0 |
| Mirror parity | `cmp src/modules/lawbook/assets/<f> ai-specs/<f>` for `skills/cortex/steps/02-dispatch-loop.md`, `agents/archiver.md`, `skills/cortex/steps/03-complete.md` | ✅ identical (3/3) |

## Text inspected

`src/modules/lawbook/assets/skills/cortex/steps/02-dispatch-loop.md:33-36` (and its mirror):

> - archiving success → no Cortex op: the archive itself moves the harness to `done` (the result reports `harnessCompleted`). Confirm with `cortex` action `status` that the stage is `done`; never `advance` an archived change (the engine rejects it).

The surrounding `advance` lines (questions/planning/implementing/reviewing/testing) are unchanged, and the sibling's status-update text is kept.

`src/modules/lawbook/assets/agents/archiver.md:11-16` (and its mirror):

> A successful archive completes the Cortex harness itself (`harnessCompleted` in the result); do not call a mutating Cortex op (`advance`, `rework`, `start`) afterwards. Confirm with the read-only `cortex` action `status` that the stage is `done`, and report it to the coordinator.

N5 is fixed: the text now says "mutating", so "do not call a Cortex op" no longer contradicts the `status` call. A grep over `src/modules/lawbook/assets/`, `docs/cortex.md`, and `README.md` for `advance … done` / `after archiv…` finds no remaining instruction to advance after an archive.

The guidance matches the engine: M17/M18 (`backend.md`, `api.md`) show that `advance` on an archived change is rejected, and `status` returns `done`.

## Tests added / updated

`test/unit/harness.test.ts` "the shipped skill and archiver agent do not advance after archive" reads both shipped assets and asserts no advance-after-archive wording and a `status` … `done` direction.

## Spec-scenario coverage

| Scenario | Verified by |
|----------|-------------|
| The shipped workflow does not advance after archive (`lawbook-workflow`, `req~harness-archive-completes~1`) | unit test above; text inspection above; mirrors identical |

All other scenarios are mapped in `cli.md`, `security.md`, `backend.md`, and `api.md`.

## Pre-existing / unrelated failures

None.

## Pending manual steps

None. Projects receive the new text on their next `speclaw update` (the agent-facing skill assets are refreshed managed files).

## Verdict

PASS
