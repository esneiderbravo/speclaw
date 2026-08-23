import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { specInit } from "../../src/modules/lawbook/engine.js";
import { scaffoldBugfix } from "../../src/modules/lawbook/bugfix.js";
import { investigate } from "../../src/modules/lawbook/investigate.js";
import { tmpRepo } from "../helpers/env.js";

test("bug flow: investigate then draft --bug scaffold", async (t) => {
  const root = tmpRepo(t);
  specInit(root);
  const inv = await investigate({ projectPath: root, symptom: "test failure" });
  assert.ok(Array.isArray(inv.suspects));
  const r = scaffoldBugfix(root, "flow-bug", { level: 1, seed: inv });
  assert.ok(fs.existsSync(path.join(r.dir, "bugfix.md")));
  const text = fs.readFileSync(path.join(r.dir, "bugfix.md"), "utf8");
  assert.match(text, /Bugfix: flow-bug/);
  assert.match(text, /candidate — verify|Root cause/);
});
