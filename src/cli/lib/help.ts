/**
 * The CLI's help registry: the global usage text, the one list of dispatchable
 * commands, and each command's own usage text. It lives apart from
 * `src/cli/index.ts` because that module runs `main()` on import, and it is
 * shared with the dispatcher so a command cannot ship without usage text.
 */

/** The global usage text printed by `speclaw help`, `--help`, `-h`, and no arguments. */
export const GLOBAL_HELP = `speclaw — spec-driven, agent-ready projects (Foundation + Compass + Lawbook + Cortex)

Usage: speclaw <command> [options]   (speclaw <command> --help for one command)

Install globally so the command is always available:
  npm i -g @esneiderbravo/speclaw     (or run npx @esneiderbravo/speclaw@latest init)

Setup
  init                     Interactive setup: pick agents, scaffold, index, get the prompt
                           (--minimal omits setup/lifecycle MCP tools)
  update                   Re-run itself at the latest version via npx, then apply project
                           migrations (--check reports version only; --no-self-update
                           migrates with this binary; --minimal persists minimal exposure)
  agent list               Show which agents are configured
  agent add <id>           Configure another agent later (symlinks + MCP)

Compass (code intelligence — the same surface agents use via MCP)
  index                    (Re)build the local code graph (--force / --prune / --json)
  session-start            Silent, fail-safe refresh of an existing index (SessionStart hook)
  reindex-file [paths...]  Silent re-index of edited files (PostToolUse hook; stdin JSON)
  watch                    Keep the index fresh on file changes
  explore <node>           A node's source + callers/callees
  search <query>           Hybrid find (BM25+vector+name); --focus --max-tokens --explain
  recall "<query>"         Hybrid find with concept weights; same flags as search
  impact <node>            Blast radius (grouped by module; --flat / --json)
  affected-tests           Tests affected by a change (--file / --from-diff / --json)
  diff-context             Change context for a diff (--file / --rev / --worktree / --json)
  hotspots                 Rank files by recent churn × AST complexity (--json / --sort)
  coupling <file>          Temporal co-change partners for a file (--json)
  trace <from> <to>        A call path between two nodes
  visualize [node]         Interactive HTML graph → .speclaw/graph.html

Cortex (One brain. Many agents. — multi-agent loop)
  cortex <op>              status|start|advance|rework|brief — drive harness.json (--change)

Lawbook (spec-driven workflow)
  quick <name>             Scaffold a level-0 change (record.md + reports)
  lawbook init             Create the lawbook/ workspace
  lawbook list             Active/archived changes and capabilities
  lawbook level <mode>     Propose/set/promote/explain ceremony level (--json)
  lawbook draft <name>     Scaffold a feature change (--level N, --capability C, --json)
  lawbook draft --bug <c>  Scaffold a bug change (bugfix.md + reports)
  lawbook investigate      Rank bug suspects from graph (--symptom / --stack-trace, --json)
  lawbook validate <c>     Validate a change's artifacts
  lawbook sync <c>         Promote delta specs to canonical
  lawbook archive <c>      Finalize and archive a change
  lawbook harness <op>     Deprecated alias for \`speclaw cortex\` (compat)

Other
  doctor                   Verify the installation (--json, --offline, --strict)
  budget                   Measure always-on context cost (tools, skills, instructions)
  coverage                 Requirement → impl → test coverage (--json, --tap, --adopt, --write)
  drift                    Spec↔code drift (--json, --reseal, --reverse, --fail-on)
  owners                   Compile team.owners → .github/CODEOWNERS (--write / --check / --diff)
  telemetry status         Confirm speclaw ships no telemetry
  check                    Evaluate an action against the laws (hooks call this; --dry-run to preview)
  laws verify              Verify the deterministic dependency/graph laws against the index
  laws compile             Compile laws into agent rule dialects (AGENTS / Claude / Cursor / …)
  laws import              Import third-party rules as draft laws (--from rulesync)
  laws lock                Create/refresh committed speclaw.lock digests for rule files
                           (keeps drifted strict digests; --force re-baselines, TTY only)
  laws accept <path>       Interactively accept a changed rule-file digest (TTY only)
  laws scan                Scan rule/skill files for prompt-injection patterns
  verify                   Verify laws + integrity for CI: exit codes, --sarif, --json, --strict-engines
  mcp                      Start the MCP server (used by your agent's config)
  help                     Show this help
  --version                Print the installed speclaw version
`;

