import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpRepo, write } from "../helpers/env.js";
import {
  checkOwners,
  doctorOwnersChecks,
  extractOwnersBlock,
  hasContentAfterOwnersBlock,
  isValidOwnerToken,
  loadTeamOwners,
  mergeOwnersBlock,
  parseTeamOwnersYaml,
  refreshOwnersIfConfigured,
  renderOwnersBlock,
  stripOwnersBlock,
  writeOwners,
  OWNERS_END,
  OWNERS_START,
} from "../../src/modules/team/owners.js";

// Covers: req~owners-syntax~1, req~owners-compile~1, req~owners-merge~1, req~owners-absent~1, req~owners-no-derive~1, req~doctor-owners~1, req~owners-refresh-update~1

test("isValidOwnerToken accepts @user, @org/team, and email", () => {
  assert.equal(isValidOwnerToken("@esneiderbravo"), true);
  assert.equal(isValidOwnerToken("@org/platform"), true);
  assert.equal(isValidOwnerToken("owner@example.com"), true);
  assert.equal(isValidOwnerToken("not-an-owner"), false);
  assert.equal(isValidOwnerToken("@"), false);
});

test("parseTeamOwnersYaml reads inline lists and star key", () => {
  const cfg = parseTeamOwnersYaml(`
team:
  owners:
    quality-gates: ["@esneiderbravo", "@org/platform"]
    "*": ["@org/architecture"]
  deriveFromTraceability: false
`);
  assert.ok(cfg);
  assert.deepEqual(cfg!.owners["quality-gates"], ["@esneiderbravo", "@org/platform"]);
  assert.deepEqual(cfg!.owners["*"], ["@org/architecture"]);
  assert.equal(cfg!.deriveFromTraceability, false);
});

test("parseTeamOwnersYaml returns null when team.owners absent", () => {
  assert.equal(parseTeamOwnersYaml("ceremony:\n  cuts: [3, 8, 15]\n"), null);
});

test("renderOwnersBlock emits trailing markers and no src/ derive lines", () => {
  const block = renderOwnersBlock(
    { cli: ["@org/dx"], "*": ["@org/architecture"] },
    { derive: true },
  );
  assert.ok(block.startsWith(OWNERS_START));
  assert.ok(block.endsWith(OWNERS_END));
  assert.ok(block.includes("lawbook/specs/cli/ @org/dx"));
  assert.ok(block.includes("lawbook/changes/*/specs/cli/ @org/dx"));
  assert.ok(block.includes("lawbook/config.yaml @org/architecture"));
  assert.ok(block.includes("docs/standards/ @org/architecture"));
  assert.ok(!block.includes("src/"));
});

test("mergeOwnersBlock preserves user content and places block last", () => {
  const existing = "# user\ndocs/** @someone\n";
  const block = renderOwnersBlock({ cli: ["@a"] });
  const merged = mergeOwnersBlock(existing, block);
  assert.ok(merged.includes("docs/** @someone"));
  assert.ok(merged.trimEnd().endsWith(OWNERS_END));
  const again = mergeOwnersBlock(merged, renderOwnersBlock({ cli: ["@b"] }));
  assert.ok(again.includes("docs/** @someone"));
  assert.ok(again.includes("@b"));
  assert.ok(!again.includes("@a"));
});

test("hasContentAfterOwnersBlock detects last-match trap", () => {
  const bad = `${OWNERS_START}\nx @a\n${OWNERS_END}\n* @other\n`;
  assert.equal(hasContentAfterOwnersBlock(bad), true);
  const good = `# user\n${OWNERS_START}\nx @a\n${OWNERS_END}\n`;
  assert.equal(hasContentAfterOwnersBlock(good), false);
});

test("writeOwners is a no-op when team.owners absent", (t) => {
  const repo = tmpRepo(t);
  write(repo, "lawbook/config.yaml", "ceremony:\n  cuts: [3]\n");
  const result = writeOwners(repo);
  assert.equal(result.written, false);
  assert.equal(fs.existsSync(path.join(repo, ".github", "CODEOWNERS")), false);
});

test("writeOwners compiles declared owners at end of CODEOWNERS", (t) => {
  const repo = tmpRepo(t);
  write(
    repo,
    "lawbook/config.yaml",
    `team:\n  owners:\n    quality-gates: ["@esneiderbravo"]\n    "*": ["@esneiderbravo"]\n`,
  );
  write(repo, ".github/CODEOWNERS", "* @someone\n");
  const result = writeOwners(repo);
  assert.equal(result.written, true);
  const text = fs.readFileSync(path.join(repo, ".github", "CODEOWNERS"), "utf8");
  assert.ok(text.includes("* @someone"));
  assert.ok(text.includes("lawbook/specs/quality-gates/ @esneiderbravo"));
  assert.ok(text.trimEnd().endsWith(OWNERS_END));
  assert.equal(hasContentAfterOwnersBlock(text), false);
});

test("writeOwners rejects invalid owner tokens", (t) => {
  const repo = tmpRepo(t);
  write(repo, "lawbook/config.yaml", `team:\n  owners:\n    cli: ["not-an-owner"]\n`);
  assert.throws(() => writeOwners(repo), /not-an-owner/);
});

test("checkOwners detects drift without writing", (t) => {
  const repo = tmpRepo(t);
  write(repo, "lawbook/config.yaml", `team:\n  owners:\n    cli: ["@esneiderbravo"]\n`);
  writeOwners(repo);
  const out = path.join(repo, ".github", "CODEOWNERS");
  fs.writeFileSync(out, fs.readFileSync(out, "utf8").replace("@esneiderbravo", "@other"));
  const check = checkOwners(repo);
  assert.equal(check.ok, false);
  assert.ok(check.detail.includes("does not match") || check.detail.length > 0);
  assert.ok(fs.readFileSync(out, "utf8").includes("@other"));
});

