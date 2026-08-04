import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo, write, read, has } from "../helpers/env.js";
import {
  emptyReport,
  sha256,
  copyRendered,
  ensureGitignore,
  type CopyOpts,
} from "../../src/shared/install.js";

test("emptyReport starts with all lists empty", () => {
  const r = emptyReport();
  assert.deepEqual(r, {
    written: [],
    skipped: [],
    refreshedDiverged: [],
    backedUp: [],
    symlinks: [],
    unresolvedVars: [],
  });
});

test("sha256 is deterministic and content-sensitive", () => {
  assert.equal(sha256("abc"), sha256("abc"));
  assert.notEqual(sha256("abc"), sha256("abd"));
});

test("copyRendered renders .md, copies other files verbatim, records unresolved vars", (t) => {
  const root = tmpRepo(t);
  const src = path.join(root, "src");
  const dest = path.join(root, "dest");
  write(root, "src/note.md", "Hello {{name}}, missing {{gone}}");
  write(root, "src/data.json", '{"k":1}');

  const report = emptyReport();
  copyRendered(src, dest, { name: "Ada" }, report);

  assert.equal(read(root, "dest/note.md"), "Hello Ada, missing {{gone}}");
  assert.equal(read(root, "dest/data.json"), '{"k":1}');
  assert.deepEqual(report.unresolvedVars, ["gone"]);
  assert.equal(report.written.length, 2);
});

test("copyRendered recurses into subdirectories", (t) => {
  const root = tmpRepo(t);
  write(root, "src/a/b/deep.md", "x{{y}}");
  const report = emptyReport();
  copyRendered(path.join(root, "src"), path.join(root, "out"), { y: "Z" }, report);
  assert.equal(read(root, "out/a/b/deep.md"), "xZ");
});

test("copyRendered skips an existing destination when additive", (t) => {
  const root = tmpRepo(t);
  write(root, "src/f.md", "new {{v}}");
  write(root, "dest/f.md", "PRE-EXISTING");
  const report = emptyReport();
  copyRendered(path.join(root, "src"), path.join(root, "dest"), { v: "1" }, report);
  assert.equal(read(root, "dest/f.md"), "PRE-EXISTING");
  assert.equal(report.skipped.length, 1);
  assert.equal(report.written.length, 0);
});

test("copyRendered with overwrite leaves identical content untouched but records its baseline", (t) => {
  const root = tmpRepo(t);
  write(root, "src/f.md", "same {{v}}");
  write(root, "dest/f.md", "same 1"); // already the rendered result
  const record: Record<string, string> = {};
  const opts: CopyOpts = { overwrite: true, projectPath: root, record };
  copyRendered(path.join(root, "src"), path.join(root, "dest"), { v: "1" }, emptyReport(), opts);
  assert.equal(read(root, "dest/f.md"), "same 1");
  assert.equal(record["dest/f.md"], sha256("same 1"));
});

test("copyRendered overwrites a diverged managed file and records it (no backup by default)", (t) => {
  const root = tmpRepo(t);
  write(root, "src/f.md", "v2 content");
  write(root, "dest/f.md", "locally edited");
  const report = emptyReport();
  copyRendered(path.join(root, "src"), path.join(root, "dest"), {}, report, {
    overwrite: true,
    projectPath: root,
  });
  assert.equal(read(root, "dest/f.md"), "v2 content");
  assert.deepEqual(report.refreshedDiverged, [path.join(root, "dest", "f.md")]);
  assert.ok(!has(root, "dest/f.md.bak"));
});

test("copyRendered backs up a diverged file to .bak when backup is set", (t) => {
  const root = tmpRepo(t);
  write(root, "src/f.md", "v2");
  write(root, "dest/f.md", "user edit");
  const report = emptyReport();
  copyRendered(path.join(root, "src"), path.join(root, "dest"), {}, report, {
    overwrite: true,
    backup: true,
    projectPath: root,
  });
  assert.equal(read(root, "dest/f.md.bak"), "user edit");
  assert.equal(report.backedUp.length, 1);
});

test("copyRendered treats a file matching its baseline as an expected refresh (no diverge record)", (t) => {
  const root = tmpRepo(t);
  write(root, "src/f.md", "v2");
  write(root, "dest/f.md", "v1"); // last written by us
  const report = emptyReport();
  copyRendered(path.join(root, "src"), path.join(root, "dest"), {}, report, {
    overwrite: true,
    projectPath: root,
    baselines: { "dest/f.md": sha256("v1") },
  });
  assert.equal(read(root, "dest/f.md"), "v2");
  assert.equal(report.refreshedDiverged.length, 0);
});

test("ensureGitignore creates, appends, and de-duplicates entries", (t) => {
  const root = tmpRepo(t);
  const report = emptyReport();

  ensureGitignore(root, ".speclaw/", "index", report);
  assert.match(read(root, ".gitignore"), /\.speclaw\//);

  ensureGitignore(root, "*.bak", "backups", report);
  const content = read(root, ".gitignore");
  assert.match(content, /\*\.bak/);

  const before = read(root, ".gitignore");
  ensureGitignore(root, ".speclaw/", "index again", report);
  assert.equal(read(root, ".gitignore"), before, "existing entry is not appended twice");
});

test("ensureGitignore adds a newline before appending to a file without a trailing one", (t) => {
  const root = tmpRepo(t);
  fs.writeFileSync(path.join(root, ".gitignore"), "existing");
  ensureGitignore(root, "new-entry", "c", emptyReport());
  const lines = read(root, ".gitignore").split("\n");
  assert.ok(lines.includes("new-entry"));
  assert.ok(lines.includes("existing"));
});
