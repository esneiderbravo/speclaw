# Lawbook — {{project_name}}

The process law of the project — see [`../../LAWS.md`](../../LAWS.md). This
repo is spec-driven through speclaw's **spec** module (no external CLI; the
mechanical steps are speclaw MCP tools).

## The loop

No non-trivial change lands without a spec change:

1. **explore** — think an idea through before committing (writes nothing).
2. **draft** — create `lawbook/changes/<name>/`: `proposal.md`, delta specs under
   `specs/<capability>/spec.md`, `design.md`, `tasks.md`, and a `reports/`
   folder.
3. **build** — implement the tasks in order, keeping code and spec in
   agreement, and write the discipline reports under `reports/`.
4. **sync** — reconcile the delta specs against what was actually built, then
   promote them into the canonical `lawbook/specs/` (`lawbook_sync`). The tool
   is a deterministic copy; the agent does the code↔spec reconciliation first.
5. **archive** — finalize: reconcile, sync, then move the change to
   `lawbook/changes/archive/` (`lawbook_archive`), **within the same PR** —
   never a post-merge chore. The archive is gated (see below).

## Mandatory task steps

`tasks.md` MUST include the steps defined in `lawbook/config.yaml` and the
`spec-tasks-mandatory-steps` rule: feature branch first, tests reviewed and
run, manual verification executed by the agent, discipline reports produced,
docs updated, archive within the PR. The agent performs the manual testing
itself — never delegates it.

## Reports

Every change carries a `reports/` folder. `build` writes one report per
discipline it touched, named for that discipline — an open set (`backend.md`,
`frontend.md`, `api.md`, `database.md`, `infra.md`, … — `api.md` required
whenever the change touches an API surface) recording what was tested
and the real results — unit, integration, and end-to-end as applicable — with
the commands run and their output. It is evidence of testing that travels with
the change; the archive is blocked until at least one discipline report exists.

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

Before archiving, the agent runs a reconciliation review: it compares what was
built against the delta specs and, when the code has drifted past the original
contracts, shows short insights and reconciles the delta specs.

`lawbook_archive` is then **gated in the engine** — it refuses to archive (and
reports the reason) while any task is unchecked, while `reports/` holds no
discipline report, or while the delta specs are not yet synced into the
canonical specs. Because the gate covers both the tool and the CLI, a change
reaches the archive only when it is genuinely complete: reconcile, `sync`, then
archive.

## Amendments to the law

The standards in `docs/standards/` are amended like code: through a spec change
reviewed by a human. An agent may propose an amendment; it may never silently
ignore a standard.
