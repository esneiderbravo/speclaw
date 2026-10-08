#!/usr/bin/env node
// Writes one benchmark fixture's sources into the current directory: a repo
// whose tests fail until its bugs are fixed, sized so ship measures a given
// ceremony level. `--solve` applies the reference fix instead (to check the
// level a fixture measures without running an agent).
//   one   — one-line bug in one file                          → level 0
//   multi — one bug across two modules                        → level 1
//   api   — bugs in five modules and the public entry         → level 2
//   wide  — bugs in sixteen modules, the public entry, and a
//           package.json field the tests require              → level 3
// Usage: node scripts/bench-fixture.mjs <scenario> [--solve]
import fs from "node:fs";
import path from "node:path";

const [scenario = "one", flag] = process.argv.slice(2);
const solve = flag === "--solve";

function write(rel, body) {
  fs.mkdirSync(path.dirname(rel), { recursive: true });
  fs.writeFileSync(rel, body);
}

const pkg = (extra = {}) =>
  JSON.stringify(
    { name: "demo", type: "module", scripts: { test: "node --test" }, ...extra },
    null,
    2,
  ) + "\n";

const discount = (fixed) =>
  `export function applyDiscount(price, pct) {\n  return ${fixed ? "price - (price * pct) / 100" : "price - price * pct"};\n}\n`;

/** `n` modules, each with a bug, a test, and an export through src/index.js. */
function modules(n, extraPkg) {
  write("package.json", pkg({ main: "src/index.js", ...(solve ? extraPkg : {}) }));
  const names = [];
  for (let i = 0; i < n; i++) {
    const name = `m${i}`;
    names.push(name);
    write(
      `src/${name}/scale.js`,
      `export function scale${i}(x) {\n  return x * ${i + 2}${solve ? "" : " + 1"};\n}\n`,
    );
    write(
      `test/${name}.test.js`,
      `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { scale${i} } from "../src/index.js";\ntest("scale${i}(10) is ${(i + 2) * 10}", () => assert.equal(scale${i}(10), ${(i + 2) * 10}));\n`,
    );
  }
  write(
    "src/index.js",
    names.map((m, i) => `export { scale${i} } from "./${m}/scale.js";\n`).join("") +
      `export function total(xs) {\n  return xs.reduce((s, x) => s + x, ${solve ? 0 : 1});\n}\n`,
  );
  write(
    "test/index.test.js",
    `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { total } from "../src/index.js";\ntest("total of 1+2 is 3", () => assert.equal(total([1, 2]), 3));\n`,
  );
}

/**
 * A repo of ~130 files where one rounding bug sits five calls below the
 * failing test, among dozens of look-alike helpers: the shape where a code
 * graph should beat reading files.
 */
function deep() {
  write("package.json", pkg());
  const domains = [
    "cart",
    "pricing",
    "promo",
    "tax",
    "money",
    "catalog",
    "user",
    "shipping",
    "inventory",
    "report",
    "audit",
    "locale",
  ];
  for (const d of domains) {
    for (let f = 0; f < 10; f++) {
      write(
        `src/${d}/${d}-${f}.js`,
        `// ${d} helpers, part ${f}.\n` +
          `export function ${d}Round${f}(x) {\n  return Math.round(x * 100) / 100;\n}\n` +
          `export function ${d}Scale${f}(x) {\n  return x * ${f + 1};\n}\n` +
          `export function ${d}Total${f}(xs) {\n  return xs.reduce((s, x) => s + ${d}Round${f}(x), 0);\n}\n`,
      );
    }
  }
  // The real path: checkout → subtotal → promo → tax → money.
  write(
    "src/money/round-cents.js",
    `/** Round a money amount to cents (half up). */\nexport function roundCents(x) {\n  return Math.${solve ? "round" : "floor"}(x * 100) / 100;\n}\n`,
  );
  write(
    "src/tax/compute.js",
    `import { roundCents } from "../money/round-cents.js";\nexport const TAX_RATE = 0.08;\nexport function withTax(amount) {\n  return roundCents(amount * (1 + TAX_RATE));\n}\n`,
  );
  write(
    "src/promo/apply.js",
    `import { withTax } from "../tax/compute.js";\nexport function applyPromo(amount, promo) {\n  return withTax(promo ? amount * (1 - promo.pct / 100) : amount);\n}\n`,
  );
  write(
    "src/pricing/subtotal.js",
    `import { applyPromo } from "../promo/apply.js";\nexport function subtotal(items, promo) {\n  return applyPromo(items.reduce((s, i) => s + i.price * i.qty, 0), promo);\n}\n`,
  );
  write(
    "src/cart/checkout.js",
    `import { subtotal } from "../pricing/subtotal.js";\nexport function checkout(cart) {\n  return { total: subtotal(cart.items, cart.promo), currency: cart.currency ?? "USD" };\n}\n`,
  );
  write(
    "test/checkout.test.js",
    `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { checkout } from "../src/cart/checkout.js";\n` +
      `test("checkout of 3 x 9.99 with tax is 32.37", () => assert.equal(checkout({ items: [{ price: 9.99, qty: 3 }] }).total, 32.37));\n` +
      `test("checkout of 2 x 10.05 at 10% off with tax is 19.54", () => assert.equal(checkout({ items: [{ price: 10.05, qty: 2 }], promo: { pct: 10 } }).total, 19.54));\n`,
  );
  for (const d of domains.slice(0, 6)) {
    write(
      `test/${d}.test.js`,
      `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { ${d}Total3 } from "../src/${d}/${d}-3.js";\ntest("${d} total", () => assert.equal(${d}Total3([1.005, 2]), 3));\n`,
    );
  }
}

switch (scenario) {
  case "one":
    write("package.json", pkg());
    write("price.js", discount(solve));
    write(
      "price.test.js",
      `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { applyDiscount } from "./price.js";\ntest("10% off 200 is 180", () => assert.equal(applyDiscount(200, 10), 180));\n`,
    );
    break;
  case "multi":
    write("package.json", pkg());
    write("src/pricing/price.js", discount(solve));
    write(
      "src/cart/total.js",
      `import { applyDiscount } from "../pricing/price.js";\nexport function cartTotal(items, pct) {\n  return ${solve ? "applyDiscount(items.reduce((s, i) => s + i.price, 0), pct)" : "items.reduce((s, i) => s + i.price, 0) + applyDiscount(0, pct)"};\n}\n`,
    );
    write(
      "test/price.test.js",
      `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { applyDiscount } from "../src/pricing/price.js";\nimport { cartTotal } from "../src/cart/total.js";\ntest("10% off 200 is 180", () => assert.equal(applyDiscount(200, 10), 180));\ntest("cart of 100+100 at 10% off is 180", () => assert.equal(cartTotal([{ price: 100 }, { price: 100 }], 10), 180));\n`,
    );
    break;
  case "api":
    modules(5);
    break;
  case "wide":
    modules(16, { sideEffects: false });
    write(
      "test/package.test.js",
      `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport fs from "node:fs";\ntest("the package declares sideEffects: false", () => assert.equal(JSON.parse(fs.readFileSync("package.json", "utf8")).sideEffects, false));\n`,
    );
    break;
  case "deep":
    deep();
    break;
  default:
    console.error(`unknown scenario: ${scenario}`);
    process.exit(1);
}
