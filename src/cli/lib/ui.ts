// Brand-themed terminal UI. Colors come from the speclaw palette (cyan #2EE6E6
// = the "law", cream text, muted gray, green/amber for status) rendered as
// 24-bit truecolor ANSI — no dependency needed. Colors auto-disable when the
// output is not a TTY or NO_COLOR is set.

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
  (Boolean(process.stdout.isTTY) || process.env.FORCE_COLOR === "1") &&
  !process.env.NO_COLOR;

function paint(rgb: RGB, s: string): string {
  if (!colorOn) return s;
  return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${s}\x1b[0m`;
}
function bold(s: string): string {
  return colorOn ? `\x1b[1m${s}\x1b[0m` : s;
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
 * The speclaw wordmark + logo mark (a document whose bottom line — the law — is
 * highlighted in cyan). Printed at the top of `speclaw init`.
 */
export function banner(): void {
  const bar = c.cyan("▇▇▇▇▇▇");
  const line = c.muted("──────");
  const edge = c.muted;
  console.log();
  console.log("  " + edge("╭────────╮"));
  console.log("  " + edge("│ ") + line + edge(" │") + "   " + bold(c.cream("s p e c l a w")));
  console.log("  " + edge("│ ") + c.muted("────  ") + edge(" │") + "   " + c.muted("where specs become law"));
  console.log("  " + edge("│ ") + c.muted("─────") + " " + edge(" │"));
  console.log("  " + edge("│ ") + bar + edge(" │"));
  console.log("  " + edge("╰────────╯"));
  console.log();
}

/** Render a single-line progress bar on stderr (so stdout stays clean). */
export function renderProgress(done: number, total: number, label: string): void {
  if (!process.stderr.isTTY) return;
  const width = 26;
  const ratio = total > 0 ? done / total : 1;
  const filled = Math.round(ratio * width);
  const bar = c.cyan("█".repeat(filled)) + c.muted("░".repeat(width - filled));
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
  const top = title
    ? "╭─ " + c.cyanDim(title) + " " + "─".repeat(Math.max(0, width - title.length - 3))
    : "╭" + "─".repeat(width);
  console.log("  " + c.muted(top) + c.muted("╮"));
  for (const l of lines) console.log("  " + c.muted("│ ") + c.cream(l.padEnd(width - 2)) + c.muted(" │"));
  console.log("  " + c.muted("╰" + "─".repeat(width) + "╯"));
}
