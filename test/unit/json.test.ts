import { test } from "node:test";
import assert from "node:assert/strict";
import { formatJson } from "../../src/shared/json.js";

test("formatJson keeps objects expanded and puts short arrays on one line", () => {
  assert.equal(
    formatJson({ degraded: ["no-targets"], level: null, nested: { empty: {}, none: [] } }),
    `{
  "degraded": ["no-targets"],
  "level": null,
  "nested": {
    "empty": {},
    "none": []
  }
}
`,
  );
});

test("formatJson breaks an array that overflows 100 columns or holds an object", () => {
  const long = ["a".repeat(50), "b".repeat(50)];
  assert.equal(
    formatJson({ long }),
    `{\n  "long": [\n    "${long[0]}",\n    "${long[1]}"\n  ]\n}\n`,
  );
  assert.equal(formatJson([{ a: 1 }]), `[\n  {\n    "a": 1\n  }\n]\n`);
});

test("formatJson breaks an array of multi-element arrays and fills long number arrays", () => {
  assert.equal(
    formatJson([
      [1, 2],
      [3, 4],
    ]),
    `[\n  [1, 2],\n  [3, 4]\n]\n`,
  );
  assert.equal(formatJson([[1], [2]]), `[[1], [2]]\n`);
  const nums = Array.from({ length: 30 }, (_, i) => i * 1000);
  const lines = formatJson(nums).split("\n");
  assert.ok(lines.length > 3 && lines.length < 30, "several numbers per line");
  assert.ok(lines.every((l) => l.length <= 100));
});

test("formatJson normalizes like JSON.stringify (undefined drops, toJSON applies)", () => {
  const at = new Date("2026-10-07T00:00:00.000Z");
  assert.equal(formatJson({ a: undefined, at }), `{\n  "at": "2026-10-07T00:00:00.000Z"\n}\n`);
  assert.equal(formatJson("s"), `"s"\n`);
});
