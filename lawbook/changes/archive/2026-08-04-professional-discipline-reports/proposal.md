# Professional discipline reports

## Why

speclaw already ships the scaffolding for evidence reports — `draft` creates
`reports/`, `build` fills it, and `archive` refuses to close a change without at
least one discipline report. But the *content* of those reports is left to the
agent's judgement: the `build` skill (Step 5) and the testing standard describe
a report in one loose paragraph. The result is inconsistent — some reports are
rich (tables, gates, e2e, verdict), others are a couple of lines — because the
quality depends on how well the agent improvises, not on a specified shape.

A sibling repo (ftd-adt, OpenSpec) produces noticeably more professional reports
by convention: a fixed header (date · branch · environment), a
`Check | Command | Result` table with exact pass/fail counts, an explicit list
of the tests added and what they assert, an honest "pre-existing / unrelated
failures" section backed by proof, and a declared list of pending manual steps.
We have better scaffolding than they do (a real archive gate); we lack their
report discipline.

This change specifies a **required report structure** so the professional shape
is reproducible rather than accidental — and adds one thing ftd-adt cannot do
because it lacks our artifacts: a **spec-scenario coverage table** mapping each
`#### Scenario` in the change's delta specs to how it was verified.

## What

- Rewrite Step 5 of the `build` skill to prescribe the report skeleton (header,
  command-result table with exact counts, tests-added section, spec-scenario
  coverage table, pre-existing-failure honesty rule, pending-manual section,
  one-line verdict).
- Strengthen the "Reports" section of `docs/standards/testing-standards.md` to
  make that structure the law, not a suggestion.
- Point the `reports/README.md` that `draft` scaffolds at the required skeleton,
  so the shape is visible before implementation.
- Keep both the shipped templates (`src/modules/**/assets/...`) and the repo's
  own dogfood copies (`ai-specs/...`, `docs/standards/...`) in sync.

## Non-goals

- No change to the archive gate logic (still "≥1 discipline report"); this only
  governs report *content*.
- No new file format, tool, or validation that parses report sections — the
  structure is enforced by the skill + standard, not by a linter.
- No physical `reports/_template.md` — the skeleton lives in the skill and the
  standard (per the explore decision).

## Migrations

Yes. `docs/standards/testing-standards.md` is a **personalized** file, so
`speclaw update` cannot rewrite it directly. A migration entry (tagged at the
release that ships this change, `0.1.13`) prints an agent prompt describing the
strengthened Reports section for existing projects to apply. The `build` and
`draft` skills are **managed** files and refresh automatically on update — no
prompt needed for those.
