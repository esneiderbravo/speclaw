import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo } from "../helpers/env.js";
import { specInit } from "../../src/modules/lawbook/engine.js";
import { scaffoldQuick } from "../../src/modules/lawbook/quick.js";
import { confirmedLevel } from "../../src/modules/lawbook/levels.js";

test("scaffoldQuick creates level-0 artifacts", (t) => {
  const root = tmpRepo(t);
  specInit(root);
  const r = scaffoldQuick(root, "fix-typo");
  assert.equal(r.change, "fix-typo");
  assert.equal(confirmedLevel(root, "fix-typo"), 0);
  assert.ok(fs.existsSync(path.join(r.dir, "record.md")));
  assert.ok(fs.existsSync(path.join(r.dir, "change.json")));
  assert.ok(fs.existsSync(path.join(r.dir, "reports", "README.md")));
  assert.ok(!fs.existsSync(path.join(r.dir, "proposal.md")));
  assert.throws(() => scaffoldQuick(root, "fix-typo"));
});
