# Conventions — {{project_name}}

Naming, branching, PR, and tracking conventions. A law of the project — see
[`../../LAWS.md`](../../LAWS.md).

## Branches

- Pattern: `{{branch_pattern}}`
- Branches without a tracker ticket reference must not be merged (except
  explicitly scoped chores).

## Pull requests

- Title and body in the repo's artifact language, following the PR template.
- The body references the tracker ticket ({{ticket_prefix}}-N) so it links.
- The ticket lives in the PR title/body only — never in the code.
- CI must be green before requesting review.

## Tracker

- Ticket prefix: `{{ticket_prefix}}`
- New behavior, endpoints, schema changes, or UI flows get a ticket and a
  spec change; one-line fixes need not.
- Ticket ↔ PR traceability is mandatory: closing a ticket attaches its PR
  (see the `close-ticket` skill).

## Versioning & releases

<!-- speclaw init: describe the repo's versioning/release convention if it has
one (semver tags, changelog, release branches). Otherwise leave a short note. -->
{{versioning_rules}}
