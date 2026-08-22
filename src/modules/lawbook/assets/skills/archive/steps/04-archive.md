# Archive

Run the `lawbook_archive` tool with the change name and today's date
(`YYYY-MM-DD`). It re-checks the gate deterministically and, if it passes,
moves `lawbook/changes/<name>/` to `lawbook/changes/archive/<date>-<name>/`.
If it refuses, resolve the reported blockers (unchecked tasks, missing
reports, unsynced specs) and retry.

Next: read `steps/05-report.md` and do only what it says.
