// Brand-themed terminal UI. Colors come from the speclaw palette (cyan #2EE6E6
// = the "law", cream text, muted gray, green/amber for status) rendered as
// 24-bit truecolor ANSI — no dependency needed. Colors auto-disable when the
// output is not a TTY or NO_COLOR is set.

import { pkgVersion } from "../../shared/version.js";

type RGB = [number, number, number];

const PALETTE = {
  cyan: [46, 230, 230] as RGB, // #2EE6E6 — the accent / "law"
  cyanDim: [23, 193, 193] as RGB, // #17C1C1
  cream: [244, 241, 234] as RGB, // #F4F1EA — primary text
  muted: [110, 123, 128] as RGB, // #6E7B80 — secondary text
  green: [63, 185, 80] as RGB, // #3FB950 — success
  amber: [227, 179, 65] as RGB, // #E3B341 — warning
  red: [235, 90, 90] as RGB,
};

const colorOn =
  (Boolean(process.stdout.isTTY) || process.env.FORCE_COLOR === "1") && !process.env.NO_COLOR;

// Whether the terminal reliably renders the unicode box/block glyphs the brand
// output uses. Non-Windows terminals are assumed capable; a Windows console is
// trusted only under a modern-terminal signal (Windows Terminal, an embedding
// program like VS Code, or CI) — a legacy conhost with a non-UTF-8 code page
// would otherwise show mojibake. No dependency; the check runs once at load.
const unicodeOn =
  process.platform !== "win32" ||
  Boolean(process.env.WT_SESSION || process.env.TERM_PROGRAM || process.env.CI);

// The brand glyph set, resolved once against terminal capability. Every branded
// renderer (header, banner, box, progress) draws from this so unicode and ASCII
// terminals degrade together instead of one surface emitting unrenderable
// glyphs. The ASCII fallbacks are chosen to preserve each drawing's shape.
const G = unicodeOn
  ? {
      diamond: "◈",
      dot: "·",
      boxTL: "╭",
      boxTR: "╮",
      boxBL: "╰",
      boxBR: "╯",
      boxV: "│",
      boxH: "─",
      bar: "▇",
      fill: "█",
      track: "░",
    }
  : {
      diamond: ">",
      dot: "-",
      boxTL: "+",
      boxTR: "+",
      boxBL: "+",
      boxBR: "+",
      boxV: "|",
      boxH: "-",
      bar: "#",
      fill: "#",
      track: "-",
    };

