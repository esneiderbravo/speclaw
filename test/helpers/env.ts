import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";

/**
 * Create an isolated, throwaway project directory under the OS temp dir and
 * register its removal on the test's completion. Every filesystem/sqlite test
 * builds its world here — never in the repo's own tree — so the suite touches no
 * real data (see docs/standards/testing-standards.md).
 *
 * @param t - The node:test context whose `after` hook cleans the directory up.
 * @param prefix - Optional directory-name prefix.
 * @returns The absolute path to the fresh temp project root.
 */
export function tmpRepo(t: TestContext, prefix = "speclaw-test-"): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Write `content` to `<root>/<rel>`, creating parent directories. Returns the absolute path. */
export function write(root: string, rel: string, content: string): string {
  const abs = path.join(root, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  return abs;
}

/** Read `<root>/<rel>` as UTF-8 text. */
export function read(root: string, rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

/** True when `<root>/<rel>` exists. */
export function has(root: string, rel: string): boolean {
  return existsSync(path.join(root, rel));
}