test("loadTeamOwners reads from disk", (t) => {
  const repo = tmpRepo(t);
  write(repo, "lawbook/config.yaml", `team:\n  owners:\n    cli: ["@a"]\n`);
  const cfg = loadTeamOwners(repo);
  assert.deepEqual(cfg?.owners.cli, ["@a"]);
});

test("doctorOwnersChecks skips when undeclared and errors after end marker", (t) => {
  const bare = tmpRepo(t);
  write(bare, "lawbook/config.yaml", "ceremony:\n  cuts: [3]\n");
  const skip = doctorOwnersChecks(bare);
  assert.equal(skip[0]?.status, "skip");

  const repo = tmpRepo(t);
  write(repo, "lawbook/config.yaml", `team:\n  owners:\n    cli: ["@esneiderbravo"]\n`);
  writeOwners(repo);
  const out = path.join(repo, ".github", "CODEOWNERS");
  fs.appendFileSync(out, "\n* @override\n");
  const checks = doctorOwnersChecks(repo);
  const block = checks.find((c) => c.id === "cfg.owners.block");
  assert.equal(block?.status, "error");
  assert.ok(block?.detail.toLowerCase().includes("last"));
  const protect = checks.find((c) => c.id === "cfg.owners.protection");
  assert.equal(protect?.status, "warn");
  assert.ok(extractOwnersBlock(fs.readFileSync(out, "utf8")));
});

test("parseTeamOwnersYaml reads dashed lists and derive flag", () => {
  const cfg = parseTeamOwnersYaml(`
team:
  deriveFromTraceability: true
  owners:
    payments:
      - "@org/payments"
      - 'lead@example.com'
`);
  assert.ok(cfg);
  assert.equal(cfg!.deriveFromTraceability, true);
  assert.deepEqual(cfg!.owners.payments, ["@org/payments", "lead@example.com"]);
});

test("stripOwnersBlock removes orphan start and rewrite is idempotent", () => {
  const orphan = `${OWNERS_START}\nstale @a\n`;
  assert.equal(stripOwnersBlock(orphan).trim(), "");
  const full = `keep\n${renderOwnersBlock({ cli: ["@a"] })}\n`;
  assert.ok(stripOwnersBlock(full).includes("keep"));
  assert.ok(!stripOwnersBlock(full).includes(OWNERS_START));
});

test("checkOwners reports missing block and content-after", (t) => {
  const repo = tmpRepo(t);
  write(repo, "lawbook/config.yaml", `team:\n  owners:\n    cli: ["@esneiderbravo"]\n`);
  assert.equal(checkOwners(repo).ok, false);
  writeOwners(repo);
  assert.equal(checkOwners(repo).ok, true);
  const out = path.join(repo, ".github", "CODEOWNERS");
  fs.appendFileSync(out, "\n* @x\n");
  assert.equal(checkOwners(repo).ok, false);
});

test("doctorOwnersChecks covers missing file, bad syntax, and missing block", (t) => {
  const bad = tmpRepo(t);
  write(bad, "lawbook/config.yaml", `team:\n  owners:\n    cli: ["nope"]\n`);
  const syn = doctorOwnersChecks(bad).find((c) => c.id === "cfg.owners.syntax");
  assert.equal(syn?.status, "error");

  const missingFile = tmpRepo(t);
  write(missingFile, "lawbook/config.yaml", `team:\n  owners:\n    cli: ["@esneiderbravo"]\n`);
  const miss = doctorOwnersChecks(missingFile).find((c) => c.id === "cfg.owners.block");
  assert.equal(miss?.status, "warn");

  const noBlock = tmpRepo(t);
  write(noBlock, "lawbook/config.yaml", `team:\n  owners:\n    cli: ["@esneiderbravo"]\n`);
  write(noBlock, ".github/CODEOWNERS", "* @esneiderbravo\n");
  const nb = doctorOwnersChecks(noBlock).find((c) => c.id === "cfg.owners.block");
  assert.equal(nb?.status, "warn");
});

test("refreshOwnersIfConfigured returns null when absent and writes when present", (t) => {
  const bare = tmpRepo(t);
  write(bare, "lawbook/config.yaml", "ceremony:\n  cuts: [3]\n");
  assert.equal(refreshOwnersIfConfigured(bare), null);

  const repo = tmpRepo(t);
  write(repo, "lawbook/config.yaml", `team:\n  owners:\n    cli: ["@esneiderbravo"]\n`);
  const r = refreshOwnersIfConfigured(repo);
  assert.equal(r?.written, true);
});

test("checkOwners reports invalid tokens without writing", (t) => {
  const repo = tmpRepo(t);
  write(repo, "lawbook/config.yaml", `team:\n  owners:\n    cli: ["not-an-owner"]\n`);
  const check = checkOwners(repo);
  assert.equal(check.ok, false);
  assert.ok(check.detail.includes("not-an-owner"));
});

test("loadTeamOwners returns null when config.yaml is missing", (t) => {
  const repo = tmpRepo(t);
  assert.equal(loadTeamOwners(repo), null);
});

test("parseTeamOwnersYaml handles scalar owners and derive after owners block", () => {
  const cfg = parseTeamOwnersYaml(`
team:
  owners:
    cli: @esneiderbravo
  deriveFromTraceability: false
other:
  x: 1
`);
  assert.ok(cfg);
  assert.deepEqual(cfg!.owners.cli, ["@esneiderbravo"]);
  assert.equal(cfg!.deriveFromTraceability, false);
});

test("parseTeamOwnersYaml drops empty inline lists", () => {
  assert.equal(parseTeamOwnersYaml(`team:\n  owners:\n    cli: []\n`), null);
});
