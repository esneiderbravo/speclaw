# Conventions — speclaw

Naming, branching, PR, and tracking conventions. A law of the project — see
[`../../LAWS.md`](../../LAWS.md).

## Branches

- Pattern: `<type>/<short-slug>` (e.g. `feat/visualize-graph`,
  `fix/index-schema`, `docs/readme-badges`). The type matches the commit type.
- No ticket prefix — speclaw prescribes no tracker. Branch from `main`, keep the
  diff focused, one concern per branch.

## Pull requests

- Title and body in English. The body says **what** changed and **why**, in
  Conventional-Commit-style titling; link any related issue.
- `main` is protected: every PR needs an approving review from the maintainer
  (`CODEOWNERS` → [@esneiderbravo](https://github.com/esneiderbravo)). No direct
  pushes, force-pushes, or branch deletions.
- CI (`npm ci && npm run build`) must be green before requesting review.
- The `speclaw` GitHub check (`.github/workflows/speclaw.yml`) verifies laws
  against this checkout. It is **not** a required status check unless a
  maintainer adds it in branch protection — speclaw never enables that itself.
- One concern per PR — scope and direction are curated on purpose
  (see [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md)).

## Tracker

speclaw does not prescribe a ticket tool — each team configures its own. Follow
whatever convention this repo already uses (inferred from its branches, PRs, and
history); if there is none, leave tracker linkage to the team.

- New behavior, endpoints, schema changes, or UI flows get a spec change;
  one-line fixes need not.
- Where a tracker is in use, ticket ↔ PR traceability is expected: closing a
  ticket attaches its PR.

## Versioning & releases

- **SemVer**, single source of truth: the `version` field in `package.json`.
- Releasing = bump `package.json` `version` (keep `package-lock.json` in sync)
  and merge to `main`. The **Publish to npm** workflow
  (`.github/workflows/publish.yml`) then publishes automatically via npm Trusted
  Publishing (OIDC) — no token. If the version is already on npm, it skips.
- No manual `npm publish`; no release branches. There is no `CHANGELOG.md` —
  git history and the release commit carry the narrative.
- `speclaw update` brings a scaffolded project up to date **additively** (new
  standards/skills/steps only), never overwriting existing files.

