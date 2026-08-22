import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { redactText, redactValue } from "../../src/modules/foundation/redact.js";

test("redactText replaces home and project with tokens", () => {
  const home = os.homedir();
  const project = path.join(home, "Projects", "demo-app");
  const raw = `failed under ${project}/src/a.ts owned by ${home}`;
  const out = redactText(raw, project);
  assert.equal(out.includes(home), false);
  assert.equal(out.includes(project), false);
  assert.match(out, /<project>/);
  assert.match(out, /~/);
});

test("redactText scrubs username path segments outside home", () => {
  const user = os.userInfo().username;
  const project = path.join("/var", "proj");
  // Path that is not under $HOME, so home→~ does not already remove the user.
  const raw = `/opt/home/${user}/secret/file.ts`;
  const out = redactText(raw, project);
  assert.equal(out.includes(`/${user}/`), false);
  assert.match(out, /<user>/);
});

test("redactValue walks nested objects", () => {
  const home = os.homedir();
  const project = path.join(home, "x");
  const out = redactValue({ detail: `${project}/a`, nested: { p: home } }, project);
  assert.equal(out.detail.includes(home), false);
  assert.equal(out.nested.p, "~");
});
