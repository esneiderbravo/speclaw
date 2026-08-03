# Conventions — {{project_name}}

Naming, branching, PR, and tracking conventions. A law of the project — see
[`../../LAWS.md`](../../LAWS.md).

## Branches

- Pattern: `{{branch_pattern}}`
- Follow the branch/ticket convention this repo already uses (inferred from its
  existing branch names and history) — don't invent a new one.

## Pull requests

- Title and body in the repo's artifact language, following the PR template.
- If the team uses a tracker, the body references its ticket so it links; the
  ticket lives in the PR title/body only — never in the code.
- CI must be green before requesting review.

## Tracker

speclaw does not prescribe a ticket tool — each team configures its own. Follow
whatever convention this repo already uses (inferred from its branches, PRs, and
history); if there is none, leave tracker linkage to the team.

- New behavior, endpoints, schema changes, or UI flows get a spec change;
  one-line fixes need not.
- Where a tracker is in use, ticket ↔ PR traceability is expected: closing a
  ticket attaches its PR.

## Versioning & releases

<!-- speclaw init: describe the repo's versioning/release convention if it has
one (semver tags, changelog, release branches). Otherwise leave a short note. -->
{{versioning_rules}}
