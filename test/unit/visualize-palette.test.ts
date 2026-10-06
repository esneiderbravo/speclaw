// Covers: req~brand-viewer-palette~1
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHtml } from "../../src/modules/compass/visualize.js";
import { retiredHexesIn } from "../helpers/brand.js";

const html = renderHtml({
  nodes: [{ id: 1, name: "alpha", kind: "function", file: "src/a.ts", line: 1, deg: 1 }],
  links: [],
  total: 1,
  focus: null,
});

test("viewer HTML draws on the ink tokens", () => {
  assert.match(html, /--bg:#131313/);
  assert.match(html, /--cy:#00e3fd/);
  assert.match(html, /--cr:#f4f4f3/);
  assert.match(html, /--mu:#999ea3/);
  assert.match(html, /--sh:#1f2022/);
  assert.match(html, /--ru:#303236/);
  assert.match(html, /rgba\(0,227,253,\.7\)/, "active edges in signal");
});

test("viewer HTML carries no retired color", () => {
  assert.deepEqual(retiredHexesIn(html), []);
  assert.doesNotMatch(html, /rgba\(12,17,19|rgba\(23,193,193|rgba\(110,123,128/);
  assert.doesNotMatch(html, /SF Mono|JetBrains Mono/);
});
