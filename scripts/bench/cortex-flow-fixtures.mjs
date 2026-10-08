/**
 * Fixtures for `scripts/bench/cortex-flow.mjs`: the repos a real agent works
 * in, the hidden acceptance tests that grade it, and the reference solutions
 * the dry run applies instead of an agent. Every writer takes the directory to
 * write into — always a throwaway fixture under the bench temp dir.
 *
 *   full    — a feature (coupons) across catalog/cart/orders, a new module,
 *             the public entry and package.json: sized for level 2–3.
 *   fanout  — three large, independent modules (csv, duration, semver).
 *   review  — a bug change already built on a branch, with planted process
 *             defects for the reviewer to catch.
 *
 * Plain Node ESM, node: modules only.
 */
import fs from "node:fs";
import path from "node:path";

/** Write `body` at `rel` under `dir`, creating parents. */
function put(dir, rel, body) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

const pkg = (extra = {}) =>
  JSON.stringify(
    { name: "shop", version: "1.0.0", type: "module", scripts: { test: "node --test" }, ...extra },
    null,
    2,
  ) + "\n";

const testHead = `import { test } from "node:test";\nimport assert from "node:assert/strict";\n`;

// ---------------------------------------------------------------- full

const FULL_TASK = `# Feature: coupons

Add coupon support to this shop library. Keep every existing test passing and
add tests for the new behaviour.

1. A new module \`src/coupons/coupons.js\` exporting \`validateCoupon(code, subtotal, now = new Date())\`
   and a \`CouponError\` class (extends \`Error\`, with a \`reason\` property).
   Known codes (case-insensitive):
   - \`SAVE10\` — 10% off the subtotal.
   - \`FLAT5\` — 5.00 off; requires a subtotal of at least 20.00
     (otherwise \`reason: "min-subtotal"\`).
   - \`SPRING\` — 15% off; expired at 2020-06-01T00:00:00Z
     (after that, \`reason: "expired"\`).
   Any other code throws \`reason: "unknown"\`. On success it returns
   \`{ code, discount }\` with \`code\` upper-cased and \`discount\` in currency
   units, rounded to cents, never more than the subtotal.
2. \`applyCoupon(cart, code)\` in \`src/cart/cart.js\`: validates against the
   cart's current subtotal and stores the upper-cased code on the cart
   (\`cart.coupon\`). An invalid code throws the \`CouponError\` and leaves the cart
   unchanged.
3. \`placeOrder(cart, now)\` in \`src/orders/orders.js\`: the discount applies
   before tax; tax (19%) is charged on the discounted amount; the order gains
   a \`discount\` field and keeps \`subtotal\`, \`tax\`, \`total\` — all rounded to
   cents. A coupon that is no longer valid when the order is placed throws.
4. Export \`validateCoupon\`, \`CouponError\` and \`applyCoupon\` from the public entry
   \`src/index.js\`.
5. Declare the public entry in \`package.json\`:
   \`"exports": { ".": "./src/index.js" }\`.
`;

const fullSrc = {
  "src/pricing/money.js": `/** Round a money amount to cents, half away from zero. */\nexport function roundCents(x) {\n  return Math.round((x + Number.EPSILON) * 100) / 100;\n}\n`,
  "src/catalog/products.js": `const PRODUCTS = [\n  { id: "p1", name: "Notebook", price: 4.5 },\n  { id: "p2", name: "Pen", price: 1.25 },\n  { id: "p3", name: "Backpack", price: 32.99 },\n];\n\n/** The product with this id, or null. */\nexport function getProduct(id) {\n  return PRODUCTS.find((p) => p.id === id) ?? null;\n}\n`,
  "src/tax/tax.js": `import { roundCents } from "../pricing/money.js";\n\nexport const TAX_RATE = 0.19;\n\n/** Tax owed on an amount, rounded to cents. */\nexport function taxFor(amount) {\n  return roundCents(amount * TAX_RATE);\n}\n`,
  "src/orders/orders.js": `import { cartSubtotal } from "../cart/cart.js";\nimport { taxFor } from "../tax/tax.js";\nimport { roundCents } from "../pricing/money.js";\n\n/** Price a cart into an order. */\nexport function placeOrder(cart) {\n  const subtotal = cartSubtotal(cart);\n  const tax = taxFor(subtotal);\n  return { items: cart.items.map((i) => ({ ...i })), subtotal, tax, total: roundCents(subtotal + tax) };\n}\n`,
};