/** One dispatchable command: its name, its argv aliases, and its usage text. */
export interface CommandHelp {
  /** The command name as typed after `speclaw`. */
  name: string;
  /** Other argv spellings that dispatch to the same handler. */
  aliases?: string[];
  /** Usage text; it starts with `Usage:`. */
  usage: string;
}

const SEARCH_FLAGS = `Options
  --focus <files>      Comma-separated files to boost (files you are editing)
  --max-tokens <n>     Token budget for the returned context
  --explain            Show how each result was scored
  --json               Print the result as JSON
`;

/** Usage text for `speclaw index --help`. */
const INDEX_USAGE = `Usage: speclaw index [options]

(Re)build the local Compass code graph for the current directory. Runs are
incremental: unchanged files are skipped, and an unchanged project skips the
global post-processing.

Options
  --force              Re-extract every file
  --prune              Also evict embedding-cache rows unused for --retention days
  --retention <days>   Retention window for --prune (default 30)
  --max-cache-mb <mb>  Embedding-cache size cap (default 256)
  --json               Print the index statistics as JSON
`;

// Covers: req~per-command-help~1
/**
 * Every command the CLI dispatches, with its usage text. The dispatcher in
 * `src/cli/index.ts` rejects any command missing from this list, so a new
 * command cannot ship without `--help` output.
 */
