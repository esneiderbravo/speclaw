# Context budget

How speclaw measures, declares, and enforces its own always-on context cost —
tool definitions, skills/commands, and instruction files — and how it reduces
that cost with levers the MCP server actually controls (registration profiles,
short definitions, just-in-time skills, compact project map).

Authority: MCP servers cannot mark tools for deferred loading; client Tool
Search is host-controlled. This capability MUST NOT claim deferred-loading
savings.

### Requirement: Context cost measurement

speclaw SHALL measure its own context cost across tool definitions, skills and
commands, and always-on instruction files, using a deterministic estimator that
requires no network access. Tool definition cost SHALL include the tool name,
description, and the serialised JSON Schema of its input schema exactly as the
registration path exposes it to the host.

#### Scenario: Budget command reports every surface
- Given an initialised project
- When `speclaw budget --json` runs
- Then the output SHALL contain a token count for tool definitions, for skills
  and commands, and for always-on instructions
- And it SHALL contain a total that is the sum of those always-on surfaces
- And it SHALL report path-scoped rule cost separately without adding it to the
  always-on total

#### Scenario: Tool schema is included in the tool's cost
- Given two tools with identical descriptions and different input schemas
- When their definition cost is measured
- Then the tool with the larger serialised JSON Schema SHALL report the higher
  cost

#### Scenario: Estimator is deterministic
- Given the same input text
- When the estimator runs twice in different processes
- Then both runs SHALL return the same number
- And the estimator SHALL NOT perform any network request

### Requirement: Declared budget enforcement

speclaw SHALL declare its context budget in a committed `token-budget.json` and
SHALL fail its own test suite when the measured always-on total exceeds the
declared total, or when any declared per-surface ceiling is exceeded.

#### Scenario: Exceeding the budget fails the suite
- Given a declared total budget
- When the measured always-on total exceeds it
- Then the budget test SHALL fail
- And the failure message SHALL include the per-surface breakdown

#### Scenario: A single tool exceeding its cap fails at registration
- Given a tool whose definition cost or description word count exceeds the
  declared per-tool cap
- When the tool is registered through `defineTool`
- Then registration SHALL throw an error naming the tool, its cost or word
  count, and the cap

### Requirement: Tool definition discipline

Every MCP tool speclaw registers SHALL go through `defineTool`. Descriptions
SHALL be at most 25 words, SHALL state what the tool does and when to use it,
and SHALL NOT embed parameter lists, output examples, or prose that duplicates
structured annotations. speclaw SHALL NOT set or document a server-side
`defer_loading` flag.

#### Scenario: Descriptions stay within the word cap
- Given the full set of registered tools
- When each description is measured in words
- Then every description SHALL contain at most 25 words

#### Scenario: Registration rejects an oversized definition
- Given a tool spec whose estimated definition tokens exceed the per-tool cap
- When `defineTool` is invoked
- Then it SHALL throw before calling `server.registerTool`

### Requirement: Exposure profiles omit tools

speclaw SHALL support a `full` profile (default) and a `minimal` profile. The
`minimal` profile SHALL reduce context cost by **not registering** a documented
omit-set of setup and lifecycle tools. Both profiles SHALL register every tool
they expose as fully paid definitions — there is no deferred tier.

#### Scenario: Default exposure registers the full set
- Given a project without minimal mode
- When the MCP server starts
- Then all non-omitted full-profile tools SHALL be registered

#### Scenario: Minimal mode reduces the registered set
- Given a project initialised with minimal mode, or `SPECLAW_MINIMAL=1`
- When the MCP server starts
- Then tools in the omit-set SHALL NOT be registered
- And the measured tool-definition total SHALL be below the minimal-mode tool
  ceiling in `token-budget.json`

#### Scenario: Minimal mode persists across update
- Given a project whose manifest records `minimal: true`
- When the user runs `speclaw update` without `--minimal`
- Then the manifest SHALL still record minimal mode
- And the server SHALL continue to omit the omit-set

### Requirement: Just-in-time workflow loading

Workflow skills under the lawbook assets SHALL load one step at a time. The
skill entry document SHALL be a short dispatcher that references only the first
step file. Each step file except the last SHALL name exactly one successor step
file; the last SHALL state that no further steps remain. No step file SHALL
mention a step beyond its immediate successor.

#### Scenario: Skill entry point does not contain the whole workflow
- Given a workflow skill with five steps
- When its entry document is measured
- Then the entry document SHALL be under the declared dispatcher budget in
  `token-budget.json`
- And it SHALL reference only the first step file

#### Scenario: Each step names its successor
- Given a workflow skill with five step files
- When the step files are inspected
- Then each step except the last SHALL name exactly one successor step file
- And the last step SHALL state that no further steps remain
- And no step SHALL mention a step two or more hops ahead

