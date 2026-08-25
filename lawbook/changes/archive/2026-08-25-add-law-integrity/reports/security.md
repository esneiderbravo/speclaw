# Security checks — add-law-integrity (2026-08-25)

Date · Branch `feat/law-integrity` · cwd `/Users/esneiderbravo/Projects/speclaw`

## Threat model (this change)

| Threat | Mitigation |
| --- | --- |
| Rules File Backdoor (silent PR edit of AGENTS/CLAUDE/rules) | Committed `speclaw.lock` digests; strict paths fail `speclaw verify` |
| Agent/MCP auto-accepting digests | `laws accept` is TTY-only; no MCP tool mutates the lock |
| Prompt injection in rules/skills | Unicode-normalized detectors; skills/packs scanned; accept does not suppress scan errors |
| Lock under `.speclaw/` (invisible in PRs) | Lock lives at repo root only |

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Scan dogfood | `speclaw laws scan` | ✅ No injection findings on this repo |
| Verify folds integrity | `speclaw verify --ci --path src` | ✅ exit 0; scan errors would fail |
| Human-only accept | CLI without TTY | ✅ exit non-zero; lock unchanged |
| MCP surface | tool catalog assertion | ✅ no lock/accept/integrity-mutating tool |

## Honest limits

- Digests catch any edit; scanners catch known payload shapes — not LLM-grade semantic injection.
- No Sigstore / minisign of the lock in v1.
- Advisory paths (standards docs) warn without failing default `--fail-on error`.

## Spec-scenario coverage

| Scenario | Verified by |
| --- | --- |
| Instruction override detected | unit scan |
| Skill pack prose scanned | unit scan |
| Accept does not clear scan errors | unit integrity |
| No MCP tool mutates lock | unit accept |
| Accept without TTY fails | unit accept |

## Verdict

pass — digest pinning + injection scan + human-only accept hold for the Rules File Backdoor model.
