import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { classifyEars } from "../../src/modules/lawbook/ears.js";

test("property: ubiquitous templates always classify as ubiquitous", () => {
  const subject = fc.constantFrom(
    "the system",
    "speclaw",
    "the CLI",
    "the archive step",
    "the coverage reporter",
  );
  const verb = fc.constantFrom(
    "emit a report",
    "refuse the archive",
    "classify the requirement",
    "return exit code 0",
    "preserve embedding cache",
  );
  // Covers: req~ears-validate~1, req~ptest-need~1
  fc.assert(
    fc.property(subject, verb, (s, v) => {
      const text = `${s} SHALL ${v}.`;
      const c = classifyEars(text);
      return c.pattern === "ubiquitous" && c.modal === "SHALL";
    }),
    { numRuns: 100 },
  );
});

test("property: event templates always classify as event", () => {
  const trigger = fc.constantFrom(
    "the user runs validate",
    "coverage finds a defect",
    "an identified requirement declares ptest",
  );
  const response = fc.constantFrom(
    "the system SHALL report the diagnostic",
    "speclaw SHALL block the archive",
    "the CLI SHALL print the uncovered type",
  );
  // Covers: req~ears-validate~1, req~ptest-need~1
  fc.assert(
    fc.property(trigger, response, (t, r) => {
      const text = `WHEN ${t}, ${r}.`;
      const c = classifyEars(text);
      assert.equal(c.pattern, "event");
      return true;
    }),
    { numRuns: 100 },
  );
});
