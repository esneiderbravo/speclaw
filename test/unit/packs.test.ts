import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo, has } from "../helpers/env.js";
import { loadPacks, installPack } from "../../src/modules/tools/packs.js";
import { emptyReport } from "../../src/shared/install.js";

test("loadPacks reads the bundled manifest into pack definitions", () => {
  const packs = loadPacks();
  assert.ok(Object.keys(packs).length > 0);
  for (const def of Object.values(packs)) {
    assert.equal(typeof def.description, "string");
    assert.equal(typeof def.path, "string");
  }
});

test("installPack copies a known pack's assets into ai-specs/", (t) => {
  const root = tmpRepo(t);
  const packs = loadPacks();
  const [name] = Object.keys(packs);
  const report = emptyReport();
  installPack(root, name!, { organization: "Acme" }, report);
  assert.ok(has(root, "ai-specs"));
  assert.ok(report.written.length > 0);
});

test("installPack throws with the available list on an unknown pack", (t) => {
  const root = tmpRepo(t);
  assert.throws(() => installPack(root, "no-such-pack", {}, emptyReport()), /Unknown pack/);
});
