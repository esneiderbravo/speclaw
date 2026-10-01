import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo } from "../helpers/env.js";
import { loadPacks, installPack } from "../../src/modules/tools/packs.js";
import { emptyReport } from "../../src/shared/install.js";

// Covers: req~remove-agents-pack~1
test("loadPacks returns an empty catalog when no packs ship", () => {
  const packs = loadPacks();
  assert.deepEqual(Object.keys(packs), []);
});

test("installPack throws with the available list on an unknown pack", (t) => {
  const root = tmpRepo(t);
  assert.throws(() => installPack(root, "no-such-pack", {}, emptyReport()), /Unknown pack/);
});
