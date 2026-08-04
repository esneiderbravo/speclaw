import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pkgName, pkgVersion } from "../../shared/version.js";
import { c, link } from "./ui.js";

// A lightweight, best-effort update notifier. The registry is queried at most
// once a day (result cached under ~/.speclaw/), the lookup is time-boxed, and
// every failure is swallowed — checking for updates must never slow down or
// break a command. Notices go to stderr so piped stdout stays clean.

const TTL_MS = 24 * 60 * 60 * 1000;

function cacheFile(): string {
  return path.join(os.homedir(), ".speclaw", "update-check.json");
}

function readCache(): { checkedAt: number; latest: string } | null {
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile(), "utf8"));
    if (typeof c.checkedAt === "number" && typeof c.latest === "string") return c;
  } catch {
    /* no cache yet */
  }
  return null;
}

function writeCache(latest: string): void {
  try {
    const f = cacheFile();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify({ checkedAt: Date.now(), latest }));
  } catch {
    /* cache is an optimization; ignore failures */
  }
}

async function fetchLatest(name: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const url = `https://registry.npmjs.org/${name.replace("/", "%2F")}/latest`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: string };
    return typeof body.version === "string" ? body.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Compare two dotted versions (ignoring any prerelease suffix).
 *
 * @returns True when `latest` is strictly newer than `current`.
 */
export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) =>
    v
      .split("-")[0]!
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

/**
 * Resolve the current version and the latest published one, using the daily
 * cache unless `force` is set. Falls back to stale cache when offline.
 *
 * @param opts - `force` bypasses the cache and always queries the registry.
 * @returns The current/latest versions and whether an upgrade is available.
 */
export async function checkForUpdates(
  opts: { force?: boolean } = {},
): Promise<{ current: string; latest: string | null; updateAvailable: boolean }> {
  const current = pkgVersion();
  const cache = readCache();
  let latest: string | null;

  if (!opts.force && cache && Date.now() - cache.checkedAt < TTL_MS) {
    latest = cache.latest;
  } else {
    latest = await fetchLatest(pkgName());
    if (latest) writeCache(latest);
    else if (cache) latest = cache.latest; // offline: use whatever we last knew
  }

  return { current, latest, updateAvailable: !!latest && isNewer(latest, current) };
}

/** The public npm page for a package, where an upgrade can be reviewed. */
export function npmPackageUrl(name: string): string {
  return `https://www.npmjs.com/package/${name}`;
}

/**
 * Build the two-line "update available" notice. The latest version is rendered
 * as a clickable link to the package's npm page, so a capable terminal lets the
 * user open the release with a single click while `speclaw update` remains the
 * command that performs the upgrade.
 *
 * @param current - The installed version.
 * @param latest - The newest published version.
 * @returns The formatted, styled notice (no leading/trailing blank lines).
 */
export function upgradeNotice(current: string, latest: string): string {
  const latestLink = c.cyan(link(latest, npmPackageUrl(pkgName())));
  return (
    "  " +
    c.amber("⬆ speclaw ") +
    c.muted(current + " → ") +
    latestLink +
    c.muted(" available") +
    "\n" +
    "  " +
    c.muted("run ") +
    c.cyan("speclaw update") +
    c.muted(" — upgrades and applies only what's new")
  );
}

/**
 * Print the "update available" notice to stderr when a newer version exists.
 * No-op for the `mcp`/`update`/`help`/`version` commands, on non-TTY stderr, or
 * when NO_UPDATE_NOTIFIER / SPECLAW_NO_UPDATE_NOTIFIER is set. Never throws.
 *
 * @param cmd - The command that just ran (used to skip noisy contexts).
 */
export async function maybeNotifyUpdate(cmd: string | undefined): Promise<void> {
  try {
    if (process.env.NO_UPDATE_NOTIFIER || process.env.SPECLAW_NO_UPDATE_NOTIFIER) return;
    if (!process.stderr.isTTY) return;
    // `init` shows its own prominent up-front warning and ends on the clean
    // copy-paste prompt — don't append a second notice after it.
    if (
      !cmd ||
      ["mcp", "update", "init", "help", "--help", "-h", "version", "--version", "-v"].includes(cmd)
    )
      return;

    const { current, latest, updateAvailable } = await checkForUpdates();
    if (!updateAvailable || !latest) return;

    process.stderr.write("\n" + upgradeNotice(current, latest) + "\n\n");
  } catch {
    /* the notifier is best-effort — never let it break a command */
  }
}