### Requirement: Committed compact map

speclaw SHALL maintain a compact project map inside the committed, managed
`docs/compass.md` between explicit markers so an agent can read project shape
without a tool call. The map SHALL stay within its declared token budget.
`compass_index` SHALL regenerate only the content between the markers.

#### Scenario: Map is regenerated within markers
- Given a committed compass document containing the map markers
- When the index is rebuilt
- Then the content between the markers SHALL be replaced
- And content outside the markers SHALL be unchanged

#### Scenario: Map respects its token budget
- Given a project with more than 5000 indexed files
- When the map is generated
- Then its estimated token count SHALL NOT exceed the declared map budget
- And the map SHALL state that entries were omitted

#### Scenario: Missing index omits the map
- Given a project with no Compass index
- When budget or map generation runs
- Then no empty map body SHALL be written between the markers

#### Scenario: Removed markers are left alone
- Given a compass document whose map markers were deleted by the user
- When the index is rebuilt
- Then speclaw SHALL NOT insert a map
- And it SHALL report that markers are missing

### Requirement: Honest context-cost reporting in doctor

`speclaw doctor` SHALL report the active exposure profile and the measured
always-on context cost for the tools actually registered in that profile. It
SHALL NOT report a deferred-loading best case that the server cannot enforce.

#### Scenario: Doctor reports mode and cost
- Given a scaffolded project
- When `speclaw doctor` runs
- Then the output SHALL name the active profile (`full` or `minimal`)
- And it SHALL include the measured always-on context cost

### Requirement: Bounded MCP tool surface

speclaw SHALL register at most **9 canonical MCP tools** in the full exposure
profile, excluding deprecation aliases. A committed integration test SHALL fail
when the canonical count exceeds 9. Retired tool names MAY register as aliases
but SHALL NOT count toward the limit and SHALL NOT accept a query language as
input.

#### Scenario: Canonical tool count is gated
- Given a fully configured speclaw MCP server in full profile
- When the integration surface test lists registered tools
- Then the canonical tool count SHALL be at most 9
- And no canonical tool input schema SHALL accept SQL, Cypher, or free-form query
  strings

#### Scenario: Aliases are excluded from the canonical count
- Given deprecation aliases are enabled
- When the surface test runs
- Then aliases SHALL be reported separately from the canonical nine

### Requirement: Output token budget on tool responses

Every MCP tool response emitted through `text()` SHALL respect a declared output
token budget. Responses SHALL report every field shortened by that budget in a
`truncated` list with exact omitted counts and a hint to widen the request.
Total counts (callers, blast-radius nodes, tests) SHALL remain accurate even when
lists are shortened. `text()` SHALL default to the brief ceiling and SHALL accept
an explicit opt-in budget (an output mode or a token cap); the default SHALL
NOT change for callers that pass none. WHEN `compass_explore` or
`compass_diff_context` is invoked with `mode: "full"`, the system SHALL apply
the full ceiling to the emitted text, not the brief ceiling. IF the emitted
text is cut while the full ceiling or an explicit token cap is in force, THEN
the truncation hint SHALL NOT suggest `mode:"full"`.

#### Scenario: Brief mode stays within budget
- Given a symbol with hundreds of callers and a large source body
- When `compass_explore` is invoked with default brief output
- Then the estimated response tokens SHALL NOT exceed the brief ceiling

#### Scenario: Truncation is explicit
- Given a response whose caller list was shortened
- When the response is returned
- Then it SHALL contain a truncation entry naming the field and omitted count

#### Scenario: Full mode is not cut at the brief ceiling
- Given an indexed function whose source renders to more than the brief
  ceiling and less than the full ceiling
- When `compass_explore` is invoked for it with `mode: "full"` and source
  included
- Then the response text SHALL be longer than the brief ceiling
- And it SHALL NOT contain `[truncated`
- And the same SHALL hold for `compass_diff_context` with `mode: "full"` over a
  change of that size

#### Scenario: A full-mode truncation hint is truthful
- Given a text larger than the full ceiling
- When it is budgeted under `mode: "full"`
- Then the result SHALL end with a truncation marker
- And the marker SHALL NOT contain `mode:"full"`

#### Scenario: text() keeps its default
- Given a tool handler that calls `text(value)` with no budget argument
- When the value serialises to more than the brief ceiling
- Then the emitted text SHALL be cut at the brief ceiling as before

### Requirement: compass_find response fits its token cap `req~find-response-budget~1`

