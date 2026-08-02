# Frontend Standards — {{project_name}}

Rules for frontend code. A law of the project — see [`../../LAWS.md`](../../LAWS.md).
Architecture and layer boundaries: [`architecture.md`](architecture.md).

## Layering — strictly enforced

<!-- speclaw init: fill from the repo's real frontend structure. Example
(hexagonal / vertical slices):

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Domain | domain/ | Pure entities, ports. No framework, no I/O. |
| Application | application/use-cases/ | Orchestrate domain via ports. |
| Infrastructure | infrastructure/ | HTTP, storage, providers. |
| Presentation | presentation/ | Screens/components. No business logic, no I/O. |
-->
{{frontend_layers}}

- Route entry files stay thin — they delegate to a screen/component.
- Presentation never calls the network or storage directly; it goes through
  the application layer.

## Rendering & component boundaries

- Respect the framework's server/client boundary rules.
- Keep side effects and data fetching at the correct layer, not inside
  presentational components.

## State & data

- Data access goes through typed clients/repositories, not ad-hoc fetches
  scattered in components.
- Follow the repo's BFF / API-access rule (browser calls same-origin routes
  when the project uses a BFF).

## i18n & UI

- User-visible copy goes through the i18n layer; keep keys and types in sync.
- Use the project's design system components and tokens — no hardcoded colors
  when a token exists.

## Formatting, linting, docs

- TSDoc on exported functions and components (no ticket text).
- Lint / type-check command: `{{lint_commands}}`
