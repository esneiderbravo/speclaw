# Performance checks — doc-hint-background (2026-10-08)

2026-10-08 · `fix/doc-hint-background` · `/tmp/ftd-clone` (clone of ftd-admin-finanzas: 1,211 indexed files, 47-file change)

## Gates & results

| Check | Command | 2.0.20 (installed) | 2.0.21 (branch) |
|-------|---------|--------------------|-----------------|
| Doc-hint hook call, new file set | `node /tmp/hooklat.mjs <cli>` (SDK stdio client → `speclaw_check` doc group) | **12,928 ms** → over the 5 s hook timeout, cancelled in Claude Code | 195–244 ms |
| Calls while measuring | same | — (blocked) | 32–41 ms |
| Level-3 hint delivered | same | only if the hook were allowed 13 s | after ~12–14 s, on a later call |
| Stop overhead (speclaw only, `--gate true`) | `speclaw ship far-1360-default-cost-center --gate true --no-archive` | 12.62 s (cold) | **0.24 s** with the edit hook's cache |

The real session that motivated this (ftd-admin-finanzas, 2026-10-08) logged 2 `hook_cancelled`
`PostToolUse:Bash` events and a lost level-3 hint; the stop then re-measured for ~11 s.

## Tests added / updated

See `backend.md`.

## Spec scenario coverage

See `backend.md`.

## Pre-existing / unrelated failures

None.

## Pending manual steps

None.

## Verdict

✅ PASS — the hook no longer waits on a measurement (12.9 s → ~35 ms) and the stop reuses it (12.6 s → 0.24 s).