WHEN `compass_find` (or its deprecated aliases `compass_search` and
`compass_recall`) returns through MCP, the system SHALL emit one JSON document
whose fields are `mode`, `rendered`, `hits`, `focus`, `tokens`, and `budget`,
plus `found` and `terms` in exact mode, `nearest` when exact mode finds no
symbol, and `focusIgnored`, `degraded`, and `truncated` only when they are
non-empty or true. Each hit SHALL carry exactly `name`, `kind`, `file`, and
`line`; the MCP response SHALL NOT carry node ids, signatures, ranking signals,
or the route. The system SHALL cap the whole emitted text at `maxTokens`, or at
the brief ceiling when `maxTokens` is absent, and SHALL report that cap as
`budget`. Over the cap it SHALL remove content in this order until the text
fits: entries of `focusIgnored`, `focus`, and `terms` from the end, in that list
order; the lowest-ranked hits together with their rendered blocks; the
remaining `rendered` text; `nearest` entries from the end; and, as a last
resort, the remaining hit. A hit SHALL NOT
be removed while any of those three lists still holds an entry. A trimmed `focusIgnored`, `focus`, or `terms` list SHALL keep its
leading entries and SHALL be accompanied by `focusIgnoredTotal`, `focusTotal`,
or `termsTotal` respectively, holding its length before trimming; these count
fields SHALL be absent when their list was not trimmed. `tokens` SHALL equal the
token estimate of the whole emitted text. `truncated` SHALL be `true` only when
hits, rendered content, nearest entries, or entries of `focusIgnored`, `focus`,
or `terms` were removed to fit the cap, whether by the search fitting its
ranked candidates to the cap or by the formatter. The emitted text SHALL always
parse as JSON, SHALL NOT exceed the cap for any `maxTokens` the input schema
accepts, and SHALL NOT end with the generic truncation suffix. The
`compass_find` input schema SHALL NOT change, and the CLI `speclaw search` and
`speclaw recall` outputs, including `--json`, SHALL NOT change shape.

Needs: impl, utest
Status: approved

#### Scenario: The response fits maxTokens and stays valid JSON
- Given an indexed fixture with at least 40 functions
- When `compass_find` is invoked with a query matching many of them and
  `maxTokens` 2000, and again with `maxTokens` 8000
- Then each response text SHALL parse as JSON
- And its token estimate SHALL be at most the `maxTokens` of that call
- And its `tokens` field SHALL equal that estimate
- And it SHALL NOT contain `[truncated`

#### Scenario: Hits are compact
- Given the same fixture
- When `compass_find` is invoked
- Then every element of `hits` SHALL have exactly the keys `name`, `kind`,
  `file`, and `line`

#### Scenario: The default cap is the brief ceiling
- Given the same fixture
- When `compass_find` is invoked without `maxTokens`
- Then `budget` SHALL equal the brief ceiling
- And the response token estimate SHALL be at most the brief ceiling

#### Scenario: Truncated is reported only when content was removed to fit the cap
- Given a query whose full result fits the cap
- When `compass_find` is invoked
- Then the response SHALL NOT contain a `truncated` field
- And for a query whose result exceeds a 256-token cap, `truncated` SHALL be
  `true` and `hits` SHALL still hold at least one entry

#### Scenario: Context lists are trimmed to fit a small cap
- Given a git fixture whose working tree has about 30 modified indexed files and
  many untracked non-code files
- When `compass_find` is invoked without `focus` and with `maxTokens` 256
- Then the response text SHALL parse as JSON
- And its token estimate SHALL be at most 256 and its `tokens` field SHALL
  equal that estimate
- And it SHALL NOT contain `[truncated`
- And `truncated` SHALL be `true` and `focusTotal` SHALL hold the number of
  indexed changed files while `focus` holds fewer
- And `hits` SHALL hold more than one entry, because the context lists are cut
  before any hit
- And an exact-mode query of 60 identifiers with `maxTokens` 256 SHALL likewise
  fit, with `termsTotal` 60 and fewer entries in `terms`

#### Scenario: Aliases use the same shape
- Given deprecation aliases are enabled
- When `compass_search` is invoked
- Then its JSON body SHALL have the same fields and hit shape as `compass_find`
  in exact mode

#### Scenario: The CLI search output is unchanged
- Given an indexed fixture
- When `speclaw search <query> --json` runs
- Then its JSON SHALL keep the `HybridSearchResult` fields, including hit node
  ids and ranking signals

### Requirement: Budget tests use committed ceilings

The budget unit test SHALL load `token-budget.json` from the package root (the
same file shipped with the npm package). Tests SHALL NOT fall back to embedded
placeholder ceilings that mask regressions.

#### Scenario: Over-budget registration fails in CI
- Given measured full-profile tool definitions exceed the committed tools ceiling
- When the budget test runs against the shipped budget file
- Then the test SHALL fail with a per-surface breakdown
