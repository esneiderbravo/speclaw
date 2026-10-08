import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo } from "../helpers/env.js";
import { packageEntries } from "../../src/shared/package-entries.js";

test("entries come from package.json main and bin, mapped back to their source", (t) => {
  const root = tmpRepo(t);
  fs.mkdirSync(path.join(root, "src", "cli"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "server.ts"), "");
  fs.writeFileSync(path.join(root, "src", "cli", "index.ts"), "");
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ main: "dist/server.js", bin: { tool: "dist/cli/index.js" } }),
  );
  assert.deepEqual(packageEntries(root), [
    { file: "src/server.ts", kind: "main" },
    { file: "src/cli/index.ts", kind: "bin" },
  ]);
});

test("a workspace root or an app declares no entry", (t) => {
  const root = tmpRepo(t);
  assert.deepEqual(packageEntries(root), [], "no package.json");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ workspaces: ["apps/*"] }));
  assert.deepEqual(packageEntries(root), []);
});
