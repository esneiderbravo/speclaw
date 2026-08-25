import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyEars,
  diagnoseEars,
  detectPropertyRunnerInWindow,
  suggestEars,
  DEFAULT_EARS_CONFIG,
  DEFAULT_PROPERTY_RUNNERS,
} from "../../src/modules/lawbook/ears.js";

// Covers: req~ears-validate~1
test("classifyEars: ubiquitous", () => {
  const c = classifyEars("The system SHALL emit a coverage report.");
  assert.equal(c.pattern, "ubiquitous");
  assert.equal(c.modal, "SHALL");
});

test("classifyEars: event", () => {
  const c = classifyEars(
    "WHEN an authenticated user requests the index, the system SHALL return active listings.",
  );
  assert.equal(c.pattern, "event");
  assert.ok(c.parts.trigger?.includes("authenticated"));
});

test("classifyEars: state", () => {
  const c = classifyEars("WHILE the index is warm, the system SHALL answer within 250 ms.");
  assert.equal(c.pattern, "state");
});

test("classifyEars: unwanted", () => {
  const c = classifyEars(
    "IF the requirement has no modal, THEN the system SHALL report ears/no-modal.",
  );
  assert.equal(c.pattern, "unwanted");
});

test("classifyEars: optional", () => {
  const c = classifyEars(
    "WHERE the property feature is included, the system SHALL require a ptest link.",
  );
  assert.equal(c.pattern, "optional");
});

test("classifyEars: complex beats event", () => {
  const c = classifyEars(
    "WHILE authenticated, WHEN the user opens a listing, the system SHALL show it.",
  );
  assert.equal(c.pattern, "complex");
});

test("diagnoseEars: unstructured is error under strict", () => {
  const c = classifyEars("WHEN stuff happens somehow.");
  const diags = diagnoseEars(c, {
    hasScenarios: true,
    config: { ...DEFAULT_EARS_CONFIG, severity: "strict" },
  });
  assert.ok(diags.some((d) => d.code === "ears/no-modal" || d.code === "ears/unstructured"));
});

test("diagnoseEars: vague words warn", () => {
  const c = classifyEars("The system SHALL handle errors appropriately.");
  const diags = diagnoseEars(c, { hasScenarios: true });
  assert.ok(diags.some((d) => d.code === "ears/vague-response"));
});

test("suggestEars inserts WHEN for a precondition", () => {
  const s = suggestEars("a user logs in the system SHALL greet them");
  assert.match(s, /^WHEN /);
  assert.match(s, /SHALL/);
});

test("detectPropertyRunnerInWindow finds fc.assert", () => {
  const src = `// Covers: req~x~1\nimport fc from "fast-check";\nfc.assert(fc.property(fc.boolean(), (b) => b || !b));\n`;
  const hit = detectPropertyRunnerInWindow(src, 1, DEFAULT_PROPERTY_RUNNERS, 6);
  assert.equal(hit?.runnerId, "fast-check");
});

test("detectPropertyRunnerInWindow ignores commented runners", () => {
  const src = `// Covers: req~x~1\n// fc.assert(fc.property(fc.boolean(), (b) => b));\nconst x = 1;\n`;
  const hit = detectPropertyRunnerInWindow(src, 1, DEFAULT_PROPERTY_RUNNERS, 6);
  assert.equal(hit, null);
});