export const COMMANDS: readonly CommandHelp[] = [
  { name: "help", aliases: ["--help", "-h"], usage: GLOBAL_HELP },
  {
    name: "version",
    aliases: ["--version", "-v"],
    usage: `Usage: speclaw version   (also --version, -v)

Print the installed speclaw version as a bare string.
`,
  },
  {
    name: "mcp",
    usage: `Usage: speclaw mcp

Start the speclaw MCP server over stdio. Your agent's MCP config launches it;
you rarely run it by hand.
`,
  },
  {
    name: "init",
    usage: `Usage: speclaw init [options]

Interactive setup: pick agents, scaffold the constitution and lawbook, build the
Compass index, and print the starting prompt. Prefer
npx @esneiderbravo/speclaw@latest init so the scaffold matches the latest release.

Options
  --yes, -y               Accept the defaults without prompting
  --agents <ids>          Comma-separated agents to configure (claude, cursor, …)
  --packs <ids>           Comma-separated tool packs to install
  --project-name <name>   Project name for the templates
  --minimal               Omit setup/lifecycle MCP tools
  --no-index              Skip the initial Compass index
`,
  },
  {
    name: "update",
    usage: `Usage: speclaw update [options]

Bring this project up to date. When npm reports a newer speclaw during this run,
update re-runs itself as npx -y @esneiderbravo/speclaw@<latest> update with the
same flags and exits with its code; otherwise it applies the project migrations
with the running binary. Opt out with --no-self-update or SPECLAW_NO_SELF_UPDATE=1.

Options
  --check              Report the version status only (no re-run, no migration)
  --backup             Keep a .bak of each locally edited managed file before refreshing
  --minimal            Persist minimal MCP exposure
  --no-self-update     Never re-run at the latest version; migrate with this binary
`,
  },
  {
    name: "agent",
    usage: `Usage: speclaw agent <list|add <id>>

  list                 Show which agents are configured
  add <id>             Configure another agent (symlinks + MCP entry)
`,
  },
  { name: "index", usage: INDEX_USAGE },
  {
    name: "watch",
    usage: `Usage: speclaw watch

Keep the Compass index fresh: re-index changed files until interrupted (Ctrl-C).
`,
  },
  {
    name: "session-start",
    usage: `Usage: speclaw session-start

Silent, fail-safe refresh of an existing Compass index. The SessionStart hook
runs it; it prints nothing and never fails the session.
`,
  },
  {
    name: "reindex-file",
    usage: `Usage: speclaw reindex-file [--] <path>...
       speclaw reindex-file < hook.json

Re-index single files in an existing Compass index, silently and fail-safe.

With paths, re-indexes exactly those files now (a deleted file is removed;
paths outside the project, in skipped directories, of no indexed language, or
over the size cap are ignored). With no path, reads a PostToolUse hook payload
from stdin and re-indexes tool_input.file_path (or notebook_path) in a detached
background process, returning at once. The PostToolUse hook for
Write|Edit|MultiEdit|NotebookEdit runs it.

PageRank and docs/compass.md are left to the next full run (session start,
speclaw index, compass_index, watch). Prints nothing and always exits 0.
`,
  },
  {
    name: "explore",
    usage: `Usage: speclaw explore <node> [options]

A symbol's source plus its callers and callees.

Options
  --json               Print the result as JSON
`,
  },
  {
    name: "search",
    usage: `Usage: speclaw search <query> [options]

Hybrid find over the code graph (BM25 + vectors + name match).

${SEARCH_FLAGS}`,
  },
  {
    name: "recall",
    usage: `Usage: speclaw recall "<query>" [options]

Hybrid find with concept weights (same flags as search).

${SEARCH_FLAGS}`,
  },
  {
    name: "impact",
    usage: `Usage: speclaw impact <node> [options]

Blast radius of a symbol, grouped by module.

Options
  --flat               Flat list instead of module groups
  --depth <n>          Maximum traversal depth (default 4)
  --file <paths>       Seed from files instead of a symbol
  --json               Print the report as JSON
`,
  },
  {
    name: "trace",
    usage: `Usage: speclaw trace <from> <to> [options]

A call path between two symbols (Compass call-path query, not requirement
coverage — that is speclaw coverage).

Options
  --json               Print the path as JSON
`,
  },
  {
    name: "affected-tests",
    usage: `Usage: speclaw affected-tests [options]

Tests affected by a change, with a runnable command.

Options
  --file <paths>       Comma-separated changed files
  --from-diff <ref>    Seed from git files changed against <ref> (default main)
  --json               Print the selection as JSON
`,
  },
  {
    name: "diff-context",
    usage: `Usage: speclaw diff-context [options]

Graph context of a change: symbols, blast radius, tests, hotspots.

Options
  --file <paths>       Comma-separated changed files
  --rev <rev>          A git revision to describe
  --worktree           Use the working tree changes
  --full               Full mode instead of brief
  --json               Print the context as JSON
`,
  },
  {
    name: "hotspots",
    usage: `Usage: speclaw hotspots [options]

Rank files by recent churn × AST complexity.

Options
  --days <n>           History window in days (default 90)
  --since <date>       History start date
  --sort <key>         Sort key
  --limit <n>          Maximum rows
  --json               Print the report as JSON
`,
  },
  {
    name: "coupling",
    usage: `Usage: speclaw coupling <file> [options]

Temporal co-change partners for a file.

Options
  --days <n>           History window in days (default 90)
  --since <date>       History start date
  --min-shared <n>     Minimum shared commits
  --max-files <n>      Ignore commits touching more files than this
  --limit <n>          Maximum rows
  --json               Print the report as JSON
`,
  },
  {
    name: "visualize",
    usage: `Usage: speclaw visualize [node] [options]

Write an interactive HTML graph to .speclaw/graph.html.

Options
  --depth <n>          Neighborhood depth around <node>
  --limit <n>          Maximum nodes
  --no-open            Do not open the browser
`,
  },
  {
    name: "quick",
    usage: `Usage: speclaw quick <name> [options]

Scaffold a level-0 change (record.md + change.json + reports/).

Options
  --path <files>       Files the change touches
  --symbol <names>     Symbols the change touches
  --json               Print the scaffold as JSON
`,
  },
  {
    name: "cortex",
    usage: `Usage: speclaw cortex <status|start|advance|rework|brief> [change] [options]

Drive a change's Cortex harness (harness.json).

Options
  --change <name>      The change (or pass it as the second argument)
  --verdict <v>        PASS or FAIL (advance from reviewing/testing)
  --note <text>        A history note
  --question <text>    One open question, commas included; repeat for more
  --pause-questions    Pause the loop for open questions
  --json               Print the result as JSON
`,
  },
  {
    name: "lawbook",
    usage: `Usage: speclaw lawbook <subcommand> [options]

  init                         Create the lawbook/ workspace
  list                         Active/archived changes and capabilities
  level <mode> [change]        propose|set|promote|explain ceremony level (--level, --reason)
  draft <name>                 Scaffold a feature change (--level N, --capability C)
  draft --bug <name>           Scaffold a bug change (bugfix.md + reports)
  investigate                  Rank bug suspects (--symptom, --stack-trace, --symbol, --path)
  validate <change>            Validate a change's artifacts
  sync <change>                Promote delta specs to canonical
  archive <change>             Finalize and archive a change
  harness <op>                 Deprecated alias for speclaw cortex

Options
  --json                       Print the result as JSON
`,
  },
  {
    name: "doctor",
    usage: `Usage: speclaw doctor [options]

Verify the installation and report structured diagnostics.

Options
  --json               Print the versioned DoctorReport
  --offline            Skip network checks
  --strict             Exit non-zero on warnings
  --redact             Redact paths and secrets (default)
  --no-redact          Do not redact
`,
  },
  {
    name: "budget",
    usage: `Usage: speclaw budget [options]

Measure always-on context cost (tools, skills, instructions).

Options
  --minimal            Measure the minimal MCP profile
  --json               Print the measurement as JSON
`,
  },
  {
    name: "coverage",
    usage: `Usage: speclaw coverage [options]

Requirement → impl → test coverage.

Options
  --change <name>      Include a change's delta specs
  --json               Print the versioned coverage report
  --tap                Print TAP
  --adopt              Propose requirement ids for unidentified requirements
  --write              With --adopt, write the ids
`,
  },
  {
    name: "drift",
    usage: `Usage: speclaw drift [options]

Sealed spec↔code drift.

Options
  --capability <name>  Limit to one capability
  --fail-on <level>    Exit non-zero at this level (default semantic)
  --reverse            Report code without spec anchors
  --reseal             Photograph current bodies into the anchors
  --explain            Explain each finding
  --json               Print the versioned drift report
`,
  },
  {
    name: "telemetry",
    usage: `Usage: speclaw telemetry status

Confirm speclaw ships no telemetry.
`,
  },
  {
    name: "owners",
    usage: `Usage: speclaw owners [options]

Compile team.owners from lawbook/config.yaml into .github/CODEOWNERS.

Options
  --write              Write the managed block
  --check              Exit non-zero when the block is stale
  --diff               Show the pending change
`,
  },
  {
    name: "check",
    usage: `Usage: speclaw check [options]

Evaluate an action against the laws (agent hooks call this).

Options
  --hook-payload <f>   Read the hook payload from a file (- for stdin)
  --event <name>       The hook event
  --path <file>        The file the action touches
  --dry-run            Preview the decision without enforcing it
`,
  },
  {
    name: "laws",
    usage: `Usage: speclaw laws <subcommand> [options]

  verify                 Verify the dependency/graph laws (--engine, --law, --json)
  compile                Compile laws into agent rule dialects (--agent)
  import --from <src>    Import third-party rules as draft laws (rulesync)
  lock [--force]         Create/refresh speclaw.lock. A strict file that drifted from
                         the lock keeps its locked digest (run laws accept <path>);
                         --force lists the drifted files and, once confirmed,
                         re-baselines them (interactive TTY only; --note)
  accept <path>          Accept a changed rule-file digest (interactive TTY only; --note)
  scan                   Scan rule/skill files for prompt-injection patterns
`,
  },
  {
    name: "verify",
    usage: `Usage: speclaw verify [options]

Verify laws and rule-file integrity for CI.

Options
  --ci                 CI mode
  --engine <e>         deps, graph (comma-separated)
  --law <id>           Limit to one law
  --fail-on <level>    Exit non-zero at this severity
  --format <f>         Output format
  --sarif <file>       Write SARIF
  --json [file]        Print or write the JSON report
  --strict-engines     Exit non-zero when an engine cannot run
`,
  },
];

const BY_NAME = new Map<string, CommandHelp>();
for (const cmd of COMMANDS) {
  BY_NAME.set(cmd.name, cmd);
  for (const alias of cmd.aliases ?? []) BY_NAME.set(alias, cmd);
}

/**
 * Every argv spelling the dispatcher accepts: command names plus aliases.
 *
 * @returns The set of known command tokens.
 */
export function knownCommands(): Set<string> {
  return new Set(BY_NAME.keys());
}

/**
 * The usage text for a command or alias.
 *
 * @param cmd - The command token as typed after `speclaw`.
 * @returns The usage text, or `null` for an unknown command.
 */
export function helpFor(cmd: string): string | null {
  return BY_NAME.get(cmd)?.usage ?? null;
}

/**
 * Whether a command's arguments ask for help.
 *
 * @param args - The arguments after the command name.
 * @returns True when any argument is `--help` or `-h`.
 */
export function wantsHelp(args: readonly string[]): boolean {
  return args.some((a) => a === "--help" || a === "-h");
}
