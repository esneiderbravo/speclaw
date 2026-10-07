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

test("binaryUpgradeHint documents the in-process fallback and manual upgrade paths", () => {
  const hint = binaryUpgradeHint("@esneiderbravo/speclaw");
  assert.match(hint, /npm i -g @esneiderbravo\/speclaw@latest/);
  assert.match(hint, /npx @esneiderbravo\/speclaw@latest update/);
  assert.match(hint, /upgrades itself/);
  assert.match(hint, /migrates with the installed binary/);
});

test("upgradeNotice says speclaw update upgrades itself through npx", () => {
  const notice = upgradeNotice("2.0.0", "2.0.1");
  assert.match(notice, /npx @esneiderbravo\/speclaw@latest update/);
  assert.match(notice, /upgrades itself through npx/);
  assert.match(notice, /migrates this project/);
});

test("runUpdate does not call spawnSync with npm install -g when an update is available", async () => {
  const migrateCalls: Array<{ cwd: string; backup: boolean; minimal?: boolean }> = [];
  let checkCalls = 0;

  await runUpdate(flags(), {
    // A cached (not fresh) latest never re-executes; nothing is spawned.
    checkForUpdates: async () => {
      checkCalls += 1;
      return { current: "2.0.0", latest: "2.0.1", updateAvailable: true, fresh: false };
    },
    selfUpdate: async () => assert.fail("must not spawn"),
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
      fresh: true,
    }),
    selfUpdate: async () => assert.fail("--check must not spawn"),
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
      fresh: true,
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
      fresh: true,
    }),
    applyProjectMigrations: () => {
      migrated = true;
    },
  });
  assert.equal(migrated, false);
});

type SelfUpdateCall = { pkg: string; version: string; args: string[]; env?: NodeJS.ProcessEnv };

/** Drive runUpdate with a fresh newer registry version and recording stubs. */
async function runWithNewer(
  opts: {
    flags?: Flags;
    env?: NodeJS.ProcessEnv;
    argv?: string[];
    fresh?: boolean;
    latest?: string;
    outcome?: { kind: "ran"; code: number } | { kind: "unavailable"; reason: string };
  } = {},
): Promise<{ spawned: SelfUpdateCall[]; migrated: number; exitCode: typeof process.exitCode }> {
  const spawned: SelfUpdateCall[] = [];
  let migrated = 0;
  const prevExit = process.exitCode;
  process.exitCode = undefined;
  try {
    await runUpdate(opts.flags ?? flags(), {
      checkForUpdates: async () => ({
        current: "2.0.7",
        latest: opts.latest ?? "2.0.8",
        updateAvailable: true,
        fresh: opts.fresh ?? true,
      }),
      selfUpdate: async (call) => {
        spawned.push(call);
        return opts.outcome ?? { kind: "ran", code: 0 };
      },
      applyProjectMigrations: () => {
        migrated += 1;
      },
      env: opts.env ?? {},
      argv: opts.argv ?? [],
    });
    return { spawned, migrated, exitCode: process.exitCode };
  } finally {
    process.exitCode = prevExit;
  }
}

// Covers: req~update-self-update~1
test("a fresh newer version re-executes update with forwarded flags and skips migration", async () => {
  const r = await runWithNewer({ flags: flags({ backup: true }), argv: ["--backup"] });
  assert.equal(r.spawned.length, 1);
  assert.equal(r.spawned[0]!.pkg, "@esneiderbravo/speclaw");
  assert.equal(r.spawned[0]!.version, "2.0.8");
  assert.deepEqual(r.spawned[0]!.args, ["--backup"]);
  assert.equal(r.migrated, 0);
  assert.equal(r.exitCode, 0);
});

// Covers: req~update-self-update~1
test("a failing child propagates its exit code and the parent does not migrate", async () => {
  const r = await runWithNewer({ outcome: { kind: "ran", code: 3 } });
  assert.equal(r.exitCode, 3);
  assert.equal(r.migrated, 0);
});

// Covers: req~update-self-update~1
test("opt-outs and the loop guard migrate in process without spawning", async () => {
  for (const o of [
    { flags: flags({ "no-self-update": true }) },
    { flags: flags({ "self-update": false }) },
    { env: { SPECLAW_NO_SELF_UPDATE: "1" } },
    { env: { SPECLAW_SELF_UPDATED: "2.0.8" } },
    { fresh: false },
  ]) {
    const r = await runWithNewer(o);
    assert.equal(r.spawned.length, 0, JSON.stringify(o));
    assert.equal(r.migrated, 1, JSON.stringify(o));
  }
});

// Covers: req~update-self-update~1
test("an unavailable npx falls back to in-process migration", async () => {
  const r = await runWithNewer({ outcome: { kind: "unavailable", reason: "spawn npx ENOENT" } });
  assert.equal(r.spawned.length, 1);
  assert.equal(r.migrated, 1);
});

// Covers: req~update-self-update~1
test("a registry version that is not strict semver never reaches the spawn", async () => {
  for (const latest of ["9.9.9 & calc", "9.9.9;id", "latest", "9.9"]) {
    const r = await runWithNewer({ latest });
    assert.equal(r.spawned.length, 0, latest);
    assert.equal(r.migrated, 1, latest);
  }
});

// Covers: req~update-self-update~1
test("unsafe argument tokens are dropped before forwarding", async () => {
  const r = await runWithNewer({ argv: ["--backup", "x;rm -rf ~"] });
  assert.deepEqual(r.spawned[0]!.args, ["--backup"]);
});

// Covers: req~update-self-update~1
test("no latest version migrates without spawning", async () => {
  let migrated = 0;
  await runUpdate(flags(), {
    checkForUpdates: async () => ({
      current: "2.0.7",
      latest: null,
      updateAvailable: false,
      fresh: false,
    }),
    selfUpdate: async () => assert.fail("must not spawn"),
    applyProjectMigrations: () => {
      migrated += 1;
    },
  });
  assert.equal(migrated, 1);
});

// Covers: req~update-self-update~1
test("the 2.0.9 migration note mentions self-update; the 2.0.1 entry is unchanged", () => {
  const src = fs.readFileSync(updateSrc, "utf8");
  const entry = src.slice(src.indexOf('version: "2.0.9"'));
  assert.match(entry, /--no-self-update/);
  assert.match(entry, /re-executes/);
  // The shipped 2.0.1 entry text stays as released (entries are cumulative).
  assert.ok(src.includes('describe: "speclaw update no longer upgrades the global npm package"'));
  assert.ok(src.includes("installed binary is stale so migrations match the latest package."));
});
