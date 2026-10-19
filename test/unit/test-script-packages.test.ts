import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo } from "../helpers/env.js";
import { testScriptPackages } from "../../src/modules/compass/affected.js";

function monorepo(t: Parameters<typeof tmpRepo>[0], testScript: string): string {
  const root = tmpRepo(t);
  const write = (rel: string, body: unknown) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), JSON.stringify(body));
  };
  write("package.json", { workspaces: ["apps/*"], scripts: { test: testScript } });
  write("apps/backend/package.json", { name: "shop-api" });
  write("apps/web/package.json", { name: "shop-web" });
  write("apps/e2e/package.json", { name: "shop-e2e" });
  return root;
}

// Covers: req~test-gate-stays-in-test-script~1
test("testScriptPackages reads the workspaces the root test script runs", (t) => {
  const root = monorepo(t, "npm run test --workspace shop-api && npm run test:run -w=shop-web");
  assert.deepEqual(testScriptPackages(root), ["apps/backend", "apps/web"]);
});

test("testScriptPackages reads --prefix and cd into a directory", (t) => {
  assert.deepEqual(testScriptPackages(monorepo(t, "npm --prefix apps/web test")), ["apps/web"]);
  assert.deepEqual(testScriptPackages(monorepo(t, "cd apps/backend && jest")), ["apps/backend"]);
});

test("testScriptPackages does not restrict what it cannot place", (t) => {
  assert.equal(testScriptPackages(monorepo(t, "vitest run")), null, "no package named");
  assert.equal(testScriptPackages(monorepo(t, "npm test --workspaces")), null, "every workspace");
  assert.equal(testScriptPackages(monorepo(t, "npm test -w ghost")), null, "unknown workspace");
  const bare = tmpRepo(t);
  assert.equal(testScriptPackages(bare), null, "no package.json");
});