const cartSrc = (solved) =>
  `import { getProduct } from "../catalog/products.js";\nimport { roundCents } from "../pricing/money.js";\n${solved ? `import { validateCoupon } from "../coupons/coupons.js";\n` : ""}\nexport function createCart() {\n  return { items: [], coupon: null };\n}\n\n/** Add \`qty\` units of a product; unknown products throw. */\nexport function addItem(cart, productId, qty = 1) {\n  const product = getProduct(productId);\n  if (!product) throw new Error(\`unknown product: \${productId}\`);\n  const line = cart.items.find((i) => i.productId === productId);\n  if (line) line.qty += qty;\n  else cart.items.push({ productId, qty, price: product.price });\n  return cart;\n}\n\n/** Sum of the cart's lines, rounded to cents. */\nexport function cartSubtotal(cart) {\n  return roundCents(cart.items.reduce((s, i) => s + i.price * i.qty, 0));\n}\n` +
  (solved
    ? `\n/** Validate \`code\` against the cart's subtotal and remember it on the cart. */\nexport function applyCoupon(cart, code, now = new Date()) {\n  const { code: upper } = validateCoupon(code, cartSubtotal(cart), now);\n  cart.coupon = upper;\n  return cart;\n}\n`
    : "");

const fullIndex = (solved) =>
  `export { getProduct } from "./catalog/products.js";\nexport { createCart, addItem, cartSubtotal${solved ? ", applyCoupon" : ""} } from "./cart/cart.js";\nexport { placeOrder } from "./orders/orders.js";\nexport { TAX_RATE, taxFor } from "./tax/tax.js";\n${solved ? `export { validateCoupon, CouponError } from "./coupons/coupons.js";\n` : ""}`;

const fullTests = {
  "test/cart.test.js": `${testHead}import { createCart, addItem, cartSubtotal } from "../src/index.js";\ntest("subtotal sums lines", () => {\n  const c = addItem(addItem(createCart(), "p1", 2), "p2", 3);\n  assert.equal(cartSubtotal(c), 12.75);\n});\ntest("unknown product throws", () => assert.throws(() => addItem(createCart(), "nope")));\n`,
  "test/orders.test.js": `${testHead}import { createCart, addItem, placeOrder } from "../src/index.js";\ntest("order charges 19% tax", () => {\n  const o = placeOrder(addItem(createCart(), "p3", 1));\n  assert.deepEqual([o.subtotal, o.tax, o.total], [32.99, 6.27, 39.26]);\n});\n`,
};

/** The solved coupons module (reference solution). */
const couponsSrc = `import { roundCents } from "../pricing/money.js";\n\nexport class CouponError extends Error {\n  constructor(reason, message) {\n    super(message);\n    this.name = "CouponError";\n    this.reason = reason;\n  }\n}\n\nconst COUPONS = {\n  SAVE10: { pct: 10 },\n  FLAT5: { amount: 5, min: 20 },\n  SPRING: { pct: 15, expires: new Date("2020-06-01T00:00:00Z") },\n};\n\n/** Validate a coupon against a subtotal; returns the discount it grants. */\nexport function validateCoupon(code, subtotal, now = new Date()) {\n  const upper = String(code ?? "").toUpperCase();\n  const c = COUPONS[upper];\n  if (!c) throw new CouponError("unknown", \`unknown coupon: \${code}\`);\n  if (c.expires && now >= c.expires) throw new CouponError("expired", \`coupon expired: \${upper}\`);\n  if (c.min && subtotal < c.min) throw new CouponError("min-subtotal", \`\${upper} needs a subtotal of \${c.min}\`);\n  const raw = c.pct ? (subtotal * c.pct) / 100 : c.amount;\n  return { code: upper, discount: roundCents(Math.min(raw, subtotal)) };\n}\n`;

const ordersSolved = `import { cartSubtotal } from "../cart/cart.js";\nimport { validateCoupon } from "../coupons/coupons.js";\nimport { taxFor } from "../tax/tax.js";\nimport { roundCents } from "../pricing/money.js";\n\n/** Price a cart into an order: discount first, then tax on the rest. */\nexport function placeOrder(cart, now = new Date()) {\n  const subtotal = cartSubtotal(cart);\n  const discount = cart.coupon ? validateCoupon(cart.coupon, subtotal, now).discount : 0;\n  const taxable = roundCents(subtotal - discount);\n  const tax = taxFor(taxable);\n  return { items: cart.items.map((i) => ({ ...i })), subtotal, discount, tax, total: roundCents(taxable + tax) };\n}\n`;

