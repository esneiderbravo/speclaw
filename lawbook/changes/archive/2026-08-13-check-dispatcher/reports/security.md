# Security checks — check-dispatcher (2026-08-13)

Date · 2026-08-13 · Branch `feat/check-dispatcher` · Environment: local macOS, Node ≥22, cwd `/Users/esneiderbravo/Projects/speclaw`

Enforcement is a security-adjacent surface: it decides whether an agent action proceeds, blocks sensitive-file edits, and merges into a shared settings file. The concerns below were each verified.

## Gates & results

| Concern | How verified | Result |
| :-- | :-- | :-- |
| Fail-open (a crashed evaluator never blocks) | `unit/check.test.ts` missing + corrupt manifest; CLI unparseable-stdin run | ✅ verdict `allow` + diagnostic in every failure path |
| Secret protection is real enforcement | seed law `law~no-secrets-in-repo~1` (`bloqueo`, `**/.env*`); manual PreToolUse deny | ✅ editing `.env`/`config/.env` is denied at the keystroke |
| Merge never deletes foreign hooks | `unit/hooks.test.ts` "preserves foreign entries"; identity `{type:"mcp_tool",server:"speclaw"}` | ✅ only speclaw-owned entries are replaced |
| Never clobber an unparseable settings file | `unit/hooks.test.ts` "never clobbers an unparseable settings file" | ✅ file left byte-for-byte; reported as skipped |
| Honest reporting of unenforced agents | `integration/hooks.test.ts` doctor asymmetry | ✅ `doctor` names agents where blocking laws apply only via `speclaw verify` |
| Malformed glob can't silently disable a law | `unit/hooks.test.ts` exclusion; `doctor` glob validation | ✅ caught at generation, law excluded + reported, never a silent zero-match at runtime |

## Threat-model notes

- **Fail-open is a deliberate security trade-off**: an enforcement layer that blocks the agent when its own checker crashes is worse than none (it trains users to disable it). Blocking is reserved for laws explicitly marked `bloqueo`; a new law defaults to `feedback`. Documented in `design.md`.
- **No new attack surface / no new dependency**: the evaluator is pure TS over the local manifest (LAWS.md law 1 — local-first). No network, no shell-out on the hot path; the `mcp_tool` hook runs in the already-live MCP server (no per-call process spawn).
- **Context-log** (`.speclaw/context-log.jsonl`) is append-only, gitignored, and contains only law ids + filenames + timestamps — no secrets or code content.
- **Isolation**: all verification ran against ephemeral `mktemp` project dirs, removed afterward. No real data store was touched.

## Pre-existing / unrelated failures

None.

## Pending manual steps

None.

## Verdict

✅ Pass — fail-open, non-destructive merge, and honest asymmetry reporting all verified; no new dependency or network surface introduced.
