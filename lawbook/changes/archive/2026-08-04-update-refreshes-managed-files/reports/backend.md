# Backend report — update-refreshes-managed-files

Scope: the ownership split (`src/modules/foundation/ownership.ts`), the
overwrite-with-baseline copy (`src/shared/install.ts` + manifest baselines), the
managed refresh wired through `scaffold`/`installWorkflow`/`installPack`, the
`update` personalized-file prompt, and the agent-generic init/update wording.
speclaw has no `node:test` runner yet, so coverage is the compile-time gates plus
a real end-to-end exercise of the built CLI on a scratch project.

## Quality gates

- `npm run check` (Prettier + ESLint) → **pass** ("All matched files use Prettier code style!").
- `npm run build` (`tsc` strict + copy-assets) → **pass** — no type errors.

## End-to-end (built CLI, scratch project)

Steps: `node dist/cli/index.js init --yes --agents claude --no-index` in a temp
project; edit one managed file (`ai-specs/skills/build/SKILL.md`); leave the rest;
downgrade the manifest version to `0.1.0` to fire the 0.1.11 personalized prompt;
run `node dist/cli/index.js update --migrate-only`.

| Behavior (spec scenario) | Observed | Verdict |
| :-- | :-- | :-- |
| Baselines recorded at init | manifest holds 14 managed-file hashes | ✅ |
| Locally edited managed file backed up | `…/build/SKILL.md.bak` created | ✅ |
| Edited managed file refreshed to template | "LOCAL EDIT" gone from the live file | ✅ |
| User's edit preserved | "LOCAL EDIT" present in the `.bak` | ✅ |
| Untouched managed file not backed up | no spurious `…/sync/SKILL.md.bak` (baseline match → silent) | ✅ |
| Personalized file not auto-edited | `CLAUDE.md` sha unchanged across update | ✅ |
| Personalized prompt printed | "One step for the agent you're using" + the Compass-first + reports instructions | ✅ |
| Agent-generic language | prompt says "the agent you're using", no hardcoded product | ✅ |

Update output (verbatim excerpt):

```
◇ Applying what's new to this project
  ✓ ai-specs/skills/build/SKILL.md
  1 file(s) added/refreshed · 16 left untouched.
  ! ai-specs/skills/build/SKILL.md had local edits — saved as …/SKILL.md.bak before refreshing.
◇ One step for the agent you're using
  Personalized files (CLAUDE.md, AGENTS.md, LAWS.md, docs/standards, docs/compass.md, lawbook/config.yaml) …
  - In CLAUDE.md and AGENTS.md, change the Compass rule to 'Compass first, always': …
  - In lawbook/config.yaml, add this mandatory task step … "Produce the discipline reports under reports/ …"
  ✓ On 0.1.11. No re-init needed.
```

## Version gating (the 0.1.11 cohort)

`isNewer` is a strict `>` comparison, so a migration tagged at an already-shipped
version never fires for projects already on it. The migration is therefore tagged
at `0.1.12` — the version that introduces the mechanism — and the package is
bumped to `0.1.12`. Verified on scratch projects:

| Case | Manifest version | Result | Verdict |
| :-- | :-- | :-- | :-- |
| At-risk cohort updating in | `0.1.11` → 0.1.12 | prompt fires (Compass-first + reports) | ✅ |
| Already current | fresh `0.1.12` | no prompt | ✅ |

## Cumulative migrations (updating across several releases)

`update` jumps straight to `@latest`, so it applies **every** migration newer
than the project's recorded version, oldest first (the pending list is sorted, so
array order can't matter). Entries are cumulative and never removed. Verified
against `isNewer` with an out-of-order fake `MIGRATIONS` list:

| Recorded version | Pending (applied, in order) |
| :-- | :-- |
| `0.1.9` (behind by many) | `0.1.12, 0.1.13, 0.1.14, 0.2.0` |
| `0.1.13` | `0.1.14, 0.2.0` |
| `0.2.0` (current) | (none) |
| missing → `0.0.0` | all |

None are skipped when a project crosses multiple versions at once.

## Notes

- The `init` handoff (`src/cli/commands/init.ts`) now says "Copy this and paste it
  into the agent you're using" instead of naming the primary agent; agent labels
  remain in the selector where the user picks real products.
- First-ever update from a pre-baseline project: managed files that differ from
  the shipped template are treated as diverged and backed up to `.bak` (documented
  safe default); baselines are written from then on.
- Frontend: none — CLI/foundation only. `frontend.md` omitted.
