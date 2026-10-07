import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/modules/lawbook/assets",
);

function read(rel: string): string {
  // Collapse hard wraps so phrases can be matched across line breaks.
  return fs.readFileSync(path.join(ASSETS, rel), "utf8").replace(/\s+/g, " ");
}

// Covers: req~cortex-status-updates~1
test("cortex load step sets up one status timer from the summary interval", () => {
  const body = read("skills/cortex/steps/01-load-or-start.md");
  assert.match(body, /`summary\.statusIntervalMinutes` from the `status` result/);
  assert.match(body, /`0` disables unsolicited updates/);
  assert.match(body, /`CronCreate`/);
  assert.match(body, /create \*\*one\*\* recurring timer every `statusIntervalMinutes` minutes/);
  assert.match(
    body,
    /only inside a Cortex run, never a second one per run, and none when the interval is 0/,
  );
  assert.match(body, /Prefer background role dispatch/);
  assert.match(body, /without a session timer/);
});

// Covers: req~cortex-status-updates~1
test("cortex load step creates the timer only for an active run", () => {
  const body = read("skills/cortex/steps/01-load-or-start.md");
  assert.match(body, /only when the summary is non-null and the stage is not `done`/);
});

// Covers: req~cortex-status-updates~1
test("cortex load step keeps the timer id so there is exactly one timer", () => {
  const body = read("skills/cortex/steps/01-load-or-start.md");
  assert.match(body, /Remember the id that `CronCreate` returns/);
  assert.match(body, /`CronList`/);
  assert.match(body, /exactly one per run/);
  assert.match(body, /`CronDelete` always targets that id/);
});

// Covers: req~cortex-status-updates~1
test("cortex load step expresses every interval as a valid cron schedule", () => {
  const body = read("skills/cortex/steps/01-load-or-start.md");
  assert.match(body, /for 1–59 minutes use `\*\/N \* \* \* \*`/);
  assert.match(body, /for 60 \(the engine caps the interval at 60\) use an hourly expression/);
});

// Covers: req~cortex-status-updates~1
test("cortex timer prompt carries the change and the rules", () => {
  const body = read("skills/cortex/steps/01-load-or-start.md");
  assert.match(body, /Name the change and the rules/);
  assert.match(body, /run `cortex` action `status` for that change/);
  assert.match(body, /in the session's language/);
  assert.match(body, /skip the ping while the stage is `questions`/);
  assert.match(
    body,
    /when the stage is `done` or the run was stopped, delete this timer \(`CronDelete`\)/,
  );
});

// Covers: req~cortex-status-updates~1
test("cortex dispatch loop posts updates in the session language", () => {
  const body = read("skills/cortex/steps/02-dispatch-loop.md");
  assert.match(body, /after every Cortex op and just before every blocking role dispatch/);
  assert.match(body, /Unless `summary\.statusIntervalMinutes` is 0/);
  assert.match(body, /session's language/);
  assert.match(body, /keep stage, role, and tool names, file paths, and change names in English/);
  assert.match(body, /Skip timer pings while the stage is `questions`/);
  assert.match(
    body,
    /When the human asks to stop the updates, delete the timer \(`CronDelete` with the id `CronCreate` returned\)/,
  );
  assert.match(body, /no further unsolicited update/);
  for (const field of [
    "stage and active role",
    "elapsed time",
    "tasks done/total",
    "rework",
    "pending verdicts",
  ]) {
    assert.ok(body.includes(field), `dispatch loop update content missing ${field}`);
  }
});

// Covers: req~cortex-status-updates~1
test("cortex complete step deletes the status timer", () => {
  const body = read("skills/cortex/steps/03-complete.md");
  assert.match(body, /`done` \(or the human stops the run\), first delete the status timer/);
  assert.match(body, /`CronDelete` with the id `CronCreate` returned/);
});

test("cortex command mentions the status interval key", () => {
  const body = read("commands/cortex.md");
  assert.match(body, /`cortex\.statusIntervalMinutes`/);
  assert.match(body, /default 0, `0` disables, at most 60/);
});
