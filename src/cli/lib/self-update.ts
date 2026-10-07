/**
 * Self-update for `speclaw update`: re-run the command as
 * `npx -y <pkg>@<latest> update …` so the latest release applies its own
 * migrations instead of a stale binary applying old ones. This is the only CLI
 * module that imports `child_process`; `update.ts` receives it through
 * `UpdateHooks` so tests never spawn anything.
 */
// Covers: req~update-self-update~1
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** How a self-update attempt ended. */
export type SelfUpdateOutcome =
  /** The child ran and exited with `code` (a signal counts as 1). */
  | { kind: "ran"; code: number }
  /** The child could not be started (e.g. `npx` missing); migrate in process. */
  | { kind: "unavailable"; reason: string };

/**
 * Flag tokens safe to forward to the child: `-x`, `--flag`, or `--flag=value`
 * with a conservative value charset. The charset also keeps the Windows shell
 * spawn free of injection.
 */
const SAFE_TOKEN = /^--?[A-Za-z][A-Za-z0-9-]*(=[A-Za-z0-9._/:@-]*)?$/;

/**
 * A registry version that is safe to put on a command line: strict semver with
 * an optional prerelease tag. Anything else (for example `"9.9.9 & calc"`) is
 * never spawned — it would reach the Windows shell verbatim.
 */
const SAFE_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/**
 * Whether `version` is a strict semver string safe to spawn with.
 *
 * @param version - The `latest` version reported by the registry.
 * @returns True only for `MAJOR.MINOR.PATCH` with an optional `-prerelease`.
 */
export function isSafeVersion(version: string): boolean {
  return SAFE_VERSION.test(version);
}

/**
 * Whether `command` exists as a file in a directory on the env's PATH (the key
 * is matched case-insensitively, since Windows spells it `Path`).
 *
 * @param command - The executable file name, e.g. `npx.cmd`.
 * @param env - The environment whose PATH is searched.
 * @param delimiter - The PATH separator (`;` on Windows).
 * @returns True when some PATH entry holds `command`.
 */
export function onPath(
  command: string,
  env: NodeJS.ProcessEnv,
  delimiter: string = path.delimiter,
): boolean {
  const key = Object.keys(env).find((k) => k.toUpperCase() === "PATH");
  const dirs = (key ? (env[key] ?? "") : "").split(delimiter).filter(Boolean);
  return dirs.some((dir) => fs.existsSync(path.join(dir, command)));
}

/**
 * Split the original `update` arguments into the ones forwarded to the child
 * and the ones dropped. `update` takes no positional arguments, so dropping
 * anything that is not a safe flag loses nothing in practice.
 *
 * @param argv - The arguments after `speclaw update`.
 * @returns The forwarded tokens (in order) and the dropped ones.
 */
export function safeForwardArgs(argv: readonly string[]): {
  forward: string[];
  dropped: string[];
} {
  const forward: string[] = [];
  const dropped: string[] = [];
  for (const token of argv) (SAFE_TOKEN.test(token) ? forward : dropped).push(token);
  return { forward, dropped };
}

/**
 * Run `npx -y <pkg>@<version> update <args>` with inherited stdio and the loop
 * guard `SPECLAW_SELF_UPDATED=<version>` in its environment. On Windows the
 * `npx.cmd` shim is spawned through the shell (Node refuses `.cmd` files
 * otherwise); `args` must already be filtered by {@link safeForwardArgs}. A
 * version that is not strict semver is never spawned, and on Windows a missing
 * `npx.cmd` is detected up front (the shell would turn it into exit code 1
 * rather than an ENOENT), so both report `unavailable` and the caller migrates
 * in process.
 *
 * @param opts - Package name, target version, forwarded args, the base env,
 *   and the platform (defaults to `process.platform`; tests pass `win32`).
 * @returns `ran` with the child's exit code, or `unavailable` when it could not start.
 */
export function selfUpdate(opts: {
  pkg: string;
  version: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}): Promise<SelfUpdateOutcome> {
  if (!isSafeVersion(opts.version)) {
    return Promise.resolve({
      kind: "unavailable",
      reason: `invalid version ${JSON.stringify(opts.version)}`,
    });
  }
  const windows = (opts.platform ?? process.platform) === "win32";
  const command = windows ? "npx.cmd" : "npx";
  const args = ["-y", `${opts.pkg}@${opts.version}`, "update", ...opts.args];
  const env = { ...(opts.env ?? process.env), SPECLAW_SELF_UPDATED: opts.version };
  if (windows && !onPath(command, env, ";")) {
    return Promise.resolve({ kind: "unavailable", reason: `${command} not found on PATH` });
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (outcome: SelfUpdateOutcome): void => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    try {
      const child = spawn(command, args, { stdio: "inherit", env, shell: windows });
      child.on("error", (err) => done({ kind: "unavailable", reason: err.message }));
      child.on("exit", (code) => done({ kind: "ran", code: code ?? 1 }));
    } catch (err) {
      done({ kind: "unavailable", reason: (err as Error).message });
    }
  });
}
