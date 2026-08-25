# Backend checks — add-law-integrity (2026-08-25)

Date · Branch `feat/law-integrity` · Environment: local Node · cwd `/Users/esneiderbravo/Projects/speclaw`

## Gates & results

| Check | Command | Result |
| --- | --- | --- |
| Format + lint | `npm run check` | ✅ Prettier clean · ESLint clean |
| Build | `npm run build` | ✅ `tsc` + copy-assets |
| Tests + coverage | `npm run test` | ✅ **476 pass** / 0 fail · lines ~85.4% · branches ~80.7% · functions ~85.1% |
| Manual CLI | `speclaw laws lock` / `scan` / `verify --ci --path src` | ✅ lock written · scan clean · verify exit 0 |

## Tests added / updated

| Test | Asserts |
| --- | --- |
| `test/unit/lock.test.ts` | canonicalize CRLF/LF, provenance strip, refresh root lock, extract yaml block |
| `test/unit/scan.test.ts` | detectors, suppressions, speclaw HTML skip, allowlist URLs |
| `test/unit/integrity.test.ts` | soft missing lock, strict/advisory mismatch, symlink, accept+scan |
| `test/unit/accept.test.ts` | accept audit entry · non-TTY CLI fails · no MCP lock tool |
| `test/integration/integrity.test.ts` | scaffold lock · CLI lock/scan · doctor lock/imports |
| `test/unit/doctor-report.test.ts` | frozen ids include integrity checks |

## Spec-scenario coverage (new requirements)

| Scenario | Verified by |
| --- | --- |
| Lockfile at repo root (not `.speclaw/`) | unit lock + dogfood `speclaw.lock` |
| CRLF vs LF same digest | unit canonicalize |
| Provenance excluded from digests | unit provenance |
| Modified AGENTS fails verify | unit integrity |
| Modified standards warns only | unit integrity |
| Missing lock soft | unit integrity |
| Injection override / skill scan | unit scan |
| Accept does not clear scan errors | unit integrity |
| Accept without TTY fails | unit accept (spawn CLI) |
| No MCP tool mutates lock | unit accept tool list |
| Init/scaffold refreshes lock | integration scaffold |
| Doctor lock root / imports | integration doctor |

## Pre-existing / unrelated failures

none (unknown deps laws under `--path src` are pre-existing unresolved refs; not integrity)

## Pending manual steps

none for backend; archive + PR remain.

## Verdict

Backend lock / scan / verifyIntegrity / accept wiring verified green.
