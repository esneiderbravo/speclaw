# Proposal — add-version-command

## Why

`speclaw` has no way to report its own version. Every command dispatches through
the `switch` in `src/cli/index.ts`; `help`/`--help`/`-h` are handled inline, but
there is no `version`/`--version`/`-v` case. As a result `speclaw --version`
falls through to the `default:` branch — it prints `Unknown command: --version`,
dumps the full HELP text, and exits `1`.

This is a papercut with real cost:

- **Bug reports and support.** "What version are you on?" has no answer short of
  `npm ls -g @esneiderbravo/speclaw` or opening `package.json`. A CLI that
  can't state its own version is hard to triage.
- **Convention.** Every mainstream CLI answers `--version`. Its absence — and
  worse, exiting non-zero on it — is surprising and makes `speclaw` look
  unfinished.
- **The pieces already exist.** `src/shared/version.ts` already exposes
  `pkgVersion()` and `pkgName()` (cached reads of the package's `package.json`,
  with a safe fallback). They are used by `update`, the update-notifier, and the
  scaffolder — nothing new is needed to *resolve* the version; it is purely
  unwired from the command surface.

## What

1. **A version command in the CLI dispatch.** Add `version`, `--version`, and
   `-v` as recognized commands in `src/cli/index.ts`'s `dispatch`. They print
   the installed version to **stdout** and return with exit code `0`. Output is
   the bare version string (e.g. `0.1.4`) so it is script- and pipe-friendly,
   matching `npm --version` / `node --version`.

2. **Offer an upgrade when npm has a newer version.** When run interactively,
   the version command checks npm for the latest published version and, if it is
   newer than the installed one, prints (to **stderr**, so stdout stays a clean
   scriptable value) a suggestion that renders the newer version as a **clickable
   terminal hyperlink** (OSC 8) to the package's npm page, alongside the
   `speclaw update` command that performs the upgrade. The check is best-effort:
   skipped when stderr is not a TTY or the notifier is disabled, and any registry
   failure is swallowed so `--version` always prints and exits `0`. The
   post-command notifier (`maybeNotifyUpdate`) is refactored to share the same
   notice, so the clickable link benefits every command's notice; the version
   aliases stay in that notifier's skip list so the version command's own
   suggestion is not printed twice.

3. **Document it in HELP.** Add a `--version` line under the "Other" section of
   the `HELP` string so the command is discoverable.

4. **Verification.** An e2e test spawns the built CLI with `--version`/`-v`/
   `version` and asserts the bare `package.json` version on stdout, exit `0`, and
   that `help` lists `--version` — the sanctioned layer for the interactive CLI
   surface, which the `quality-gates` law verifies behaviorally rather than by
   in-process coverage. The upgrade-suggestion path depends on the network and a
   TTY, so it cannot run hermetically in the suite; its rendering (clickable-link
   and plain-fallback forms) is verified by an isolated demo during manual
   verification and recorded in the report.

## Non-goals

- **No version resolution change.** `pkgVersion()`/`pkgName()` are reused as-is;
  no new file, cache, or `package.json` read is introduced.
- **No name-prefixed or decorated stdout.** The stdout line is the bare
  installed version only — not `speclaw 0.1.4` and not the styled `ui` banner —
  so it stays scriptable. (Alternative weighed in `design.md`.) The upgrade
  suggestion is a separate, styled line on stderr.
- **No auto-upgrade.** The command *suggests* an upgrade (clickable link + the
  `speclaw update` command); it never runs the upgrade itself. A terminal click
  opens the npm page — it cannot execute a local command.
- **No `doctor`/`init` output changes.** Those commands are untouched.

## Migrations

None. No data, no schema, no config. This wires an existing pure helper to a new
command case and adds one e2e test.
