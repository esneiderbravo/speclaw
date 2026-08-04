# Proposal — add-branded-cli-header

## Why

speclaw's CLI output reads as flat and generic. Almost every command prints
straight to `console.log` with no branding: `speclaw help` is a bare `HELP`
string constant (`src/cli/index.ts:6`), `speclaw agent list` and
`speclaw index` open directly with their content. The one piece of brand
identity — the `banner()` in `src/cli/lib/ui.ts` — is printed in exactly one
place, `speclaw init` (`src/cli/commands/init.ts:42`). Anyone who installs the
library and runs anything other than `init` gets no visual signature at all.

This matters because:

- **First impression.** The CLI is the product's face for a `npm i -g` user.
  A consistent branded header across commands makes it feel finished and
  trustworthy instead of a bare script.
- **Recognition.** A repeated one-line brand strip (mark · name · version ·
  tagline) reinforces what tool the user is in and which version is installed —
  useful context on every invocation.
- **Cross-platform correctness.** The existing branded output assumes a UTF-8,
  truecolor terminal. On legacy Windows consoles (`cmd.exe` / conhost with a
  non-UTF-8 code page) the box-drawing and block glyphs (`╭╮╰╯│─ ▇█░`) can
  render as mojibake. There is currently **no unicode-capability fallback**, so
  "anyone who installs it sees it properly" is not yet true. This change closes
  that gap for the new header and hardens the existing `banner`/`box`/progress
  renderers at the same time.

## What

1. **A reusable one-line branded header.** Add `header()` to
   `src/cli/lib/ui.ts` rendering a single compact line —
   `◈ speclaw  v<version> · where specs become law` — in the brand cyan, using
   the cached `pkgVersion()` from `src/shared/version.ts`. It degrades to an
   ASCII form (`> speclaw  v<version> - where specs become law`) on terminals
   without reliable unicode, and to plain text when color is off.

2. **Central, once-per-invocation injection.** Print the header from a single
   place in `src/cli/index.ts` (the `dispatch`/`main` entrypoint), gated by an
   allowlist of interactive commands, so command handlers stay thin and
   presentation-free per `frontend-standards.md` / `architecture.md`. The header
   is shown for `help`, `update`, `agent`, `doctor`, `index`, `watch`, and
   `lawbook`. `init` is excluded because it already opens with the fuller
   multi-line `banner()`.

3. **Suppressed where output is consumed.** The header is **not** printed for
   `version`/`--version`/`-v` (must stay a bare scriptable stdout line), the
   Compass query family (`explore`, `search`, `recall`, `impact`, `trace` —
   their output is machine-consumed), or `mcp` (a long-running server on
   stdio). It is also skipped whenever stdout is not an interactive TTY, so
   pipes and CI stay clean, matching the existing `colorOn` discipline.

4. **A unicode-capability helper + glyph fallback.** Add `supportsUnicode()` to
   `src/cli/lib/ui.ts` (true on non-Windows; on Windows, true only under a
   modern terminal signal such as `WT_SESSION`, `TERM_PROGRAM`, or `CI`, no new
   dependency) and route the header — and the existing `banner`, `box`, and
   `renderProgress` — through a small glyph layer that substitutes ASCII
   equivalents when unicode is not reliable. This removes the mojibake risk on
   legacy Windows consoles without changing anything on modern terminals.

5. **Verification.** An e2e test drives the built CLI: `help` prints the header
   line before the usage text; `--version` stdout stays exactly the bare
   `package.json` version with no header; a query command's stdout carries no
   header; and header output is absent when stdout is piped (non-TTY). The
   unicode/ASCII glyph selection is verified by an isolated demo during manual
   verification (env-flag driven, no real-store writes).

## Non-goals

- **No color-depth downgrade.** Truecolor stays as-is; this change addresses
  glyph safety and header placement, not 256-/16-color fallbacks. The existing
  `NO_COLOR` / non-TTY gating already covers "no color" terminals.
- **No multi-line ASCII-art wordmark.** A tall figlet-style banner was
  considered and rejected (see `design.md`) — it wraps on narrow terminals and
  adds noise when repeated on every command. The header is a single line.
- **No change to what commands do.** Only a header line is added ahead of
  existing output for interactive commands; command logic, exit codes, and
  stdout payloads are untouched. `init` keeps its existing full `banner()` (the
  header does not replace it).
- **No new runtime dependency.** No `is-unicode-supported`, `chalk`, or figlet;
  the capability check and glyphs are a few lines in `ui.ts`.

## Migrations

None. No data, no schema, no config. This adds a presentation helper and one
central call site, plus a glyph-safety layer over existing renderers, and an
e2e test.
