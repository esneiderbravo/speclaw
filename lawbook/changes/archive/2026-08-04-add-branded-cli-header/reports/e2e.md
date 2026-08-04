# e2e checks — add-branded-cli-header (2026-08-04)

Date: 2026-08-04 · Branch: `feat/add-branded-cli-header` · Environment: darwin,
Node v24.17.0, cwd `/Users/esneiderbravo/Projects/speclaw` (scratch repos under
`mktemp -d` for the query verification).

The change is confined to the interactive CLI surface (`src/cli/lib/ui.ts`,
`src/cli/index.ts`) plus the e2e harness. Per the `quality-gates` law that
surface is verified **by behavior** and excluded from the in-process coverage
denominator, so evidence is the e2e suite + the gates + agent-run manual
verification of the built binary. No `backend.md`/`frontend.md` — no module or
web-frontend code was touched.

## Gates & results

| Check | Command | Result |
|-------|---------|--------|
| Lint + format | `npm run check` | ✅ Prettier "All matched files use Prettier code style!" + ESLint clean |
| Type-check + compile | `npm run build` | ✅ `tsc` strict passed; `copy-assets: copied assets for 3 module(s)` |
| Tests + coverage | `npm test` | ✅ `tests 120 · pass 120 · fail 0`; coverage 97.80% lines / 91.80% branches / 98.04% functions (floor 80) |

## Tests added / updated

Added to `test/e2e/cli.test.ts` (four cases). The tagline `where specs become
law` is unique to the header, so its presence/count is the probe;
`FORCE_COLOR=1` (with `NO_COLOR` dropped) makes the spawned child treat itself as
interactive so the header renders over a pipe.

- **`help shows the branded header once, ahead of the usage text`** — asserts the
  tagline is present, that its index precedes `Usage: speclaw`, and that it
  occurs exactly once.
- **`piped (non-TTY) output omits the header`** — default `runCli` (non-TTY,
  `NO_COLOR`) `help`: tagline absent.
- **`--version emits no header even when forced interactive`** — under
  `FORCE_COLOR=1`, stdout equals the bare `package.json` version and carries no
  tagline (proves allowlist exclusion, not just the TTY gate).
- **`a query command emits no header even when forced interactive`** — seeds a
  scratch repo, indexes, then `search beta` under `FORCE_COLOR=1`: exit `0`, no
  tagline.

Harness change: `test/helpers/cli.ts` `runCli` now accepts `env` overrides
(with `undefined` meaning "unset"), so a test can drop `NO_COLOR` and force
color to exercise the branded output. Existing e2e cases are unchanged and still
pass (they run non-TTY, so the header is correctly absent).

## Spec-scenario coverage

Delta spec: `specs/cli/spec.md`.

| Scenario | Verified by |
|----------|-------------|
| `help` shows the branded header | e2e `help shows the branded header once…` + manual step 1 |
| The header appears once, ahead of command output | e2e `help shows the branded header once…` (count === 1, index < Usage) + manual step 4 (`agent list`) |
| `--version` stdout stays a bare version string | e2e `--version emits no header even when forced interactive` + manual step 3 |
| Query-command output carries no header | e2e `a query command emits no header…` + manual step 5 |
| Piped output omits the header | e2e `piped (non-TTY) output omits the header` + manual step 2 |
| Unicode-capable terminal uses unicode glyphs | manual step 6b (host darwin → `◈ … · …`) |
| Legacy console falls back to ASCII | manual step 6a (simulated `win32`, no `WT_SESSION`/`TERM_PROGRAM`/`CI` → `> … - …`) |

## Manual verification (agent-executed, isolated)

Built binary driven directly; the query check ran in a `mktemp -d` scratch repo
(no real-store writes); the glyph check dynamically imported the built
`dist/cli/lib/ui.js` with an overridden `process.platform` — pure in-process,
no store.

1. `FORCE_COLOR=1 … help` → header line `◈ speclaw  v0.1.15 · where specs become law` printed above the usage text.
2. `… help` (piped) → no header; usage text only.
3. `FORCE_COLOR=1 … --version` → `0.1.15` alone, no header.
4. `FORCE_COLOR=1 … agent list` → exactly one header line, then the agents table.
5. Scratch repo: `index` then `FORCE_COLOR=1 … search beta` → `1 result(s) · beta (function) sample.js:2`, zero header lines (`grep -c` = 0).
6. Glyph fallback: (a) simulated legacy Windows → `> speclaw  v0.1.15 - where specs become law`; (b) host terminal → `◈ speclaw  v0.1.15 · where specs become law`.

## Pre-existing / unrelated failures

None. All 120 tests pass; the coverage lines shown for other modules
(`indexer.js`, `query.js`, etc.) are pre-existing partial lines unrelated to this
change and well above the floor.

## Pending manual steps

None. The header is fully exercised by the e2e suite and the manual run above.

## Verdict

✅ Ready — branded header renders on interactive commands, degrades to ASCII on
legacy consoles, and never contaminates scriptable/consumed output. Gates green.
