import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpRepo } from "../helpers/env.js";
import { readGreenRuns, recordGreenRun, reuseGreenRuns } from "../../src/shared/test-runs.js";

const PLAN = "npm run pretest && node --test dist/a.test.js dist/b.test.js";
const FILES = ["dist/a.test.js", "dist/b.test.js"];
const EDIT = Date.parse("2026-10-08T12:00:00Z");
const after = (command: string) => ({ at: "2026-10-08T12:05:00.000Z", command, tail: "ok" });
const whole = (c: string) => c === "npm test";

test("a run after the last edit with the setup step covers the files it ran", () => {
  const r = reuseGreenRuns(
    [after("npm run pretest >/dev/null 2>&1; node --test dist/a.test.js")],
    PLAN,
    FILES,
    EDIT,
    whole,
  );
  assert.deepEqual(r?.covered, ["dist/a.test.js"]);
  assert.equal(r?.command, "npm run pretest && node --test dist/b.test.js");
});

test("covering every file leaves nothing to run; a whole-suite run covers all", () => {
  const all = reuseGreenRuns(
    [after("npm run pretest && node --test " + FILES.join(" "))],
    PLAN,
    FILES,
    EDIT,
    whole,
  );
  assert.equal(all?.command, null);
  assert.equal(reuseGreenRuns([after("npm test")], PLAN, FILES, EDIT, whole)?.command, null);
});

test("a setup step run on its own between the edit and the tests counts", () => {
  const setup = {
    at: "2026-10-08T12:04:00.000Z",
    command: "npm run pretest 2>&1 | tail -3",
    tail: "",
    kind: "setup" as const,
  };
  const r = reuseGreenRuns(
    [setup, after("node --test dist/a.test.js dist/b.test.js")],
    PLAN,
    FILES,
    EDIT,
    whole,
  );
  assert.equal(r?.command, null);
  const late = { ...setup, at: "2026-10-08T12:06:00.000Z" };
  assert.equal(
    reuseGreenRuns([after("node --test dist/a.test.js"), late], PLAN, FILES, EDIT, whole),
    null,
  );
});

test("runs before the edit, without the setup step, or filtered do not count", () => {
  const stale = { at: "2026-10-08T11:00:00.000Z", command: "npm test", tail: "" };
  assert.equal(reuseGreenRuns([stale], PLAN, FILES, EDIT, whole), null);
  assert.equal(
    reuseGreenRuns([after("node --test dist/a.test.js")], PLAN, FILES, EDIT, whole),
    null,
  );
  assert.equal(
    reuseGreenRuns(
      [after("npm run pretest && node --test --test-name-pattern=x dist/a.test.js")],
      PLAN,
      FILES,
      EDIT,
      whole,
    ),
    null,
  );
});

test("the log keeps the newest runs and survives a torn line", (t) => {
  const root = tmpRepo(t);
  for (let i = 0; i < 45; i++) recordGreenRun(root, `npm test #${i}`, "ok");
  const runs = readGreenRuns(root);
  assert.equal(runs.length, 40);
  assert.equal(runs.at(-1)!.command, "npm test #44");
});
