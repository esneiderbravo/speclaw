import { spawnSync } from "node:child_process";
import { write } from "./env.js";

/**
 * Test helpers for building ephemeral git repos with real commit history.
 *
 * Every git-history test needs commits, and a freshly `git init`-ed temp repo
 * has no configured identity — so these commit with `-c user.*` flags rather
 * than mutating any global config. All repos are throwaway temp dirs (see
 * `tmpRepo`), never the project's own tree.
 */

/** Run git in `dir` with a fixed committer identity; returns trimmed stdout. */
function git(dir: string, ...args: string[]): string {
  const res = spawnSync(
    "git",
    ["-C", dir, "-c", "user.email=test@speclaw.dev", "-c", "user.name=speclaw test", ...args],
    { encoding: "utf8" },
  );
  return (res.stdout ?? "").trim();
}

/** Initialise a git repo in `dir` (quiet, no history yet). */
export function gitInit(dir: string): void {
  git(dir, "init", "-q");
}

/**
 * Write each `{ path, content }` file under `dir`, stage it, and commit with
 * `message`. Returns the new commit's SHA.
 *
 * @param author - Optional override for author/committer identity on this commit.
 */
export function commit(
  dir: string,
  message: string,
  files: { path: string; content: string }[],
  author?: { name: string; email: string },
): string {
  for (const f of files) write(dir, f.path, f.content);
  const name = author?.name ?? "speclaw test";
  const email = author?.email ?? "test@speclaw.dev";
  const res = spawnSync(
    "git",
    [
      "-C",
      dir,
      "-c",
      `user.email=${email}`,
      "-c",
      `user.name=${name}`,
      "add",
      "--",
      ...files.map((f) => f.path),
    ],
    { encoding: "utf8" },
  );
  if (res.status !== 0) throw new Error(`git add failed: ${res.stderr}`);
  const commitRes = spawnSync(
    "git",
    [
      "-C",
      dir,
      "-c",
      `user.email=${email}`,
      "-c",
      `user.name=${name}`,
      "commit",
      "-q",
      "-m",
      message,
    ],
    { encoding: "utf8" },
  );
  if (commitRes.status !== 0) {
    throw new Error(`git commit failed: ${commitRes.stderr ?? commitRes.stdout}`);
  }
  return git(dir, "rev-parse", "HEAD");
}

/** The current HEAD SHA of the repo in `dir`. */
export function head(dir: string): string {
  return git(dir, "rev-parse", "HEAD");
}
