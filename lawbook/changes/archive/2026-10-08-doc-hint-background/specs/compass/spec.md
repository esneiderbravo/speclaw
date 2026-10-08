# compass

Compass is speclaw's code graph, served to agents over MCP.

### Requirement: Callee chain in one call

WHEN `compass_explore` is called with `include` containing `callees` and `maxDepth` above 1, the system SHALL return the callee tree to that depth, each node with its source when `source` is included, capped per output mode.

#### Scenario: A five-hop chain reads in one call
- Given `checkout` calls `withTax`, which calls `roundCents`
- When `compass_explore checkout` runs with `include: ["source", "callees"]` and `maxDepth: 4`
- Then the result's `chain` lists `withTax` at depth 1 and `roundCents` at depth 2, with their source

#### Scenario: Depth 1 keeps the previous shape
- Given any symbol
- When `compass_explore` runs without `maxDepth`
- Then the result has no `chain`

### Requirement: Call path sources

WHEN `compass_explore` is called with `to`, the system SHALL return the symbols along the call path in `chain`.

#### Scenario: Path to a symbol
- Given `checkout` reaches `roundCents` through `withTax`
- When `compass_explore checkout` runs with `to: roundCents`
- Then `chain` lists `withTax` then `roundCents`

### Requirement: Tools load where agents need them

WHEN the MCP server lists its tools, the system SHALL mark `compass_find`, `compass_explore`, `compass_diff_context` and `lawbook_investigate` with `_meta["anthropic/alwaysLoad"]`.

#### Scenario: Code-reading tools are not deferred
- Given a client lists the speclaw tools
- When it reads `compass_explore`
- Then its `_meta` has `anthropic/alwaysLoad` set to true

### Requirement: Server instructions

WHEN a client initializes the MCP server, the system SHALL send instructions naming the tool for each job.

#### Scenario: Instructions name a tool per job
- Given a client initializes the speclaw server
- When it reads the server instructions
- Then they name `compass_explore` for reading code and `lawbook_investigate` for a failing test

### Requirement: Minimal profile keeps hook tools

WHEN the exposure profile is minimal, the system SHALL still register `speclaw_check` and `lawbook_investigate`.

#### Scenario: Hooks work in a minimal project
- Given a project initialized with `--minimal`
- When a hook calls `speclaw_check`
- Then the tool exists and answers

### Requirement: Shell reads get the Compass nudge

WHEN a Bash command reads or searches indexed code with no Compass call in the last 10 minutes, the system SHALL return the Compass-first hint as additional context.

#### Scenario: cat of a source file
- Given `src/ship.ts` is indexed code
- When the agent runs `cat src/ship.ts`
- Then the hook returns a hint naming `compass_explore ship`

#### Scenario: A quoted search pattern is suggested clean
- Given the agent runs `rg -n "noEmitOnError\" src`
- When the hook evaluates the command
- Then the hint suggests `compass_find "noEmitOnError"`

#### Scenario: A small repo stays silent
- Given the last index run recorded fewer than 40 files
- When the agent reads a source file
- Then no hint is returned

#### Scenario: A heredoc write stays silent
- Given the agent writes a file with `cat > src/new.ts <<'EOF'`
- When the hook evaluates the command
- Then no hint is returned
