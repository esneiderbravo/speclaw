# Lawbook — speclaw

The process law of the project — see [`../../LAWS.md`](../../LAWS.md). This
repo is spec-driven through speclaw's **spec** module (no external CLI; the
mechanical steps are speclaw MCP tools).

## The loop

No non-trivial change lands without a spec change:

1. **explore** — think an idea through before committing (writes nothing).
2. **draft** — create `lawbook/changes/<name>/`: `proposal.md`, delta specs under
   `specs/<capability>/spec.md`, `design.md`, and `tasks.md`.
3. **build** — implement the tasks in order, keeping code and spec in
   agreement.
4. **sync** — reconcile the delta specs against what was actually built, then
   promote them into the canonical `lawbook/specs/` (`lawbook_sync`). The tool
   is a deterministic copy; the agent does the code↔spec reconciliation first.
5. **archive** — finalize: run the reconciliation review (recommend a sync if
   the code drifted past the contracts), then sync + move the change to
   `lawbook/changes/archive/` (`lawbook_archive`), **within the same PR** —
   never a post-merge chore.

## Mandatory task steps

`tasks.md` MUST include the steps defined in `lawbook/config.yaml` and the
`spec-tasks-mandatory-steps` rule: feature branch first, tests reviewed and
run, manual verification executed by the agent, docs updated, archive within
the PR. The agent performs the manual testing itself — never delegates it.

## Delta specs

- Normative requirements use SHALL/MUST.
- Requirement headers use `### Requirement:`.
- Scenario headers use exactly `#### Scenario:`.
- Acceptance criteria are testable without production integrations.
- The implemented code must match what the delta spec promises. Validate with
  the `lawbook_validate` tool before syncing or archiving.

## Archiving discipline

Always archive with the `archive` command / `lawbook_archive` tool, never a manual
`mv` — the tool performs the spec promotion and validation a manual move skips.

`lawbook_archive` folds the sync in and is blind to the code, so before
archiving the agent runs a reconciliation review: it compares what was built
against the delta specs and, when the code has drifted past the original
contracts, recommends a reconciling `sync` with short insights before
proceeding. Archive only after the specs reflect what shipped or the drift is
explicitly accepted.

## Amendments to the law

The standards in `docs/standards/` are amended like code: through a spec change
reviewed by a human. An agent may propose an amendment; it may never silently
ignore a standard.
