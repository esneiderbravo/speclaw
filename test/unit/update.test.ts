import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { binaryUpgradeHint, runUpdate } from "../../src/cli/commands/update.js";
import { upgradeNotice } from "../../src/cli/lib/update-check.js";
import type { Flags } from "../../src/cli/lib/args.js";

const updateSrc = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "src",
  "cli",
  "commands",
  "update.ts",
);

function flags(extra: Record<string, string | boolean> = {}): Flags {
  return { _: [], ...extra };
}

test("update.ts never spawns npm install -g", () => {
  const src = fs.readFileSync(updateSrc, "utf8");
  assert.doesNotMatch(src, /spawnSync/);
  assert.doesNotMatch(src, /\[["']install["']\s*,\s*["']-g["']/);
  assert.doesNotMatch(src, /child_process/);
});

test("binaryUpgradeHint documents separate binary upgrade paths", () => {
  const hint = binaryUpgradeHint("@esneiderbravo/speclaw");
  assert.match(hint, /npm i -g @esneiderbravo\/speclaw@latest/);
  assert.match(hint, /npx @esneiderbravo\/speclaw@latest update/);
  assert.match(hint, /only migrates the project/i);
});

test("upgradeNotice no longer claims speclaw update upgrades the package", () => {
  const notice = upgradeNotice("2.0.0", "2.0.1");
  assert.doesNotMatch(notice, /upgrades and applies/);
  assert.match(notice, /npx @esneiderbravo\/speclaw@latest update/);
  assert.match(notice, /migrate this project/);
});

test("runUpdate does not call spawnSync with npm install -g when an update is available", async () => {
  const migrateCalls: Array<{ cwd: string; backup: boolean; minimal?: boolean }> = [];
  let checkCalls = 0;

  await runUpdate(flags(), {
    checkForUpdates: async () => {
      checkCalls += 1;
      return { current: "2.0.0", latest: "2.0.1", updateAvailable: true };
    },
    applyProjectMigrations: (cwd, backup, minimal) => {
      migrateCalls.push({ cwd, backup, minimal });
    },
  });

  assert.equal(checkCalls, 1);
  assert.equal(migrateCalls.length, 1);
  assert.equal(migrateCalls[0]?.backup, false);
});

test("runUpdate --check reports only and skips migrate", async () => {
  let migrated = false;
  await runUpdate(flags({ check: true }), {
    checkForUpdates: async () => ({
      current: "2.0.0",
      latest: "2.0.1",
      updateAvailable: true,
    }),
    applyProjectMigrations: () => {
      migrated = true;
    },
  });
  assert.equal(migrated, false);
});

test("runUpdate --migrate-only is an alias of default (still migrates)", async () => {
  let migrated = false;
  await runUpdate(flags({ "migrate-only": true }), {
    checkForUpdates: async () => ({
      current: "2.0.0",
      latest: "2.0.0",
      updateAvailable: false,
    }),
    applyProjectMigrations: () => {
      migrated = true;
    },
  });
  assert.equal(migrated, true);
});

test("runUpdate --check when already latest does not migrate", async () => {
  let migrated = false;
  await runUpdate(flags({ check: true }), {
    checkForUpdates: async () => ({
      current: "2.0.0",
      latest: "2.0.0",
      updateAvailable: false,
    }),
    applyProjectMigrations: () => {
      migrated = true;
    },
  });
  assert.equal(migrated, false);
});