/** Hidden acceptance tests for `full`: never shown to the agent. */
export const FULL_ACCEPTANCE = {
  "coupons.acceptance.test.js":
    `${testHead}import fs from "node:fs";\nimport * as shop from "../src/index.js";\nconst { createCart, addItem, applyCoupon, validateCoupon, CouponError, placeOrder } = shop;\nconst NOW = new Date("2026-01-01T00:00:00Z");\nconst reason = (fn) => { try { fn(); } catch (e) { assert.ok(e instanceof CouponError, "throws CouponError"); return e.reason; } assert.fail("did not throw"); };\n` +
    `test("SAVE10 is 10% off, case-insensitive", () => assert.deepEqual(validateCoupon("save10", 45.5, NOW), { code: "SAVE10", discount: 4.55 }));\n` +
    `test("FLAT5 needs a 20.00 subtotal", () => { assert.equal(reason(() => validateCoupon("FLAT5", 19.99, NOW)), "min-subtotal"); assert.equal(validateCoupon("FLAT5", 20, NOW).discount, 5); });\n` +
    `test("SPRING is expired", () => assert.equal(reason(() => validateCoupon("SPRING", 100, NOW)), "expired"));\n` +
    `test("unknown code", () => assert.equal(reason(() => validateCoupon("NOPE", 100, NOW)), "unknown"));\n` +
    `test("discount never exceeds the subtotal", () => assert.equal(validateCoupon("FLAT5", 20, NOW).discount <= 20, true));\n` +
    `test("invalid coupon leaves the cart unchanged", () => { const c = addItem(createCart(), "p1", 1); assert.throws(() => applyCoupon(c, "FLAT5", NOW)); assert.ok(!c.coupon); });\n` +
    `test("discount applies before 19% tax", () => { const c = applyCoupon(addItem(createCart(), "p3", 1), "save10", NOW); const o = placeOrder(c, NOW); assert.equal(c.coupon, "SAVE10"); assert.deepEqual([o.subtotal, o.discount, o.tax, o.total], [32.99, 3.3, 5.64, 35.33]); });\n` +
    `test("a coupon no longer valid at order time throws", () => { const c = applyCoupon(addItem(createCart(), "p3", 1), "SPRING", new Date("2020-01-01T00:00:00Z")); assert.throws(() => placeOrder(c, NOW)); });\n` +
    `test("package.json declares the public entry", () => assert.equal(JSON.parse(fs.readFileSync("package.json", "utf8")).exports?.["."], "./src/index.js"));\n`,
};

/** Write the `full` task repo into `dir`; `solve` applies the reference solution. */
export function writeFull(dir, { solve = false } = {}) {
  put(dir, "package.json", pkg(solve ? { exports: { ".": "./src/index.js" } } : {}));
  put(dir, "FEATURE.md", FULL_TASK);
  for (const [rel, body] of Object.entries(fullSrc)) put(dir, rel, body);
  for (const [rel, body] of Object.entries(fullTests)) put(dir, rel, body);
  put(dir, "src/cart/cart.js", cartSrc(solve));
  put(dir, "src/index.js", fullIndex(solve));
  if (solve) {
    put(dir, "src/coupons/coupons.js", couponsSrc);
    put(dir, "src/orders/orders.js", ordersSolved);
    put(
      dir,
      "test/coupons.test.js",
      `${testHead}import { validateCoupon } from "../src/index.js";\ntest("SAVE10", () => assert.equal(validateCoupon("SAVE10", 10).discount, 1));\n`,
    );
  }
}

// ---------------------------------------------------------------- fanout

