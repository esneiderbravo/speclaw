# Design — add-version-command

## Approach

Report the locally installed version and, interactively, suggest an upgrade
when npm has a newer one — reusing the existing version resolver
(`pkgVersion()`) and update checker (`checkForUpdates()`). Four source touches
plus an e2e test; no new dependency.

### 1. A dedicated command handler — `src/cli/commands/version.ts`

The version command grew past a one-liner (print + async network check +
conditional notice), so it becomes a real handler like the other
`src/cli/commands/*.ts`, lazily imported from `dispatch`:

```ts
export async function runVersion(): Promise<void> {
  console.log(pkgVersion());                       // bare, stdout, scriptable
  if (process.env.NO_UPDATE_NOTIFIER || process.env.SPECLAW_NO_UPDATE_NOTIFIER) return;
  if (!process.stderr.isTTY) return;               // scripts/CI: no network, clean
  try {
    const { current, latest, updateAvailable } = await checkForUpdates({ force: true });
    if (updateAvailable && latest) process.stderr.write("\n" + upgradeNotice(current, latest) + "\n\n");
  } catch { /* best-effort — never break --version */ }
}
```

- **stdout = installed version only.** The bare string keeps
  `v=$(speclaw --version)` working. The upgrade suggestion goes to **stderr**,
  so it never contaminates the scriptable value while still being visible in an
  interactive terminal.
- **Interactive-only network.** Skipped when stderr is not a TTY or the notifier
  is disabled — so piped/CI invocations pay zero network cost and stay
  deterministic (this is also what keeps the e2e suite hermetic: `runCli` sets
  `SPECLAW_NO_UPDATE_NOTIFIER=1`).
- **`force: true`.** An explicit version query should reflect npm *now*, so it
  bypasses the daily cache (unlike the passive post-command notifier).
- **Best-effort.** Every failure is swallowed; the command always prints the
  version and exits `0`.

### 2. Dispatch + HELP — `src/cli/index.ts`

`case "version": case "--version": case "-v":` returns
`(await import("./commands/version.js")).runVersion()`, matching how every other
non-trivial command is lazily imported. `-v` is unambiguous — the CLI has no
verbose flag, and as the command token it arrives as `cmd`. HELP gains a
`--version` line under "Other".

### 3. Shared, clickable notice — `src/cli/lib/update-check.ts`

`maybeNotifyUpdate` already built an "update available" string inline. Extract
it into a pure, exported `upgradeNotice(current, latest)` and a
`npmPackageUrl(name)` helper, and have both `maybeNotifyUpdate` and `runVersion`
use it (DRY). The newer version in the notice is wrapped in a clickable
hyperlink to the package's npm page; the `speclaw update` command stays visible
as the actual upgrade action. The version aliases remain in `maybeNotifyUpdate`'s
skip list so the post-dispatch notifier does not double-print the suggestion the
version command already emitted.

### 4. Terminal hyperlink — `src/cli/lib/ui.ts`

Add `link(label, url)` emitting an **OSC 8** hyperlink
(`\x1b]8;;URL\x1b\\LABEL\x1b]8;;\x1b\\`) when rich output is on. Capable
terminals render `label` as clickable; older ones ignore the escapes and show
`label`. When rich output is off (non-TTY / `NO_COLOR`) it falls back to
`label (url)` so piped and dumb-terminal output stays legible and the URL is
still present.

### 5. Tests / verification

The `quality-gates` law designates the interactive CLI surface
(`src/cli/commands/**`, the entrypoint, `src/cli/lib/{ui,update-check}`) as
**verified by behavior, excluded from the in-process coverage denominator** —
the mechanism being that no in-process test imports those modules. So:

- **e2e** (`test/e2e/cli.test.ts`) drives the built CLI for `--version`/`-v`/
  `version`: bare `package.json` version on stdout, exit `0`, no
  `Unknown command`/HELP dump, and `help` lists `--version`.
- **No in-process unit test** is added for `upgradeNotice`/`link`: importing
  them would pull the whole CLI-surface modules into the coverage denominator,
  contradicting the law and dropping the reported figure.
- The **upgrade-suggestion path** needs the network and a TTY, so it cannot run
  hermetically in the suite (live network is forbidden by the testing
  standards). Its rendering — the OSC 8 clickable form and the plain
  `label (url)` fallback — is verified by an **isolated demo** during manual
  verification and recorded in the report.

## Alternatives weighed

1. **Installed version only, no npm check (the original draft).** Rejected per
   the user's requirement: the command must also surface npm's newer version and
   suggest upgrading.

2. **Suggestion on stdout vs. stderr.** Chose stderr. Mixing it into stdout
   would break `v=$(speclaw --version)`. stderr is still visible interactively
   and matches the existing notifier's channel.

3. **Fresh (`force`) vs. cached check.** Chose fresh for the explicit version
   command — "show me npm right now" — accepting the time-boxed (2.5s) lookup,
   which only runs interactively. The passive post-command notifier keeps its
   daily cache.

4. **Clickable target: run the upgrade vs. open a page.** A terminal hyperlink
   can only open a URL — it cannot execute `speclaw update`. So the click opens
   the npm package page (review the release), and the `speclaw update` command
   remains the actual one-command upgrade. Honest and achievable.

5. **Inline handler vs. a command module.** The draft used an inline `case`
   while it was a single `console.log`; with the async check it moves to
   `commands/version.ts`, consistent with the other handlers.

6. **Name-prefixed stdout (`speclaw 0.1.4`).** Rejected for stdout — bare is the
   scriptable convention (`npm`, `node`). `pkgName()` is still used, but only to
   build the npm URL in the suggestion.

## Trade-offs

- **Upgrade path not automated in the suite.** It is network- and TTY-bound;
  hermetic e2e is impossible without a fake registry (out of scope). Covered by
  an isolated manual demo + the pre-existing `checkForUpdates` behavior.
  Accepted, and consistent with the law's behavioral-verification model for the
  CLI surface.
- **Interactive `--version` makes a network call.** Time-boxed, best-effort, and
  skipped entirely for non-TTY/opted-out runs, so scripts are unaffected.
  Accepted.
- **One-command upgrade is not a literal click.** Terminal limitation; the click
  opens the page and `speclaw update` performs the upgrade. Accepted and
  documented.

## Affected files

- **Source:** `src/cli/commands/version.ts` (new), `src/cli/index.ts` (dispatch
  case + HELP line), `src/cli/lib/update-check.ts` (extract `upgradeNotice` +
  `npmPackageUrl`, reuse in `maybeNotifyUpdate`), `src/cli/lib/ui.ts` (`link`).
- **Tests:** `test/e2e/cli.test.ts` (version aliases + help-lists-version).
- **Docs:** the in-CLI HELP text only; no `docs/standards/` change.
