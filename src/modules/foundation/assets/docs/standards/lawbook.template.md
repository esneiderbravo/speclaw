# Lawbook — {{project_name}}

The process law of the project — see [`../../LAWS.md`](../../LAWS.md). This
repo is spec-driven through speclaw's **spec** module (no external CLI; the
mechanical steps are speclaw MCP tools).

## The loop

No non-trivial change lands without a lawbook change. The default execution
model is **Cortex** (*One brain. Many agents.*): the host primary agent is the
**coordinator** (`cortex` skill / MCP `cortex`) and dispatches explorer → planner →
implementer → reviewer → tester → archiver. State:
`lawbook/changes/<name>/harness.json` (`speclaw cortex`). Lawbook owns specs
and ceremony; Cortex owns the multi-agent loop.

1. **explore** (explorer) — think an idea through before committing (writes nothing).
2. **draft** / **quick** (planner) — create `lawbook/changes/<name>/` artifacts
   for the confirmed ceremony level; questions go to the human via the
   coordinator.
3. **build** (implementer) — implement tasks; hand off before final gates.
4. **review** (reviewer) — scoped to the diff: starts from the exported diff
   and `compass_diff_context`, checks a fixed list of defect classes, writes a
   `reports/review.md` of at most 40 lines with PASS/FAIL (skipped at level 0).
5. **test** (tester) — quality gates, manual verification, discipline reports.
6. **sync** / **archive** (archiver) — reconcile, sync when needed, archive
   within the same PR. Gated on Cortex verdicts plus tasks/reports/sync.

## Mandatory task steps

`tasks.md` MUST include the steps defined in `lawbook/config.yaml` and the
`spec-tasks-mandatory-steps` rule. The **tester** role performs manual
verification — never the user; the coordinator must not archive without a
test PASS.

## Reports

Every change carries a `reports/` folder. The tester writes discipline reports;
the reviewer writes `review.md`. Archive is blocked until evidence and harness
verdicts are complete.

## Delta specs

- Normative requirements use SHALL/MUST.
- Requirement headers use `### Requirement:`.
- Scenario headers use exactly `#### Scenario:`.
- Acceptance criteria are testable without production integrations.
- The implemented code must match what the delta spec promises. Validate with
  `lawbook_change` (action: validate) before syncing or archiving.

## Archiving discipline

Always archive with the `archive` command / `lawbook_change` (action: archive), never a manual
`mv`. The engine refuses archive while tasks are unchecked, reports are missing,
specs are out of sync when required, or harness review/test verdicts are not PASS.

## Amendments to the law

The standards in `docs/standards/` are amended like code: through a spec change
reviewed by a human. An agent may propose an amendment; it may never silently
ignore a standard.
