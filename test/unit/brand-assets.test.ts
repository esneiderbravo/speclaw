// Guards the brand sources under brand/ against the retired palette, retired
// fonts, a drifted mark, and glyphs the bundled Chivo latin subset cannot draw
// (the PNG renderer loads no system fonts, so such a glyph would render blank).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { retiredHexesIn } from "../helpers/brand.js";

const BRAND = path.join(process.cwd(), "brand");
const svgs = fs
  .readdirSync(BRAND)
  .filter((f) => f.endsWith(".svg"))
  .sort()
  .map((f) => ({ name: f, text: fs.readFileSync(path.join(BRAND, f), "utf8") }));

const LIGHT = new Set(["speclaw-banner-light.svg", "speclaw-mark-light.svg"]);
// Assets drawn without a ground of their own: the transparent marks and the README section marker.
const GROUNDLESS = new Set(["speclaw-mark.svg", "speclaw-mark-light.svg", "diamond.svg"]);
const MARKED = [
  "speclaw-banner.svg",
  "speclaw-banner-light.svg",
  "speclaw-favicon.svg",
  "speclaw-mark.svg",
  "speclaw-mark-light.svg",
];

// Printable ASCII, Latin-1, and the punctuation the Chivo latin subset carries.
const RENDERABLE = /^[\s\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]$/u;

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** The character data of every <text> element, tags stripped. */
function textContent(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((m) =>
    decode(m[1]!.replace(/<[^>]+>/g, "")),
  );
}

/** Every font-family value, from CSS declarations and presentation attributes. */
function fontFamilies(svg: string): string[] {
  const css = [...svg.matchAll(/font-family:\s*([^;}"]+)/g)].map((m) => m[1]!.trim());
  const attr = [...svg.matchAll(/font-family="([^"]+)"/g)].map((m) => m[1]!.trim());
  return [...css, ...attr];
}

test("the brand directory holds the expected SVG set", () => {
  assert.ok(svgs.length >= 13, `found ${svgs.length} SVGs`);
  for (const name of MARKED)
    assert.ok(
      svgs.some((s) => s.name === name),
      `${name} exists`,
    );
});

test("no retired palette color remains in any brand SVG", () => {
  for (const { name, text } of svgs) assert.deepEqual(retiredHexesIn(text), [], name);
});

test("no brand SVG names SF Mono or JetBrains Mono", () => {
  for (const { name, text } of svgs) assert.doesNotMatch(text, /SF Mono|JetBrains Mono/i, name);
});

test("every font stack names Chivo first", () => {
  for (const { name, text } of svgs) {
    for (const stack of fontFamilies(text)) {
      assert.match(stack, /^'Chivo( Mono)?'\s*,/, `${name}: ${stack}`);
    }
  }
});

test("text uses only glyphs the bundled Chivo latin subset can draw", () => {
  for (const { name, text } of svgs) {
    for (const t of textContent(text)) {
      const bad = [...t].filter((ch) => !RENDERABLE.test(ch));
      assert.deepEqual(bad, [], `${name}: "${t}"`);
    }
  }
});

test("dark assets carry signal and sit on paper", () => {
  for (const { name, text } of svgs) {
    if (LIGHT.has(name)) continue;
    const lower = text.toLowerCase();
    assert.ok(lower.includes("#00e3fd"), `${name} uses signal #00e3fd`);
    if (!GROUNDLESS.has(name)) {
      assert.ok(/#131313|#0d0d0e/.test(lower), `${name} sits on paper or paper-sunk`);
    }
  }
});

test("light assets use the bond tokens", () => {
  for (const { name, text } of svgs) {
    if (!LIGHT.has(name)) continue;
    const lower = text.toLowerCase();
    assert.ok(lower.includes("#131313"), `${name} sets ink #131313`);
    assert.ok(lower.includes("#00707f"), `${name} uses bond signal #00707f`);
    assert.doesNotMatch(lower, /#00e3fd/, `${name} keeps the dark signal out`);
    if (!GROUNDLESS.has(name))
      assert.ok(/#f4f4f3|#ffffff/.test(lower), `${name} sits on bond paper`);
  }
});

test("every mark matches the site geometry", () => {
  for (const name of MARKED) {
    const text = svgs.find((s) => s.name === name)!.text;
    assert.match(text, /<rect x="5" y="3\.5" width="21" height="25" fill="none"/, `${name} page`);
    for (const line of ["M10 11h11", "M10 15.5h11", "M10 20h7"]) {
      assert.ok(text.includes(`d="${line}"`), `${name} text line ${line}`);
    }
    const law = /d="M10 24\.5h(\d+(?:\.\d+)?)"/.exec(text);
    assert.ok(law, `${name} draws the law line`);
    assert.ok(10 + Number(law![1]) > 26, `${name} law line runs past the page edge`);
  }
});

test("the PNG renderer loads only the bundled Chivo fonts", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts", "render-brand.mjs"), "utf8");
  assert.match(src, /loadSystemFonts:\s*false/);
  for (const file of [
    "chivo-latin-400-normal.woff2",
    "chivo-latin-800-normal.woff2",
    "chivo-mono-latin-400-normal.woff2",
    "chivo-mono-latin-700-normal.woff2",
  ]) {
    assert.ok(src.includes(file), `renderer loads ${file}`);
  }
  assert.match(src, /process\.exit\(1\)/, "a missing font exits non-zero");
});
