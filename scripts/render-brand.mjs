// Render the brand SVGs under brand/ to the PNGs the README embeds
// (`npm run brand`). Text is set in Chivo / Chivo Mono loaded from the
// @fontsource dev dependencies only, never from system fonts, so the PNGs come
// out the same on every machine.
//
// Three constraints of @resvg/resvg-js 2.6.2 shape this script:
//   - it cannot read WOFF2, so the static per-weight .woff2 files are decoded to
//     TTF (wawoff2) in a throwaway temp dir before rendering;
//   - it ignores variable `wght` axes, hence the static per-weight packages and
//     not @fontsource-variable/*;
//   - it ignores the generic-family options (monospaceFamily, sansSerifFamily),
//     and the static files register as "Chivo Medium" / "Chivo Mono Medium" in
//     their name tables, so the SVG names 'Chivo' / 'Chivo Mono' are aliased to
//     those registered names before rendering. The SVG sources keep the site's
//     names.
// A missing font file stops the render with a non-zero exit naming the file.
import { Resvg } from "@resvg/resvg-js";
import wawoff2 from "wawoff2";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const names = [
  "speclaw-banner",
  "terminal-init",
  "terminal-quickstart",
  "terminal-cli",
  "terminal-mcp",
  "terminal-tree",
  "terminal-cortex",
  "cortex-loop",
  "diamond",
];

// The weights the brand SVGs use: sans 400 (text) and 800 (display), mono 400
// (text) and 700 (bold). Add a file here before using a new weight in an SVG.
const FONTS = [
  ["@fontsource/chivo", "chivo-latin-400-normal.woff2"],
  ["@fontsource/chivo", "chivo-latin-800-normal.woff2"],
  ["@fontsource/chivo-mono", "chivo-mono-latin-400-normal.woff2"],
  ["@fontsource/chivo-mono", "chivo-mono-latin-700-normal.woff2"],
];

const require = createRequire(import.meta.url);

function resolveFont(pkg, file) {
  const spec = `${pkg}/files/${file}`;
  let resolved;
  try {
    resolved = require.resolve(spec);
  } catch {
    resolved = join("node_modules", pkg, "files", file);
  }
  if (!existsSync(resolved)) {
    console.error(`render-brand: missing font file ${resolved} (from ${spec}).`);
    console.error("Install the dev dependencies with `npm install` and run again.");
    process.exit(1);
  }
  return resolved;
}

function aliasFamilies(svg) {
  return svg.replace(/'Chivo Mono'/g, "'Chivo Mono Medium'").replace(/'Chivo'/g, "'Chivo Medium'");
}

const sources = FONTS.map(([pkg, file]) => resolveFont(pkg, file));
const fontDir = mkdtempSync(join(tmpdir(), "speclaw-brand-fonts-"));
try {
  const fontFiles = [];
  for (const src of sources) {
    const ttf = join(fontDir, basename(src, ".woff2") + ".ttf");
    writeFileSync(ttf, Buffer.from(await wawoff2.decompress(readFileSync(src))));
    fontFiles.push(ttf);
  }
  for (const n of names) {
    const svg = aliasFamilies(readFileSync(`brand/${n}.svg`, "utf8"));
    const r = new Resvg(svg, {
      fitTo: { mode: "zoom", value: 2 },
      font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Chivo Medium" },
    });
    writeFileSync(`brand/${n}.png`, r.render().asPng());
    console.log("→", `brand/${n}.png`);
  }
} finally {
  rmSync(fontDir, { recursive: true, force: true });
}
