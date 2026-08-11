<!--
Title: Conventional-Commit style — `type(scope): imperative summary` (English, lowercase).
Keep the diff focused: one concern per PR.
-->

## What

<!-- What changed, in a few lines. -->

## Why

<!-- The problem this solves / the motivation. Link any related issue: Closes #123 -->

## Spec

<!--
Non-trivial changes (new behavior, endpoints, schema, or UI flows) land with a
spec change, archived in this PR. One-line fixes need none — say so instead.
-->

- Capability affected: <!-- e.g. local-content — or "none (one-line fix)" -->
- Delta specs synced to `lawbook/specs/` and change archived under
  `lawbook/changes/archive/<date>-<name>/`: <!-- yes / n/a -->

## Verification

<!-- Real output, not claims. See docs/standards/testing-standards.md -->

- [ ] `npm run check` (Prettier + ESLint) passes
- [ ] `npm run build` (strict `tsc` + assets) passes
- [ ] `npm run test` passes (no coverage regression below the 80% floor)
- [ ] Behavior manually verified by running the affected CLI/MCP surface — never
      against real data (throwaway temp dir / scratch repo)
- Discipline report(s) under `reports/`: <!-- path, or "n/a for a one-line fix" -->

## Checklist

- [ ] Title follows Conventional Commits; branch is `<type>/<short-slug>`
- [ ] One concern only — scope stays focused
- [ ] Docstrings updated for any new/changed exported API
      (docs/standards/documentation.md)
- [ ] Governing standards in `docs/standards/` respected (no silent divergence)
- [ ] CI is green before requesting review

<!--
`main` is protected: this PR needs an approving review from @esneiderbravo
(CODEOWNERS). No direct pushes, force-pushes, or branch deletions.
-->
