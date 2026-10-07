# Complete

When Cortex stage is `done` (or the human stops the run), first delete the
status timer if one exists (`CronDelete` with the id `CronCreate` returned,
or the id `CronList` shows for this change), then summarize:

- Change name and final stage
- Review/test verdicts and iteration count
- Archive path if archived
- Anything still open for the human

No further steps remain — Cortex workflow complete.
