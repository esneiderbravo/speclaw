# Testing & Quality Gates — speclaw

The quality law of the project — see [`../../LAWS.md`](../../LAWS.md). These
gates are non-negotiable: an agent runs them itself and reports real output
before declaring anything done.

## Gates

- **Lint + format**: `npm run check` — Prettier `--check` + ESLint
  (`eslint.config.js`). Fix formatting with `npm run format`.
- **Type-check + compile**: `npm run build` — `tsc` in `strict` mode followed by
  `scripts/copy-assets.mjs`.
- **Tests**: there is **no unit-test runner yet.** Until a `test` script exists,
  the two gates above plus agent-run manual verification (below) are the gates.

CI runs `npm ci && npm run check && npm run build` on every push to `main` and
every PR (`.github/workflows/ci.yml`).

A red gate blocks the task. Fix it or report it — never work around it by
suppressing the compiler (no blanket `@ts-ignore`), disabling a lint rule inline
without a reason, or weakening a check.

## What must be tested

- New behavior should ship with coverage using Node's built-in `node:test`
  runner (no new dependency) — happy path plus at least one edge/error case.
- Bug fixes should add a regression check that fails before the fix.
- When you add the first tests, wire a `test` script in `package.json` and add
  it to the CI job, then update this section.

## Test hygiene

- Tests are deterministic and isolated — no live network, no reliance on a
  machine-specific `.speclaw/` index; build fixtures in a temp dir.
- A test "fixed" by weakening its assertion is not fixed.

## Manual & end-to-end verification

- speclaw is a CLI + MCP tool, so runtime verification means **running it**:
  build, then exercise the affected command (e.g. `node dist/cli/index.js init`
  in a scratch repo, `… index`, `… explore <node>`, `… doctor`), or drive the
  MCP tool. Don't assume a green build covers behavior.
- The mandatory spec task steps ([`lawbook.md`](lawbook.md)) define which manual
  checks the agent must execute itself — the agent performs them, never delegates.

## Reports — evidence travels with the change

Every change records its testing under `lawbook/changes/<name>/reports/`, one
file per discipline it touched (`backend.md`, `frontend.md`, …). Each report
captures what was tested and the real results — unit, integration, and
end-to-end as applicable — with the commands run, their output, and a one-line
verdict. When a test kind does not yet apply (e.g. no unit runner), the report
says so and records the gates and manual verification that stood in. `build`
produces them; `lawbook_archive` refuses to archive a change whose `reports/`
holds no discipline report.