const FANOUT_TASK = `# Feature: three utilities

Build three independent modules. They share nothing: no module imports
another. Add tests for each and keep \`npm test\` passing.

## Part 1 — \`src/csv/csv.js\`
- \`parseCsv(text, { delimiter = "," } = {})\` → array of rows (arrays of strings).
  RFC 4180 quoting: fields may be wrapped in double quotes; inside quotes a
  doubled quote (\`""\`) is a literal quote and delimiters/newlines are literal.
  Rows end with \`\\n\` or \`\\r\\n\`; a trailing newline adds no empty row; an empty
  input is \`[]\`. An unterminated quote throws an \`Error\`.
- \`stringifyCsv(rows, { delimiter = "," } = {})\` → text joined with \`\\n\`; a field
  is quoted only when it contains the delimiter, a quote, \`\\r\` or \`\\n\`.
  \`parseCsv(stringifyCsv(rows))\` round-trips.

## Part 2 — \`src/duration/duration.js\`
- \`parseDuration(text)\` → milliseconds. Units \`d\`, \`h\`, \`m\`, \`s\`, \`ms\` in any
  combination but each at most once and in descending order (e.g. \`"1h30m"\`,
  \`"2d4h"\`, \`"1.5s"\`, \`"250ms"\`). Decimals are allowed. Anything else
  (empty, unknown unit, repeated or out-of-order unit) throws a \`RangeError\`.
- \`formatDuration(ms)\` → the canonical text: largest units first, zero units
  omitted, \`"0ms"\` for zero (e.g. \`5400000\` → \`"1h30m"\`, \`1500\` → \`"1s500ms"\`).
  Negative input throws a \`RangeError\`.

## Part 3 — \`src/semver/semver.js\`
- \`parse(v)\` → \`{ major, minor, patch, prerelease }\` (\`prerelease\` an array of
  identifiers, \`[]\` when none; numeric identifiers as numbers). Invalid input
  throws a \`TypeError\`. A leading \`v\` is allowed.
- \`compare(a, b)\` → \`-1\`, \`0\` or \`1\` with SemVer 2.0 precedence (a prerelease
  sorts before its release; identifiers compare numerically when numeric,
  numeric < alphanumeric, a longer prerelease wins a tie).
- \`satisfies(v, range)\` for ranges made of space-separated comparators
  (\`>=1.2.0 <2.0.0\`, \`=1.0.0\`, \`>1\`) plus caret (\`^1.2.3\`, \`^0.2.3\`) and
  tilde (\`~1.2.3\`) shorthands. A prerelease version only satisfies a range
  whose comparator names the same \`major.minor.patch\` with a prerelease.
`;

const csvSolved = `/** Parse RFC 4180 CSV text into rows of strings. */\nexport function parseCsv(text, { delimiter = "," } = {}) {\n  const rows = [];\n  let row = [];\n  let field = "";\n  let quoted = false;\n  let i = 0;\n  if (text === "") return rows;\n  while (i < text.length) {\n    const ch = text[i];\n    if (quoted) {\n      if (ch === '"') {\n        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }\n        quoted = false; i++; continue;\n      }\n      field += ch; i++; continue;\n    }\n    if (ch === '"' && field === "") { quoted = true; i++; continue; }\n    if (ch === delimiter) { row.push(field); field = ""; i++; continue; }\n    if (ch === "\\r" && text[i + 1] === "\\n") i++;\n    if (ch === "\\n" || ch === "\\r") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }\n    field += ch; i++;\n  }\n  if (quoted) throw new Error("unterminated quote");\n  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }\n  return rows;\n}\n\n/** Serialize rows to CSV, quoting only fields that need it. */\nexport function stringifyCsv(rows, { delimiter = "," } = {}) {\n  const needs = (f) => f.includes(delimiter) || /["\\r\\n]/.test(f);\n  return rows\n    .map((r) => r.map((f) => (needs(String(f)) ? '"' + String(f).replace(/"/g, '""') + '"' : String(f))).join(delimiter))\n    .join("\\n");\n}\n`;

const durationSolved = `const UNITS = [\n  ["d", 86400000],\n  ["h", 3600000],\n  ["m", 60000],\n  ["s", 1000],\n  ["ms", 1],\n];\n\n/** Parse "1h30m"-style text into milliseconds. */\nexport function parseDuration(text) {\n  if (typeof text !== "string" || text === "") throw new RangeError("empty duration");\n  const re = /(\\d+(?:\\.\\d+)?)(ms|d|h|m|s)/y;\n  let total = 0;\n  let last = -1;\n  let pos = 0;\n  while (pos < text.length) {\n    re.lastIndex = pos;\n    const m = re.exec(text);\n    if (!m) throw new RangeError(\`bad duration: \${text}\`);\n    const idx = UNITS.findIndex(([u]) => u === m[2]);\n    if (idx <= last) throw new RangeError(\`unit out of order: \${text}\`);\n    last = idx;\n    total += Number(m[1]) * UNITS[idx][1];\n    pos = re.lastIndex;\n  }\n  return Math.round(total);\n}\n\n/** Format milliseconds as canonical duration text. */\nexport function formatDuration(ms) {\n  if (!(ms >= 0)) throw new RangeError("negative duration");\n  if (ms === 0) return "0ms";\n  let rest = Math.round(ms);\n  let out = "";\n  for (const [u, size] of UNITS) {\n    const n = Math.floor(rest / size);\n    if (n > 0) { out += n + u; rest -= n * size; }\n  }\n  return out;\n}\n`;

