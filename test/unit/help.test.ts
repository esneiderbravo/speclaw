import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMMANDS,
  GLOBAL_HELP,
  helpFor,
  knownCommands,
  wantsHelp,
} from "../../src/cli/lib/help.js";

const indexSrc = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "src",
  "cli",
  "index.ts",
);

// Covers: req~per-command-help~1
test("the dispatcher's switch cases equal the help registry's commands", () => {
  const src = fs.readFileSync(indexSrc, "utf8");
  const cases = new Set([...src.matchAll(/case "([^"]+)":/g)].map((m) => m[1]!));
  assert.deepEqual([...cases].sort(), [...knownCommands()].sort());
});

// Covers: req~per-command-help~1
test("every registered command has usage text starting with Usage", () => {
  for (const cmd of COMMANDS) {
    assert.match(cmd.usage, /Usage:/, cmd.name);
    if (cmd.name !== "help") assert.match(cmd.usage, /^Usage: speclaw /, cmd.name);
  }
});

// Covers: req~per-command-help~1
test("update, laws, index, and lawbook usage carry their promised flags", () => {
  const update = helpFor("update")!;
  for (const f of ["--check", "--backup", "--minimal", "--no-self-update"])
    assert.ok(update.includes(f), f);
  const laws = helpFor("laws")!;
  for (const f of ["lock", "--force", "accept", "scan", "verify", "compile", "import"])
    assert.ok(laws.includes(f), f);
  const index = helpFor("index")!;
  for (const f of ["--force", "--prune"]) assert.ok(index.includes(f), f);
  const lawbook = helpFor("lawbook")!;
  for (const f of ["draft <name>", "--level", "--bug", "investigate"])
    assert.ok(lawbook.includes(f), f);
  for (const q of ["search", "recall"]) {
    for (const f of ["--focus", "--max-tokens", "--explain"])
      assert.ok(helpFor(q)!.includes(f), q + f);
  }
  assert.match(helpFor("trace")!, /call path/i);
});

test("aliases resolve to their command's usage; unknown commands have none", () => {
  assert.equal(helpFor("--help"), GLOBAL_HELP);
  assert.equal(helpFor("-v"), helpFor("version"));
  assert.equal(helpFor("frobnicate"), null);
});

test("wantsHelp detects --help and -h anywhere in the arguments", () => {
  assert.equal(wantsHelp(["--help"]), true);
  assert.equal(wantsHelp(["draft", "-h"]), true);
  assert.equal(wantsHelp(["--helpful", "-hh"]), false);
  assert.equal(wantsHelp([]), false);
});
