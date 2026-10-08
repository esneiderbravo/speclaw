// Brand-themed terminal UI. Colors come from the speclaw site's ink theme
// (`app/tokens.css` in speclaw-site): signal cyan #00E3FD = the "law" accent,
// ink #F4F4F3 primary text, ink-faint #999EA3 secondary text, deny #FF5C47 for
// errors, and green/amber re-tuned for success/warning. Every color holds at
// least 4.5:1 (WCAG 2.x) against the ink paper #131313. They render as 24-bit
// truecolor ANSI — no dependency needed — and auto-disable when the output is
// not a TTY or NO_COLOR is set.

import { pkgVersion } from "../../shared/version.js";

type RGB = readonly [number, number, number];

// Covers: req~brand-terminal-palette~1
export const PALETTE = Object.freeze({
  cyan: [0, 227, 253] as RGB, // #00E3FD — signal: the accent / "law"
  cyanDim: [0, 227, 253] as RGB, // #00E3FD — signal (the site has no mid cyan for text)
  cream: [244, 244, 243] as RGB, // #F4F4F3 — ink: primary text
  muted: [153, 158, 163] as RGB, // #999EA3 — ink-faint: secondary text
  green: [62, 207, 122] as RGB, // #3ECF7A — success (re-tuned)
  amber: [245, 183, 61] as RGB, // #F5B73D — warning (re-tuned)
  red: [255, 92, 71] as RGB, // #FF5C47 — deny: errors
} satisfies Record<string, RGB>);

// The same slots tuned for a light terminal: the ink palette is near-invisible
// on white (cream is ~1.1:1, signal cyan ~1.6:1), so each slot here holds at
// least 4.5:1 against white paper #FFFFFF instead.
// Covers: req~brand-terminal-palette~1
export const LIGHT_PALETTE = Object.freeze({
  cyan: [0, 122, 140] as RGB, // #007A8C — deep signal
  cyanDim: [0, 122, 140] as RGB, // #007A8C
  cream: [31, 35, 40] as RGB, // #1F2328 — primary text on light paper
  muted: [95, 102, 112] as RGB, // #5F6670 — secondary text
  green: [26, 127, 55] as RGB, // #1A7F37 — success
  amber: [154, 103, 0] as RGB, // #9A6700 — warning
  red: [207, 34, 46] as RGB, // #CF222E — errors
} satisfies Record<keyof typeof PALETTE, RGB>);

export type Theme = "dark" | "light";

/**
 * The theme an explicit signal asks for: `SPECLAW_THEME=light|dark` wins, then
 * `COLORFGBG` (`fg;bg`, set by rxvt, Konsole, and others), whose background
 * index 7 or 15 means a light terminal. Returns `undefined` when neither says.
 */
export function themeFromEnv(env: NodeJS.ProcessEnv = process.env): Theme | undefined {
  const forced = env.SPECLAW_THEME?.toLowerCase();
  if (forced === "light" || forced === "dark") return forced;
  const bg = env.COLORFGBG?.split(";").pop();
  if (bg === undefined || bg === "") return undefined;
  return bg === "7" || bg === "15" ? "light" : "dark";
}

let active: Record<keyof typeof PALETTE, RGB> =
  themeFromEnv() === "light" ? LIGHT_PALETTE : PALETTE;

/** Switch every brand color to the given theme's palette. */
export function setTheme(theme: Theme): void {
  active = theme === "light" ? LIGHT_PALETTE : PALETTE;
}

/**
 * The theme an OSC 11 background-color reply implies
 * (`ESC ] 11 ; rgb:RRRR/GGGG/BBBB` with 1–4 hex digits per channel): light when
 * the background's relative luminance is above one half.
 */
export function themeFromOsc11(reply: string): Theme | undefined {
  const m = /rgb:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})/i.exec(reply);
  if (!m) return undefined;
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((h) => parseInt(h, 16) / (16 ** h.length - 1));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.5 ? "light" : "dark";
}

// Ask the terminal for its background color. Terminals that don't support the
// query never answer, so the wait is capped; a reply arriving after the cap
// would land in the next prompt's input, hence a generous-but-short window.
function queryBackground(timeoutMs = 200): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY || !process.stdout.isTTY || typeof stdin.setRawMode !== "function") {
    return Promise.resolve("");
  }
  return new Promise((resolve) => {
    let buf = "";
    const wasRaw = stdin.isRaw;
    const done = (): void => {
      clearTimeout(timer);
      stdin.off("data", onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      resolve(buf);
    };
    const onData = (d: Buffer): void => {
      buf += d.toString("latin1");
      if (buf.includes("\x07") || buf.includes("\x1b\\")) done();
    };
    const timer = setTimeout(done, timeoutMs);
    stdin.setRawMode(true);
    stdin.on("data", onData);
    stdin.resume();
    process.stdout.write("\x1b]11;?\x07");
  });
}

// macOS appearance as a last resort: most terminals there follow the system
// theme by default. `AppleInterfaceStyle` exists only in dark mode.
async function macAppearance(): Promise<Theme | undefined> {
  if (process.platform !== "darwin") return undefined;
  const { execFile } = await import("node:child_process");
  return new Promise((resolve) => {
    execFile("defaults", ["read", "-g", "AppleInterfaceStyle"], { timeout: 500 }, (err, out) => {
      if (err && typeof err.code !== "number") return resolve(undefined);
      resolve(/dark/i.test(String(out)) ? "dark" : "light");
    });
  });
}

/**
 * Detect the terminal's background and switch to the matching palette. An
 * explicit env signal ({@link themeFromEnv}) wins; otherwise the terminal is
 * asked directly (OSC 11), then the macOS appearance is consulted. Meant for
 * interactive commands before their first styled line; does nothing when
 * color is off.
 */
export async function detectTheme(): Promise<Theme> {
  const fromEnv = themeFromEnv();
  let theme: Theme = fromEnv ?? "dark";
  if (colorOn && !fromEnv) {
    theme = themeFromOsc11(await queryBackground()) ?? (await macAppearance()) ?? "dark";
  }
  setTheme(theme);
  // Child speclaw processes (a self-update re-run) inherit the answer instead
  // of querying the terminal again.
  process.env.SPECLAW_THEME ??= theme;
  return theme;
}

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
  cyan: (s: string) => paint(active.cyan, s),
  cyanDim: (s: string) => paint(active.cyanDim, s),
  cream: (s: string) => paint(active.cream, s),
  muted: (s: string) => paint(active.muted, s),
  green: (s: string) => paint(active.green, s),
  amber: (s: string) => paint(active.amber, s),
  red: (s: string) => paint(active.red, s),
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
