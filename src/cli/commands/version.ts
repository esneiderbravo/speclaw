import { pkgVersion } from "../../shared/version.js";
import { checkForUpdates, upgradeNotice } from "../lib/update-check.js";

/**
 * Print the locally installed speclaw version and, when a newer version is
 * published on npm, a clickable suggestion to upgrade.
 *
 * The installed version (from the package's own `package.json`) always goes to
 * **stdout** as a bare line, so it stays script- and pipe-friendly
 * (`v=$(speclaw --version)`). The upgrade suggestion — which requires a network
 * lookup — goes to **stderr** and only when stderr is an interactive TTY and
 * the notifier is not disabled, so scripts and CI pay no network cost and get
 * clean output. The lookup is forced (bypasses the daily cache) so an explicit
 * version query reflects npm right now, and every failure is swallowed: a
 * flaky or offline registry must never break `--version`.
 */
export async function runVersion(): Promise<void> {
  console.log(pkgVersion());

  if (process.env.NO_UPDATE_NOTIFIER || process.env.SPECLAW_NO_UPDATE_NOTIFIER) return;
  if (!process.stderr.isTTY) return;

  try {
    const { current, latest, updateAvailable } = await checkForUpdates({ force: true });
    if (updateAvailable && latest) {
      process.stderr.write("\n" + upgradeNotice(current, latest) + "\n\n");
    }
  } catch {
    /* the update check is best-effort — never let it break `--version` */
  }
}
