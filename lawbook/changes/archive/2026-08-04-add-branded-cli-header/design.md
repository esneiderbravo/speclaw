# Design — add-branded-cli-header

## Approach

Add one reusable presentation helper and inject it from a single place, gated so
the branded look shows up for humans and never leaks into scriptable output.
Three source touches (`src/cli/lib/ui.ts`, `src/cli/index.ts`, and the glyph
routing of existing renderers in `ui.ts`) plus an e2e test. No new dependency.

### 1. The header helper — `src/cli/lib/ui.ts`

A single-line header, styled with the existing brand palette:

```ts
// ◈ speclaw  v0.1.15 · where specs become law   (ASCII: > speclaw  v0.1.15 - ...)
export function header(): void {
  const g = glyphs();
  const mark = c.cyan(g.diamond);
  const name = bold(c.cream("speclaw"));
  const ver = c.muted("v" + pkgVersion());
  const tag = c.muted(g.dot + " where specs become law");
  console.log(`${mark} ${name}  ${ver} ${tag}`);
}
```

- **Version** comes from the already-cached `pkgVersion()` (`src/shared/version.ts`)
  — no new read, consistent with `update`, the notifier, and `version`.
- **Color** reuses the existing `c.*`/`bold` helpers, which already no-op when
  `colorOn` is false (non-TTY / `NO_COLOR`), so the plain-text fallback is free.
- **Glyphs** (`◈`, `·`) come from the `glyphs()` layer below so a legacy console
  gets `>` and `-` instead of mojibake.

### 2. Central injection — `src/cli/index.ts`

The header is printed from one place so command handlers stay thin
(`frontend-standards.md:13`, `architecture.md:39`). A small allowlist drives it,
checked in `dispatch` (or a helper called from `main` before `dispatch`):

```ts
const HEADER_COMMANDS = new Set([
  undefined, "help", "--help", "-h",
  "update", "agent", "doctor", "index", "watch", "lawbook",
]);

function maybeHeader(cmd: string | undefined): void {
  if (!process.stdout.isTTY) return;          // pipes / CI stay clean
  if (!HEADER_COMMANDS.has(cmd)) return;      // version / query family / mcp excluded
  header();
}
```

- **TTY gate** mirrors the `colorOn` discipline already in `ui.ts:18` — the
  header is a human affordance, so non-interactive stdout never sees it. This is
  what keeps `v=$(speclaw --version)` and piped `help` clean even though the set
  membership would otherwise allow `help`.
- **Exclusion by omission.** `version`/`--version`/`-v`, the query family
  (`explore`/`search`/`recall`/`impact`/`trace`), and `mcp` are simply not in
  the set — their stdout is consumed (a bare version string, query results) or
  is a long-running stdio server, so a header would corrupt it.
- **`help`'s own header.** `help` prints via `console.log(HELP)`; the header is
  emitted just before it. `init` is **excluded** from the set — it already opens
  with the fuller multi-line `banner()`, so adding the one-line header would
  brand it twice. Every eligible command therefore emits exactly one header
  line, and `init` keeps its existing banner unchanged.

### 3. Unicode safety — `unicodeOn` + the `G` glyph set in `ui.ts`

