# The Laws of {{project_name}}

> This is the constitution of this project. It does not restate the standards —
> it **binds** them. Every AI agent working in this repository MUST read this
> file at the start of a session and MUST comply with every standard it links
> below. When a standard conflicts with an agent's default behavior, the
> standard wins.

- **Project**: {{project_name}} — {{project_description}}
- **Organization**: {{organization}}
- **Stack**: {{stack_summary}}

## The standards (each is a law)

| Law | File | Governs |
|-----|------|---------|
| Base | [`docs/standards/base-standards.md`](docs/standards/base-standards.md) | Languages, commits, comments, dependencies, engineering principles |
| Architecture | [`docs/standards/architecture.md`](docs/standards/architecture.md) | Modules/bounded contexts, layering, cross-boundary rules |
| Backend | [`docs/standards/backend-standards.md`](docs/standards/backend-standards.md) | Backend layers, docstrings, typing, tests, migrations |
| Frontend | [`docs/standards/frontend-standards.md`](docs/standards/frontend-standards.md) | Frontend layers, rendering boundaries, state, i18n, UI |
| Testing | [`docs/standards/testing-standards.md`](docs/standards/testing-standards.md) | Quality gates, what must be tested, verification |
| Documentation | [`docs/standards/documentation.md`](docs/standards/documentation.md) | Docstring/API-comment convention per language |
| Conventions | [`docs/standards/conventions.md`](docs/standards/conventions.md) | Branches, PRs, tracker, versioning |
| Spec | [`docs/standards/spec-workflow.md`](docs/standards/spec-workflow.md) | Spec-driven workflow, mandatory task steps, archiving |
| Compass | [`docs/compass.md`](docs/compass.md) | Using the code knowledge graph before grep |

## Binding rules

1. **Read the relevant standard before touching its area.** The table above is
   the map. Agents open the standard that governs the code they're changing.
2. **The standards are enforced, not advisory.** A violation is a blocking
   finding in review.
3. **Amendments go through the spec workflow.** A standard is changed like code — via a
   reviewed change (see the spec-workflow law). An agent may propose an amendment;
   it may never silently ignore a standard.
4. **Entry points reference the law.** [`CLAUDE.md`](CLAUDE.md) and
   [`AGENTS.md`](AGENTS.md) point every agent here first.

{{custom_laws}}
