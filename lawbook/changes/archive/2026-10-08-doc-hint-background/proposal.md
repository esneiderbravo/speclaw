# doc-hint-background

## Why

In a real project (ftd-admin-finanzas, a 1,211-file repo with a 47-file change) the 2.0.20
documentation hint measured the diff inside the `PostToolUse` hook: 12.9 s against the hook's
5 s timeout. Claude Code cancelled the hook (2 cancellations in the session), the level-3 hint
was lost because its state was saved before delivery, the agent documented late, and each stop
measured the same diff again (~11–12.6 s).

## What changes

- The hook answers at once: on an unmeasured file set it starts `speclaw measure-diff` in a
  detached background process and returns no hint; the hint follows on a later call.
- Measurements are cached per file set in `.speclaw/level-cache.json`; ship reuses them at the
  stop.
- A level is recorded as told only when its hint is returned.
- While a measurement runs, the hook skips listing the branch's files (one `git status` + a stat).
- The Compass nudge strips shell quotes and escapes from a searched pattern.

## Impact

- Modules: `lawbook/ship.ts`, `cli` (`measure-diff`, help), `foundation/compass-nudge.ts`.
- Hook latency on that repo: 12.9 s (cancelled) → ~35 ms per call, hint after ~14 s; stop
  overhead 12.6 s → 0.24 s with the cache.
