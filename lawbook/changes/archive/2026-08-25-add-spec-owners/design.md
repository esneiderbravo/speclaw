# Design — add-spec-owners

## Decisions (confirmed in explore)

| # | Decision |
| --- | --- |
| Scope | **E1 only** — owners → CODEOWNERS |
| MCP | **No** new tool |
| Derive | **Off** — no `deriveFromTraceability` in v1 |
| Ceremony | Level 3 |
| Module | New `src/modules/team/` (`owners.ts` + thin `register` only if needed; CLI-first) |

## Approach

| Concern | Module | Why |
| --- | --- | --- |
| Parse `team.owners` from `lawbook/config.yaml` | `team/owners.ts` (new) | Own the compiler; lawbook keeps ceremony/coverage config loaders |
| Render marked block + merge at **end** of file | `team/owners.ts` | Same mental model as hooks identity-merge, but text markers |
| CLI `owners --write` / check | `cli/commands/owners.ts` | Human surface; mirrors `laws accept` (no MCP mutate) |
| Doctor checks | `foundation/doctor.ts` | Configuration section; reuse check id pattern |
| Init/update refresh | `scaffold` / `update` / install path | Call `writeOwners` when config declares owners |
| Dogfood | this repo's `lawbook/config.yaml` + `.github/CODEOWNERS` | Prove last-match + merge |

### Block format

```
# >>> speclaw:owners (generated — do not edit by hand; `speclaw owners --write`)
lawbook/specs/<cap>/          @owner …
lawbook/changes/*/specs/<cap>/ @owner …
…
# <<< speclaw:owners
```

Rules:

1. Markers are the merge identity; content between them is always regenerated.
2. After write, the end marker MUST be the last non-empty content in the file
   (trailing newline OK). Doctor **errors** if user patterns appear after it.
3. `"*"` owners apply to `lawbook/config.yaml` and `docs/standards/` (fallback
   governance paths). Named capability keys map to that capability's
   `lawbook/specs/<cap>/` and delta path under changes.
4. Owner tokens MUST match `@user`, `@org/team`, or a simple email — local
   syntax only. GitHub membership is never required for doctor to pass.

### Absent config

No `team:` / `team.owners` ⇒ `owners --write` exits 0 with a clear “nothing to
write” message; doctor skips owners checks (or reports `skip`).

### Alternatives weighed

| Option | Rejected because |
| --- | --- |
| E1+E2 in one PR | Human chose E1 only |
| New MCP `team_owners` | Undoes tool-surface; human writes CODEOWNERS |
| Full-file managed CODEOWNERS overwrite | Destroys user rules; hooks pattern is better |
| Derive-from-traceability on by default | Human chose off; graph errors would surprise PRs |
| Put module under `foundation/` | Roadmap + future E2–E4 need a `team/` home |

## Trade-offs

- **Last-match discipline** — writing at end is mandatory; doctor must be loud.
- **Invalid GitHub teams** — local syntax cannot catch typos of real teams;
  document the trap; optional API later.
- **Personalized `config.yaml`** — owners live in a personalized file; update
  does not invent owners, only refreshes the CODEOWNERS block from whatever
  the project declared.

## File plan

```
src/modules/team/owners.ts              NEW — parse, render, merge, write, validate
src/modules/team/index.ts               NEW — public exports
src/cli/commands/owners.ts              NEW
src/cli/index.ts                        dispatch + help
src/modules/foundation/doctor.ts        owners posture checks
src/modules/foundation/scaffold.ts      optional refresh after init
src/shared/update.ts (or equivalent)    refresh + migration note
lawbook/config.yaml                     dogfood team.owners (this repo)
.github/CODEOWNERS                      managed block at end
test/unit/owners.test.ts                NEW
test/integration/owners.test.ts         NEW
docs (README / architecture / compass)  document owners + last-match trap
```

## Risks

- User appends patterns after the block → silent override without doctor CI.
- Empty owners list for a key → skip that pattern or fail validate (prefer fail
  on `--write` with a clear message).
- Non-GitHub hosts — still emit CODEOWNERS; doctor notes GitHub-specific
  review semantics.
