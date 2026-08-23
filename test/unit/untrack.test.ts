import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo, write } from "../helpers/env.js";
import { reportTrackedLocalContent } from "../../src/cli/lib/untrack.js";

// Covers: req~ai-specs-untrack-hint~1
test("reportTrackedLocalContent is silent when ai-specs is not tracked", (t) => {
  const root = tmpRepo(t);
  write(root, "README.md", "x");
  // tmpRepo is a git repo but ai-specs is absent / untracked — should no-op.
  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    reportTrackedLocalContent(root);
  } finally {
    console.log = original;
  }
  assert.equal(logs.length, 0);
});