const semverSolved = `const RE = /^v?(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?(?:\\+[0-9A-Za-z.-]+)?$/;\n\n/** Parse a SemVer 2.0 version string. */\nexport function parse(v) {\n  const m = RE.exec(String(v).trim());\n  if (!m) throw new TypeError(\`invalid version: \${v}\`);\n  const prerelease = m[4] ? m[4].split(".").map((id) => (/^\\d+$/.test(id) ? Number(id) : id)) : [];\n  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), prerelease };\n}\n\nconst sign = (x) => (x < 0 ? -1 : x > 0 ? 1 : 0);\n\nfunction comparePre(a, b) {\n  if (!a.length && !b.length) return 0;\n  if (!a.length) return 1;\n  if (!b.length) return -1;\n  for (let i = 0; i < Math.max(a.length, b.length); i++) {\n    if (a[i] === undefined) return -1;\n    if (b[i] === undefined) return 1;\n    if (a[i] === b[i]) continue;\n    const an = typeof a[i] === "number";\n    const bn = typeof b[i] === "number";\n    if (an && bn) return sign(a[i] - b[i]);\n    if (an) return -1;\n    if (bn) return 1;\n    return a[i] < b[i] ? -1 : 1;\n  }\n  return 0;\n}\n\n/** SemVer precedence of a against b: -1, 0 or 1. */\nexport function compare(a, b) {\n  const x = typeof a === "string" ? parse(a) : a;\n  const y = typeof b === "string" ? parse(b) : b;\n  return sign(x.major - y.major) || sign(x.minor - y.minor) || sign(x.patch - y.patch) || comparePre(x.prerelease, y.prerelease);\n}\n\nfunction partial(s) {\n  const [maj, min, pat] = s.replace(/^v/, "").split("-")[0].split(".");\n  const pre = s.includes("-") ? s.slice(s.indexOf("-")) : "";\n  return { maj: Number(maj), min: min === undefined ? null : Number(min), pat: pat === undefined ? null : Number(pat), pre };\n}\n\nfunction expand(token) {\n  if (token.startsWith("^")) {\n    const { maj, min, pat, pre } = partial(token.slice(1));\n    const lo = \`>=\${maj}.\${min ?? 0}.\${pat ?? 0}\${pre}\`;\n    if (maj > 0 || min === null) return [lo, \`<\${maj + 1}.0.0-0\`];\n    if (min > 0 || pat === null) return [lo, \`<0.\${min + 1}.0-0\`];\n    return [lo, \`<0.0.\${pat + 1}-0\`];\n  }\n  if (token.startsWith("~")) {\n    const { maj, min, pat, pre } = partial(token.slice(1));\n    const lo = \`>=\${maj}.\${min ?? 0}.\${pat ?? 0}\${pre}\`;\n    return [lo, min === null ? \`<\${maj + 1}.0.0-0\` : \`<\${maj}.\${min + 1}.0-0\`];\n  }\n  const m = /^(>=|<=|>|<|=)?(.*)$/.exec(token);\n  const op = m[1] || "=";\n  const { maj, min, pat, pre } = partial(m[2]);\n  if (min !== null && pat !== null) return [\`\${op}\${maj}.\${min}.\${pat}\${pre}\`];\n  const lo = \`\${maj}.\${min ?? 0}.0\`;\n  const hi = min === null ? \`\${maj + 1}.0.0-0\` : \`\${maj}.\${min + 1}.0-0\`;\n  if (op === "=") return [\`>=\${lo}\`, \`<\${hi}\`];\n  if (op === ">") return [\`>=\${hi}\`];\n  if (op === ">=") return [\`>=\${lo}\`];\n  if (op === "<") return [\`<\${lo}-0\`];\n  return [\`<\${hi}\`];\n}\n\nfunction test(v, comp) {\n  const m = /^(>=|<=|>|<|=)(.*)$/.exec(comp);\n  const c = compare(v, parse(m[2]));\n  return { ">=": c >= 0, "<=": c <= 0, ">": c > 0, "<": c < 0, "=": c === 0 }[m[1]];\n}\n\n/** Whether version v satisfies a comparator/caret/tilde range. */\nexport function satisfies(v, range) {\n  const ver = parse(v);\n  const comps = range.trim().split(/\\s+/).flatMap(expand);\n  if (!comps.every((c) => test(ver, c))) return false;\n  if (!ver.prerelease.length) return true;\n  return comps.some((c) => {\n    const p = parse(c.replace(/^(>=|<=|>|<|=)/, ""));\n    return p.prerelease.length > 0 && p.prerelease[0] !== 0 && p.major === ver.major && p.minor === ver.minor && p.patch === ver.patch;\n  }) || range.trim().split(/\\s+/).some((t) => { const p = partial(t.replace(/^(\\^|~|>=|<=|>|<|=)/, "")); return p.pre !== "" && p.maj === ver.major && p.min === ver.minor && p.pat === ver.patch; });\n}\n`;

