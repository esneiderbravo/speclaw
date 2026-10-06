# Infra report — release-on-publish

**Discipline:** infra · **Change:** release-on-publish · **Date:** 2026-10-06 ·
**Branch:** `ci/release-on-publish` · **cwd:** `/Users/esneiderbravo/Projects/speclaw`

## Gates

| Check | Command | Result |
|-------|---------|--------|
| Lint + format | `npm run check` | PASS — exit 0, "All matched files use Prettier code style!", ESLint silent (tester re-run) |
| Type-check + build | `npm run build` | PASS — exit 0, `copy-assets: copied assets for 3 module(s)` (tester re-run) |
| Workflow YAML | `npx yaml-lint .github/workflows/publish.yml` | PASS |

## Tests added / updated

No runner exists for workflow steps. Instead, the `run:` block of the new
"Tag and release the version" step was extracted from the parsed YAML (with
indentation stripped, the same way the runner sees it) and run with
`bash -e` against the real `CHANGELOG.md` and `package.json`, with `git`
and `gh` stubbed on `PATH`.

## Scenario coverage

| Scenario | How verified | Result |
|----------|--------------|--------|
| New version, no tag, no release | stubs: `ls-remote` exit 2, `release view` exit 1 | tags `v2.0.4`, pushes it, runs `gh release create v2.0.4 --latest`; notes = the `[2.0.4]` section plus the install/npm footer |
| Tag and release already exist (re-run) | stubs return 0 | prints "release v2.0.4 already exists", exits 0, no tag or push |
| Version missing from CHANGELOG | `version` set to `9.9.9` | `::error::CHANGELOG.md has no [9.9.9] section`, exit 1, **before** any `git tag`/`push` |
| Tag on origin, release missing | `ls-remote` exit 0, `release view` exit 1 | prints "v2.0.4 already exists — not tagging", no `git tag`/`push`, still runs `gh release create` |
| awk section boundary | `version` set to `2.0.1` | notes hold only the `[2.0.1]` `### Fixed` block; stops at `## [2.0.0]` |
| Heredoc footer | inspect `notes.md` and extracted script | `EOF` lands at column 0 (line 24) after YAML indentation stripping; footer renders the `### Install` fence and the `@2.0.4` npm link with `$VER` expanded |

Tester re-verification (independent): the step was re-extracted with PyYAML
into `/tmp/relsim.*/step.sh` and run with `bash -e` in a temp dir holding
copies of `CHANGELOG.md`/`package.json` and logging `git`/`gh` stubs. No
real `git push`, `gh`, or npm call was made; the repo working tree was left
unchanged. Only BSD awk was available locally; the program uses POSIX awk
only (`-v`, `index`, regex patterns), so mawk on `ubuntu-latest` should
match.

YAML review: `permissions: contents: write` (workflow level) covers tag push
and release create; `GH_TOKEN: ${{ github.token }}` feeds `gh`;
`actions/checkout@v5` keeps `persist-credentials` (default `true`), so
`git push origin <tag>` authenticates with the same token. A tag pushed with
`GITHUB_TOKEN` triggers no other workflow, and no workflow here listens on
tags. Notes start with one blank line (the line after the heading), which is
cosmetic.

The first draft tagged before it checked the notes, which left a pushed tag
when the section was missing. The missing-section scenario caught this, and
the step was reordered.

## Pre-existing / unrelated failures

None.

## Pending manual steps

- The real step runs on the next version bump merged to `main` (it needs
  `contents: write` and `GITHUB_TOKEN`, which can't be exercised locally).
- Moving the floating `v2` tag stays manual (documented in
  `docs/standards/conventions.md`).

## Verdict

PASS — all three step paths behave as intended; gates are green.
