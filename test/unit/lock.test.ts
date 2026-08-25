import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo, write, read, has } from "../helpers/env.js";
// Covers: req~speclaw-lock~1, req~lock-refresh-update~1
import {
  canonicalize,
  digestText,
  discoverIntegrityPaths,
  extractSpeclawYamlBlock,
  provenanceBlock,
  refreshLockfile,
  readLockfile,
  rootDigest,
  stripProvenanceBlock,
  LOCKFILE_NAME,
} from "../../src/modules/foundation/lock.js";

test("canonicalize normalizes CRLF to LF and trims EOL spaces", () => {
  const a = canonicalize("hello  \r\nworld  \r\n");
  const b = canonicalize("hello\nworld\n");
  assert.equal(a, b);
  assert.equal(digestText("hello  \r\nworld  \r\n"), digestText("hello\nworld\n"));
});

test("provenance block is excluded from digests", () => {
  const body = "# Rule\n\nDo the thing.\n";
  const dig = digestText(body);
  const withProv = body + provenanceBlock({ digest: dig, lawIds: ["law~x~1"], source: "test" });
  assert.equal(digestText(withProv), dig);
  assert.match(withProv, /speclaw:begin-provenance/);
  assert.equal(stripProvenanceBlock(withProv), body);
});

test("refreshLockfile writes speclaw.lock at repo root", (t) => {
  const root = tmpRepo(t);
  write(root, "AGENTS.md", "# Agents\n");
  write(root, "CLAUDE.md", "# Claude\n");
  write(root, "docs/standards/base.md", "# Base\n");
  const lock = refreshLockfile(root);
  assert.ok(has(root, LOCKFILE_NAME));
  assert.ok(!LOCKFILE_NAME.includes(".speclaw"));
  assert.equal(lock.lockfileVersion, 1);
  assert.ok(lock.files["AGENTS.md"]);
  assert.equal(lock.files["AGENTS.md"]!.ownership, "strict");
  assert.equal(lock.files["docs/standards/base.md"]!.ownership, "advisory");
  assert.equal(lock.root, rootDigest(lock.files));
  const again = readLockfile(root);
  assert.deepEqual(again?.files, lock.files);
});

test("canonicalize collapses trailing blank lines", () => {
  assert.equal(canonicalize("hi\n\n\n"), "hi\n");
});

test("discover ignores non-symlink at speclaw rules path", (t) => {
  const root = tmpRepo(t);
  write(root, ".claude/rules/speclaw", "not a link\n");
  const { symlinks } = discoverIntegrityPaths(root);
  assert.equal(symlinks.length, 0);
});

test("extractSpeclawYamlBlock digests only marked region", () => {
  const block = "# speclaw:begin\npath: x\n# speclaw:end";
  const raw = `other: 1\n${block}\nforeign: 2\n`;
  assert.equal(extractSpeclawYamlBlock(raw), block);
  assert.equal(digestText(extractSpeclawYamlBlock(raw)!), digestText(block));
});

test("lockfile is JSON at repository root not under .speclaw", (t) => {
  const root = tmpRepo(t);
  write(root, "AGENTS.md", "x\n");
  refreshLockfile(root);
  assert.ok(fs.existsSync(path.join(root, "speclaw.lock")));
  assert.ok(!fs.existsSync(path.join(root, ".speclaw", "speclaw.lock")));
  const raw = read(root, "speclaw.lock");
  assert.doesNotThrow(() => JSON.parse(raw));
});
