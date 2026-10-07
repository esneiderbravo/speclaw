# Conventions — speclaw

Naming, branching, PR, and tracking conventions. A law of the project — see
[`../../LAWS.md`](../../LAWS.md).

## Branches

- Pattern: `<type>/<short-slug>` (e.g. `feat/reindex-on-edit`,
  `fix/agents-only-gitignored`, `docs/changelog-2.0.3`, `ci/release-on-publish`).
  The type matches the commit type.
- Follow the branch/ticket convention this repo already uses (inferred from its
  existing branch names and history) — don't invent a new one.

## Pull requests

- Title and body in English, following `.github/pull_request_template.md`
  (What · Why · Spec · Verification · Checklist). The title is
  Conventional-Commit style; a release PR appends the version, e.g.
  `fix(init): … (2.0.15)`. Link any related issue (`Closes #123`).
- Every PR is labeled (area: `foundation`, `compass`, `lawbook`, `cortex`,
  `cli`; kind: `bug`, `enhancement`, `documentation`, `chore`, `performance`,
  `security`, `release`) and assigned to the maintainer.
- `main` is protected: every PR needs an approving review from the maintainer
  (`CODEOWNERS` → [@esneiderbravo](https://github.com/esneiderbravo)). No direct
  pushes, force-pushes, or branch deletions; the `build` and `test` checks must
  pass on an up-to-date branch (`.github/branch-protection.json`).
- CI must be green before requesting review.
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
- Releasing = bump `package.json` `version` (keep `package-lock.json` in sync),
  add the `## [<version>] — <date>` section to `CHANGELOG.md` (Keep a Changelog
  style: Added / Changed / Fixed) in the **same PR**, and merge to `main`. The
  release commit is `chore(release): bump to <version>`.
- The **Publish to npm** workflow (`.github/workflows/publish.yml`) then
  publishes via npm Trusted Publishing (OIDC) — no token — and pushes the
  `v<version>` tag and GitHub release from that `CHANGELOG.md` section. It
  skips what already exists and fails before tagging if the section is missing.
- No manual `npm publish`, tags, or releases; no release branches. The floating
  major tag (`v2`) is moved by hand after a release so
  `esneiderbravo/speclaw@v2` (`action.yml`, "speclaw verify") consumers pick it up.
- Product changes that ship behavior bump the patch version in the same PR so
  auto-publish runs.
- Install stays `npx @esneiderbravo/speclaw@latest init` (frozen contract).

