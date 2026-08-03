# Lawbook — {{project_name}}

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
4. **sync** — promote the change's delta specs into the canonical
   `lawbook/specs/` (`lawbook_sync`).
5. **archive** — finalize: sync + move the change to `lawbook/changes/archive/`
   (`lawbook_archive`), **within the same PR** — never a post-merge chore.

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

## Amendments to the law

The standards in `docs/standards/` are amended like code: through a spec change
reviewed by a human. An agent may propose an amendment; it may never silently
ignore a standard.