/** Hidden acceptance tests for `fanout`, one file per part. */
export const FANOUT_ACCEPTANCE = {
  "csv.acceptance.test.js":
    `${testHead}import { parseCsv, stringifyCsv } from "../src/csv/csv.js";\n` +
    `test("quoted fields, escaped quotes, embedded newline", () => assert.deepEqual(parseCsv('a,"b,c","say ""hi"""\\r\\n"x\\ny",2\\n'), [["a", "b,c", 'say "hi"'], ["x\\ny", "2"]]));\n` +
    `test("empty input and empty fields", () => { assert.deepEqual(parseCsv(""), []); assert.deepEqual(parseCsv(",\\n"), [["", ""]]); });\n` +
    `test("custom delimiter", () => assert.deepEqual(parseCsv("a;b\\n1;2", { delimiter: ";" }), [["a", "b"], ["1", "2"]]));\n` +
    `test("unterminated quote throws", () => assert.throws(() => parseCsv('a,"b')));\n` +
    `test("round trip quotes only when needed", () => { const rows = [["plain", "with,comma", 'q"uote', "multi\\nline"]]; const t = stringifyCsv(rows); assert.ok(t.startsWith("plain,")); assert.deepEqual(parseCsv(t), rows); });\n`,
  "duration.acceptance.test.js":
    `${testHead}import { parseDuration, formatDuration } from "../src/duration/duration.js";\n` +
    `test("parses combined units", () => { assert.equal(parseDuration("1h30m"), 5400000); assert.equal(parseDuration("2d4h"), 187200000); assert.equal(parseDuration("250ms"), 250); });\n` +
    `test("decimals", () => assert.equal(parseDuration("1.5s"), 1500));\n` +
    `test("rejects bad input", () => { for (const t of ["", "5x", "1m1h", "1s1s", "h"]) assert.throws(() => parseDuration(t), RangeError, t); });\n` +
    `test("formats canonically", () => { assert.equal(formatDuration(5400000), "1h30m"); assert.equal(formatDuration(1500), "1s500ms"); assert.equal(formatDuration(0), "0ms"); assert.equal(formatDuration(90061001), "1d1h1m1s1ms"); });\n` +
    `test("negative throws", () => assert.throws(() => formatDuration(-1), RangeError));\n`,
  "semver.acceptance.test.js":
    `${testHead}import { parse, compare, satisfies } from "../src/semver/semver.js";\n` +
    `test("parse", () => { assert.deepEqual(parse("v1.2.3-alpha.1"), { major: 1, minor: 2, patch: 3, prerelease: ["alpha", 1] }); assert.throws(() => parse("1.2"), TypeError); });\n` +
    `test("precedence", () => { const s = ["1.0.0", "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-beta", "1.0.0-alpha.beta", "1.0.0-rc.1", "1.0.0-beta.11", "1.0.0-beta.2"].sort(compare); assert.deepEqual(s, ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0"]); });\n` +
    `test("comparator ranges", () => { assert.equal(satisfies("1.5.0", ">=1.2.0 <2.0.0"), true); assert.equal(satisfies("2.0.0", ">=1.2.0 <2.0.0"), false); assert.equal(satisfies("1.0.0", "=1.0.0"), true); });\n` +
    `test("caret and tilde", () => { assert.equal(satisfies("1.9.9", "^1.2.3"), true); assert.equal(satisfies("2.0.0", "^1.2.3"), false); assert.equal(satisfies("0.2.9", "^0.2.3"), true); assert.equal(satisfies("0.3.0", "^0.2.3"), false); assert.equal(satisfies("1.2.9", "~1.2.3"), true); assert.equal(satisfies("1.3.0", "~1.2.3"), false); });\n` +
    `test("prereleases only match their own tuple", () => { assert.equal(satisfies("1.3.0-beta", "^1.2.3"), false); assert.equal(satisfies("1.2.3-beta.2", "^1.2.3-beta.1"), true); });\n`,
};

