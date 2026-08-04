# Design — add-reports-and-archive-gates

## Approach

Split the work by what can be verified mechanically vs what needs judgement,
exactly as `reconcile-specs-on-sync` did.

### Reports (`reports/` folder)

- **Structure:** `lawbook/changes/<name>/reports/<discipline>.md`. `draft`
  creates the folder (with a short `reports/README.md` explaining what build
  fills in); `build` writes the real reports.
- **Content:** each report records the commands run and their output for the
  test kinds relevant to that discipline (unit / integration / e2e), plus a
  one-line verdict. When a test kind does not yet apply (e.g. speclaw has no
  unit runner), the report says so and records the gates + manual verification
  that stood in — the requirement is *evidence*, not a specific tool.
- **Skill wiring:** the `build` skill gains a step "write the discipline
  reports"; the mandatory task steps (`lawbook/config.yaml`, its generator in
  `specInit`, and the `spec-tasks-mandatory-steps` rule) gain a "produce the
  reports under `reports/`" step so every `tasks.md` carries it.

### Archive gate (deterministic, in the engine)

`specArchive` (`src/modules/lawbook/engine.ts:236`) gains a precondition check
before it promotes and moves — a new `specArchivePreconditions(projectPath,
change)` returning the list of blockers, called by `specArchive` (throwing /
returning the blockers when non-empty). Because both the `lawbook_archive` MCP
tool and the CLI `runSpec` call `specArchive`, the gate covers both entry
points. The checks:

1. **Unchecked tasks** — parse `tasks.md` for a `- [ ]` marker; block if any.
2. **Reports present** — `reports/` exists and is non-empty; block otherwise.
3. **Specs synced** — for each delta spec file, the canonical
   `lawbook/specs/<rel>` exists and is byte-identical; block if any differ or
   are missing (means `sync` was not run after the last spec edit).

The check reuses the existing helpers (`deltaSpecFiles`, `specRoot`) and mirrors
`specValidate`'s return shape (a list of human-readable reasons).

### Judgement layer (unchanged from `reconcile-specs-on-sync`)

"Local changes are more than expected" is drift the agent detects in the
reconciliation review. When it reconciles, it edits the delta specs; those must
then be `sync`ed; the deterministic "specs synced" check then refuses the
archive until that happens. So the fuzzy requirement is enforced *through* the
mechanical gate rather than by a heuristic guessing "expected".

## Alternatives weighed

1. **Put the gate only in the `archive` skill (agent-enforced).** Rejected: the
   user's requirement is absolute ("ningún cambio se archiva si…"). Prose in a
   skill is skippable; a deterministic engine block is not. The skill still
   describes the gate, but the engine enforces it.

2. **Extend `specValidate` instead of adding `specArchivePreconditions`.**
   Considered. `lawbook_validate` is also run at draft/build time, where
   unchecked tasks and absent reports are *expected*. Overloading it would make
   validation fail mid-build. A separate archive-only precondition keeps the two
   concerns distinct. (Build may still call it read-only to preview blockers.)

3. **Require a fixed set of reports (always backend.md + frontend.md).**
   Rejected: a backend-only change has no frontend to test. Relevance is
   per-feature; the gate checks presence/non-empty, not a fixed list.

4. **Make the reports a single `report.md`.** Rejected: the user asked for
   per-discipline files; separate files keep backend/frontend/e2e evidence
   reviewable independently and match how work is split.

## Trade-offs

- The gate can be satisfied by a token report — it verifies presence, not
  quality. Accepted: quality is review's job; presence is the mechanical
  floor, and it is strictly better than no evidence.
- Requiring specs to be synced *before* archive changes the current implicit
  behavior (archive auto-syncs blind). After this change archive still runs the
  copy, but it is a no-op because the gate requires canonical to already match —
  making "did you reconcile + sync?" an enforced precondition rather than a
  silent side effect.

## Affected files

- Engine: `src/modules/lawbook/engine.ts` (new `specArchivePreconditions`, wired
  into `specArchive`).
- Mandatory steps: `lawbook/config.yaml`, its generator in `specInit`
  (engine.ts), and `src/modules/lawbook/assets/rules/spec-tasks-mandatory-steps.md`.
- Skills (ai-specs + templates): `draft` (scaffold `reports/`), `build`
  (populate reports), `archive` (describe the hard gate).
- Docs: `docs/standards/lawbook.md` + foundation template,
  `docs/standards/testing-standards.md` (reports), and the `README.md` workflow
  section as needed.