Resolved once at module load, mirroring the existing `colorOn` constant in the
same file (env/platform don't change mid-run), so there is no per-call cost and
no exported surface:

```ts
const unicodeOn =
  process.platform !== "win32" ||
  Boolean(process.env.WT_SESSION || process.env.TERM_PROGRAM || process.env.CI);

const G = unicodeOn
  ? { diamond: "◈", dot: "·", boxTL: "╭", boxTR: "╮", boxBL: "╰", boxBR: "╯", boxV: "│", boxH: "─", bar: "▇", fill: "█", track: "░" }
  : { diamond: ">", dot: "-", boxTL: "+", boxTR: "+", boxBL: "+", boxBR: "+", boxV: "|", boxH: "-", bar: "#", fill: "#", track: "-" };
```

The existing `banner()`, `box()`, and `renderProgress()` currently hard-code
unicode box/block glyphs; they are re-routed through `G` so the whole branded
surface degrades together. This is the mechanism that makes the change's
cross-platform requirement real rather than aspirational.

### 4. Tests / verification

The `quality-gates` law designates the interactive CLI surface
(`src/cli/**`, `src/cli/lib/{ui,update-check}`) as **verified by behavior,
excluded from the in-process coverage denominator** — no in-process test imports
those modules. So verification is e2e + an isolated manual demo, mirroring
`add-version-command`:

- **e2e** (`test/e2e/cli.test.ts`): with a forced TTY/`FORCE_COLOR` signal,
  `help` output includes the header line and the tagline ahead of `Usage:`;
  `--version` stdout equals the bare `package.json` version with no header;
  a query command's stdout has no header; and when stdout is piped (non-TTY) the
  header is absent.
- **No in-process unit test** for `header`/`glyphs`/`supportsUnicode` — importing
  them pulls the CLI-surface modules into the coverage denominator, against the
  law.
- **Glyph selection** (unicode vs. ASCII by platform/env) is verified by an
  **isolated demo** during manual verification: run the header with a simulated
  legacy-Windows signal (unset `WT_SESSION`/`TERM_PROGRAM`/`CI`,
  `platform=win32`) and confirm ASCII output; run it on the host and confirm
  unicode. No real-store writes.

## Alternatives weighed

1. **One-line strip (chosen) vs. boxed mark vs. ASCII-art wordmark.** The user
   selected the one-line strip: lowest noise when repeated on every interactive
   command, safest across terminal widths, and the least glyph-fragile. The
   boxed mark (a refined `banner()`) is retained only for `init`. The multi-line
   ASCII-art wordmark was rejected — it wraps on narrow terminals and dominates
   short command output.

2. **Central injection (chosen) vs. per-command calls.** Per-command `header()`
   calls would scatter presentation across handlers and risk double-printing or
   drift; the allowlist in `index.ts` keeps handlers thin per the standards and
   guarantees exactly one header per run.

3. **Show on all commands vs. interactive allowlist (chosen).** Printing on
   `version`/query/`mcp` would corrupt consumed output. The TTY gate alone is
   not enough (a user piping `search` into a pager is still a TTY on stdin but
   we key off stdout being a TTY; query output is data regardless), so those
   commands are excluded by set membership as well as by the TTY gate.

4. **Glyph fallback vs. force UTF-8.** Forcing the Windows code page to UTF-8
   (`chcp 65001`) from the CLI is invasive and can fail; a capability check with
   ASCII substitutes is local, reversible, and dependency-free.

5. **`is-unicode-supported` dependency vs. inline check.** The inline check is a
   few lines and avoids adding a runtime dependency to a package that prides
   itself on being self-contained (`package.json` description).

## Trade-offs

- **Unicode detection is heuristic on Windows.** A modern console that sets none
  of `WT_SESSION`/`TERM_PROGRAM`/`CI` falls back to ASCII — safe but slightly
  plainer than it could be. Accepted: correctness (never mojibake) over maximal
  prettiness, and an env-based escape hatch can be added later if needed.
- **Header adds one line to interactive output.** Marginal vertical cost, only
  for TTY human runs, never for pipes/scripts. Accepted as the point of the
  change.
- **CLI-surface path not unit-covered.** Consistent with the law's behavioral
  model; covered by e2e + manual demo. Accepted.

## Affected files

- **Source:** `src/cli/lib/ui.ts` (`header`, the `unicodeOn`/`G` glyph layer, and
  routing `banner`/`box`/`renderProgress` through `G`), `src/cli/index.ts`
  (`HEADER_COMMANDS` allowlist + `maybeHeader` call in `main`).
- **Tests:** `test/e2e/cli.test.ts` (header present on `help`; absent on
  `--version`, query, and piped output) and `test/helpers/cli.ts` (`runCli` env
  overrides).
- **Docs:** none under `docs/standards/` — the terminal UI stays governed by the
  existing `frontend-standards.md` stub; no HELP text change is required.
