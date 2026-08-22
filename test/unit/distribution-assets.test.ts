import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ONE_LINER = "npx @esneiderbravo/speclaw@latest init";

test("README and CONTRIBUTING share the frozen install one-liner", () => {
  const readme = fs.readFileSync(path.join(process.cwd(), "README.md"), "utf8");
  const contributing = fs.readFileSync(path.join(process.cwd(), "CONTRIBUTING.md"), "utf8");
  assert.match(readme, new RegExp(ONE_LINER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(contributing, new RegExp(ONE_LINER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  // First copy-pasteable install fence in README must be the one-liner.
  const fence = /```bash\n([\s\S]*?)```/.exec(readme);
  assert.ok(fence);
  const firstCmd = fence![1]!
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("#"));
  assert.equal(firstCmd, ONE_LINER);
});

test("bug report template requires doctor JSON", () => {
  const yml = fs.readFileSync(
    path.join(process.cwd(), ".github/ISSUE_TEMPLATE/bug_report.yml"),
    "utf8",
  );
  assert.match(yml, /speclaw doctor --json/);
  assert.match(yml, /id: doctor/);
  assert.match(yml, /required:\s*true/);
});
