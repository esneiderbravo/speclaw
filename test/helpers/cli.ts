import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This helper compiles to dist-test/test/helpers/cli.js; the repo root (which
// holds the built dist/cli/index.js the e2e tests drive) is three levels up.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Absolute path to the built CLI entrypoint the e2e tests spawn. */
export const CLI = path.join(REPO_ROOT, "dist", "cli", "index.js");

/** The exit code, stdout, and stderr of one CLI invocation. */
export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Run the built speclaw CLI as a child process and capture its result. Uses the
 * dist/ build (so `npm run build` must have run first) and disables color for
 * stable output assertions.
 *
 * @param args - CLI arguments (after the `speclaw` command name).
 * @param opts - Optional working directory for the invocation.
 * @returns The process exit code and captured stdio.
 */
export function runCli(args: string[], opts: { cwd?: string } = {}): CliResult {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    cwd: opts.cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", SPECLAW_NO_UPDATE_NOTIFIER: "1" },
  });
  return { code: res.status ?? 1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

/** Whether the built CLI exists (false when the project has not been built). */
export function cliBuilt(): boolean {
  return existsSync(CLI);
}
