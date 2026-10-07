# Reports — fix-scan-and-cortex-questions

Bug reports MUST include the regression test **failing before the fix**.

Expected discipline reports (see `tasks.md` task 11 and the
`spec-reports-disciplines` rule):

- `backend.md`: red-before-green evidence (`.red-before-fix.txt`), gates, and
  the scenario table for `req~injection-scan~1` and `req~harness-state~1`.
- `cli.md`: the CLI contract. Covers `laws scan` text and `--json` (additive
  `lockError`, exit 0/1), `verify` on an unreadable lock, repeated `--question`,
  and the doctor remedy, plus how each was exercised in temp directories.

`api.md` is not owed: no HTTP endpoint or MCP tool schema or result changes.