function paint(rgb: RGB, s: string): string {
  if (!colorOn) return s;
  return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${s}\x1b[0m`;
}
function bold(s: string): string {
  return colorOn ? `\x1b[1m${s}\x1b[0m` : s;
}

/**
 * Wrap `label` in an OSC 8 terminal hyperlink pointing at `url`, so a
 * capable terminal renders it as a clickable link. Terminals that don't
 * support OSC 8 simply ignore the escapes and show the label. Falls back to a
 * plain `label (url)` when rich output is off (non-TTY / NO_COLOR) so piped and
 * dumb-terminal output stays legible.
 *
 * @param label - The visible, clickable text.
 * @param url - The target the terminal opens on click.
 * @returns The label wrapped as a hyperlink, or `label (url)` when off.
 */
export function link(label: string, url: string): string {
  if (!colorOn) return `${label} (${url})`;
  return `\x1b]8;;${url}\x1b\\${label}\x1b]8;;\x1b\\`;
}

/** Brand color helpers for composing styled strings. */
export const c = {
  cyan: (s: string) => paint(PALETTE.cyan, s),
  cyanDim: (s: string) => paint(PALETTE.cyanDim, s),
  cream: (s: string) => paint(PALETTE.cream, s),
  muted: (s: string) => paint(PALETTE.muted, s),
  green: (s: string) => paint(PALETTE.green, s),
  amber: (s: string) => paint(PALETTE.amber, s),
  red: (s: string) => paint(PALETTE.red, s),
  bold,
};

/** Styled output primitives used across the CLI. */
export const ui = {
  heading: (s: string) => console.log("\n" + bold(c.cyan(s))),
  step: (s: string) => console.log("\n" + c.cyan("◇ ") + bold(c.cream(s))),
  ok: (s: string) => console.log("  " + c.green("✓") + " " + c.cream(s)),
  info: (s: string) => console.log("  " + c.muted(s)),
  warn: (s: string) => console.log("  " + c.amber("!") + " " + c.cream(s)),
  err: (s: string) => console.error("  " + c.red("✗") + " " + c.cream(s)),
  plain: (s = "") => console.log(s),
  code: (s: string) => c.cyan(s),
};

/**
 * A single-line branded header — mark · name · installed version · tagline —
 * printed once at the top of interactive commands (see `src/cli/index.ts`). The
 * version comes from the cached {@link pkgVersion}. Glyphs degrade to ASCII on
 * terminals without reliable unicode, and the styling no-ops to plain text when
 * color is off, so the line stays legible everywhere.
 *
 * Example: `◈ speclaw  v0.1.15 · where specs become law`
 */
export function header(): void {
  const mark = c.cyan(G.diamond);
  const name = bold(c.cream("speclaw"));
  const ver = c.muted("v" + pkgVersion());
  const tag = c.muted(G.dot + " where specs become law");
  console.log(`${mark} ${name}  ${ver} ${tag}`);
}

/**
 * The speclaw wordmark + logo mark (a document whose bottom line — the law — is
 * highlighted in cyan). Printed at the top of `speclaw init`.
 */
export function banner(): void {
  const H = G.boxH;
  const bar = c.cyan(G.bar.repeat(6));
  const line = c.muted(H.repeat(6));
  const edge = c.muted;
  console.log();
  console.log("  " + edge(G.boxTL + H.repeat(8) + G.boxTR));
  console.log(
    "  " + edge(G.boxV + " ") + line + edge(" " + G.boxV) + "   " + bold(c.cream("s p e c l a w")),
  );
  console.log(
    "  " +
      edge(G.boxV + " ") +
      c.muted(H.repeat(4) + "  ") +
      edge(" " + G.boxV) +
      "   " +
      c.muted("where specs become law"),
  );
  console.log("  " + edge(G.boxV + " ") + c.muted(H.repeat(5)) + " " + edge(" " + G.boxV));
  console.log("  " + edge(G.boxV + " ") + bar + edge(" " + G.boxV));
  console.log("  " + edge(G.boxBL + H.repeat(8) + G.boxBR));
  console.log();
}

/** Render a single-line progress bar on stderr (so stdout stays clean). */
export function renderProgress(done: number, total: number, label: string): void {
  if (!process.stderr.isTTY) return;
  const width = 26;
  const ratio = total > 0 ? done / total : 1;
  const filled = Math.round(ratio * width);
  const bar = c.cyan(G.fill.repeat(filled)) + c.muted(G.track.repeat(width - filled));
  const pct = c.cyanDim(String(Math.round(ratio * 100)).padStart(3) + "%");
  const shortLabel = label.length > 38 ? "…" + label.slice(-37) : label;
  process.stderr.write(`\r  ${bar} ${pct}  ${c.muted(shortLabel.padEnd(38))}`);
}

export function clearProgress(): void {
  if (process.stderr.isTTY) process.stderr.write("\r" + " ".repeat(80) + "\r");
}

/** Draw a cyan-bordered block (used for the copy-paste agent prompt). */
export function box(lines: string[], title?: string): void {
  const width = Math.min(72, Math.max(...lines.map((l) => l.length), title?.length ?? 0) + 2);
  const H = G.boxH;
  const top = title
    ? G.boxTL + H + " " + c.cyanDim(title) + " " + H.repeat(Math.max(0, width - title.length - 3))
    : G.boxTL + H.repeat(width);
  console.log("  " + c.muted(top) + c.muted(G.boxTR));
  for (const l of lines)
    console.log(
      "  " + c.muted(G.boxV + " ") + c.cream(l.padEnd(width - 2)) + c.muted(" " + G.boxV),
    );
  console.log("  " + c.muted(G.boxBL + H.repeat(width) + G.boxBR));
}