/** Write the `fanout` task repo into `dir`; `solve` applies the reference solution. */
export function writeFanout(dir, { solve = false } = {}) {
  put(dir, "package.json", pkg({ name: "utils" }));
  put(dir, "FEATURE.md", FANOUT_TASK);
  put(
    dir,
    "src/index.js",
    `// Each utility lives in its own module under src/; import them directly.\nexport const VERSION = "0.1.0";\n`,
  );
  put(
    dir,
    "test/index.test.js",
    `${testHead}import { VERSION } from "../src/index.js";\ntest("version", () => assert.equal(VERSION, "0.1.0"));\n`,
  );
  if (solve) {
    put(dir, "src/csv/csv.js", csvSolved);
    put(dir, "src/duration/duration.js", durationSolved);
    put(dir, "src/semver/semver.js", semverSolved);
  }
}

// ---------------------------------------------------------------- review

/** Process defects the review probe can plant (`--defects`). */
export const DEFECTS = {
  stub: "a stub artifact accepted as written (design.md is the scaffold placeholder)",
  "real-data": "the regression test writes the repo's real data file (data/ledger.json)",
  "missing-report": "no discipline report under reports/",
  "red-first": "no evidence the regression test failed before the fix",
};

export const REVIEW_CHANGE = "fix-ledger-rounding";

const ledgerData = JSON.stringify(
  [
    { id: "2026-001", memo: "opening balance", amount: 1250.4 },
    { id: "2026-002", memo: "supplier invoice", amount: -310.155 },
    { id: "2026-003", memo: "customer payment", amount: 89.995 },
  ],
  null,
  2,
);

/** The ledger repo before the bug fix (written on `main`). */
export function writeReviewBase(dir) {
  put(dir, "package.json", pkg({ name: "ledger" }));
  put(dir, "data/ledger.json", ledgerData + "\n");
  put(
    dir,
    "src/ledger/money.js",
    `/** Round to cents, half away from zero. */\nexport function roundCents(x) {\n  return Math.floor(x * 100) / 100;\n}\n`,
  );
  put(
    dir,
    "src/ledger/balance.js",
    `import { roundCents } from "./money.js";\n\n/** Running balance of ledger entries, rounded to cents per entry. */\nexport function balance(entries) {\n  return roundCents(entries.reduce((s, e) => s + roundCents(e.amount), 0));\n}\n`,
  );
  put(
    dir,
    "src/ledger/store.js",
    `import fs from "node:fs";\n\nexport function loadLedger(file) {\n  return JSON.parse(fs.readFileSync(file, "utf8"));\n}\n\nexport function saveLedger(file, entries) {\n  fs.writeFileSync(file, JSON.stringify(entries, null, 2) + "\\n");\n}\n`,
  );
  put(
    dir,
    "test/store.test.js",
    `${testHead}import fs from "node:fs";\nimport os from "node:os";\nimport path from "node:path";\nimport { loadLedger, saveLedger } from "../src/ledger/store.js";\ntest("save then load round-trips in a temp dir", () => {\n  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-"));\n  const file = path.join(dir, "l.json");\n  saveLedger(file, [{ id: "x", amount: 1 }]);\n  assert.deepEqual(loadLedger(file), [{ id: "x", amount: 1 }]);\n});\n`,
  );
}

/**
 * The fix and its change artifacts, written on the branch after
 * `lawbook draft --bug` scaffolded the change. `defects` picks the planted
 * process defects; an empty set is the clean control (the review should PASS).
 */
