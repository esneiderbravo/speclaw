import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo } from "../helpers/env.js";
import {
  isSafeVersion,
  onPath,
  safeForwardArgs,
  selfUpdate,
} from "../../src/cli/lib/self-update.js";

// The spawn is exercised against a fake `npx` on a temp PATH — never the real
// npm. POSIX only: the Windows `npx.cmd` + shell branch is not run here.
const posix = process.platform === "win32" ? "POSIX-only fake npx" : false;

/** Write a fake `npx` that records its argv and env, then exits with `code`. */
function fakeNpx(dir: string, code: number): string {
  const log = path.join(dir, "npx.log");
  const script = path.join(dir, "npx");
  fs.writeFileSync(
    script,
    `#!/bin/sh\nprintf '%s\\n' "$@" > "${log}"\necho "SELF=$SPECLAW_SELF_UPDATED" >> "${log}"\nexit ${code}\n`,
  );
  fs.chmodSync(script, 0o755);
  return log;
}

// Covers: req~update-self-update~1
test("safeForwardArgs keeps safe flags and drops everything else", () => {
  assert.deepEqual(safeForwardArgs(["--backup", "x;rm -rf ~", "-y", "--minimal=true", "$(id)"]), {
    forward: ["--backup", "-y", "--minimal=true"],
    dropped: ["x;rm -rf ~", "$(id)"],
  });
  assert.deepEqual(safeForwardArgs(["--a=b c", "--ok=@scope/x:1.2"]).forward, [
    "--ok=@scope/x:1.2",
  ]);
});

// Covers: req~update-self-update~1
test(
  "selfUpdate spawns npx -y <pkg>@<latest> update with the loop guard",
  { skip: posix },
  async (t) => {
    const bin = tmpRepo(t, "speclaw-fake-npx-");
    const log = fakeNpx(bin, 0);
    const outcome = await selfUpdate({
      pkg: "@esneiderbravo/speclaw",
      version: "9.9.9",
      args: ["--backup"],
      env: { PATH: `${bin}:/usr/bin:/bin` },
    });
    assert.deepEqual(outcome, { kind: "ran", code: 0 });
    assert.equal(
      fs.readFileSync(log, "utf8"),
      "-y\n@esneiderbravo/speclaw@9.9.9\nupdate\n--backup\nSELF=9.9.9\n",
    );
  },
);

// Covers: req~update-self-update~1
test("selfUpdate returns the child's non-zero exit code", { skip: posix }, async (t) => {
  const bin = tmpRepo(t, "speclaw-fake-npx-");
  fakeNpx(bin, 3);
  const outcome = await selfUpdate({
    pkg: "@esneiderbravo/speclaw",
    version: "9.9.9",
    args: [],
    env: { PATH: `${bin}:/usr/bin:/bin` },
  });
  assert.deepEqual(outcome, { kind: "ran", code: 3 });
});

// Covers: req~update-self-update~1
test("selfUpdate reports unavailable when npx cannot be spawned", { skip: posix }, async (t) => {
  const empty = tmpRepo(t, "speclaw-no-npx-");
  const outcome = await selfUpdate({
    pkg: "@esneiderbravo/speclaw",
    version: "9.9.9",
    args: [],
    env: { PATH: empty },
  });
  assert.equal(outcome.kind, "unavailable");
});

// Covers: req~update-self-update~1
test("isSafeVersion accepts strict semver only", () => {
  for (const v of ["2.0.8", "10.0.0-beta.1", "1.2.3-rc-2"]) assert.equal(isSafeVersion(v), true, v);
  for (const v of ["9.9.9 & calc", "9.9.9;id", "$(id)", "v2.0.8", "2.0", "2.0.8+meta", ""])
    assert.equal(isSafeVersion(v), false, v);
});

// Covers: req~update-self-update~1
test("selfUpdate refuses an unsafe version without spawning", async () => {
  const outcome = await selfUpdate({
    pkg: "@esneiderbravo/speclaw",
    version: "9.9.9 & calc",
    args: [],
    env: { PATH: "" },
  });
  assert.equal(outcome.kind, "unavailable");
  assert.match((outcome as { reason: string }).reason, /invalid version/);
});

// Covers: req~update-self-update~1
test("on Windows a missing npx.cmd is unavailable, not a shell exit 1", async (t) => {
  const empty = tmpRepo(t, "speclaw-no-npx-cmd-");
  const outcome = await selfUpdate({
    pkg: "@esneiderbravo/speclaw",
    version: "9.9.9",
    args: [],
    env: { Path: empty },
    platform: "win32",
  });
  assert.deepEqual(outcome, { kind: "unavailable", reason: "npx.cmd not found on PATH" });
});

// Covers: req~update-self-update~1
test("onPath finds a command in any PATH entry, matching the key case-insensitively", (t) => {
  const bin = tmpRepo(t, "speclaw-onpath-");
  fs.writeFileSync(path.join(bin, "npx.cmd"), "");
  assert.equal(onPath("npx.cmd", { Path: `C:\\nowhere;${bin}` }, ";"), true);
  assert.equal(onPath("npx.cmd", { PATH: "" }, ";"), false);
  assert.equal(onPath("npx.cmd", {}, ";"), false);
});