export function writeReviewChange(dir, defects) {
  const has = (d) => defects.includes(d);
  put(
    dir,
    "src/ledger/money.js",
    `/** Round to cents, half away from zero. */\nexport function roundCents(x) {\n  return (Math.sign(x) * Math.round(Number(Math.abs(x) + "e2"))) / 100;\n}\n`,
  );
  const regression = has("real-data")
    ? `${testHead}import path from "node:path";\nimport { balance } from "../src/ledger/balance.js";\nimport { loadLedger, saveLedger } from "../src/ledger/store.js";\n\nconst LEDGER = path.resolve("data/ledger.json");\n\ntest("balance rounds half-cent entries half up", () => {\n  const entries = loadLedger(LEDGER);\n  entries.push({ id: "test-rounding", memo: "half cent", amount: 0.005 });\n  saveLedger(LEDGER, entries);\n  assert.equal(balance(loadLedger(LEDGER)), 1030.25);\n});\n`
    : `${testHead}import { balance } from "../src/ledger/balance.js";\n\ntest("balance rounds half-cent entries half up", () => {\n  const entries = [\n    { amount: 1250.4 },\n    { amount: -310.155 },\n    { amount: 89.995 },\n    { amount: 0.005 },\n  ];\n  assert.equal(balance(entries), 1030.25);\n});\n`;
  put(dir, "test/balance.test.js", regression);

  const ch = `lawbook/changes/${REVIEW_CHANGE}`;
  put(
    dir,
    `${ch}/bugfix.md`,
    `# Bugfix: ${REVIEW_CHANGE}\n\n**Level:** 2 · **Type:** bug · **Severity:** normal\n\n## 1. Observed symptom\nThe ledger balance is one cent short whenever an entry ends in half a cent (e.g. 89.995 rounds to 89.99).\n\n## 2. Minimal reproduction\n\`balance([{ amount: 89.995 }])\` returns 89.99; expected 90.00.\n\n## 3. Root cause\n\`roundCents\` (src/ledger/money.js:3) truncates with \`Math.floor\` instead of rounding half away from zero; negative amounts round the wrong way too.\n\n## 4. Blast radius\n\`balance\` (src/ledger/balance.js) is the only caller; no other module rounds money.\n\n## 5. Proposed fix\nShift the absolute value two decimal places in its decimal string form (\`"89.995e2"\` is exactly 8999.5), round half up, restore the sign. Rejected: \`toFixed\`, which rounds binary fractions inconsistently.\n\n## 6. Regression test\ntest/balance.test.js::balance rounds half-cent entries half up\n\n## 7. Prevention\nnone: a single rounding helper already centralises money rounding; the regression test pins it.\n`,
  );
  put(
    dir,
    `${ch}/design.md`,
    has("stub")
      ? `# Design — ${REVIEW_CHANGE}\n\n## Approach\n\n(structural bugfix — document the fix architecture)\n`
      : `# Design — ${REVIEW_CHANGE}\n\n## Approach\n\nKeep one money-rounding helper (\`roundCents\`) and fix it in place: shift the\nabsolute value by two decimal places through its decimal string, round half\nup, then restore the sign, so credits and debits round symmetrically. \`balance\` keeps\nrounding per entry, which matches how the ledger is reconciled.\n`,
  );
  put(
    dir,
    `${ch}/tasks.md`,
    `- [x] Reproduce and confirm root cause\n- [x] Implement fix\n- [x] Add regression test (red before, green after)\n- [x] Complete prevention §7\n- [x] Write discipline report under reports/\n`,
  );
  if (!has("missing-report")) {
    const red = has("red-first")
      ? ""
      : `\n## Regression test failing before the fix\n\nRun on the parent commit (fix reverted), \`node --test test/balance.test.js\`:\n\n\`\`\`\nnot ok 1 - balance rounds half-cent entries half up\n  AssertionError: Expected values to be strictly equal:\n  1030.23 !== 1030.25\n# tests 1\n# pass 0\n# fail 1\n\`\`\`\n`;
    put(
      dir,
      `${ch}/reports/backend.md`,
      `# Backend report — ${REVIEW_CHANGE}\n\nDiscipline: backend · Change: ${REVIEW_CHANGE} · Branch: fix/ledger-rounding\n\n## Gates\n\n| Check | Command | Result |\n|---|---|---|\n| Tests | \`npm test\` | pass — 2 tests, 0 failures |\n\n## Tests added\n\n- test/balance.test.js — half-cent rounding.\n${red}\n## Pre-existing failures\n\nnone\n\n## Pending manual steps\n\nnone\n\n**Verdict:** PASS\n`,
    );
  }
}
