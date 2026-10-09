# tool-surface

Which MCP tools speclaw registers. Agents choose among every listed tool, so
the surface holds only the canonical tools; each job has one name.

### Requirement: Only canonical tools register

The system SHALL register exactly the canonical MCP tools (`compass_explore`, `compass_find`, `compass_diff_context`, `compass_index`, `cortex`, `lawbook_change`, `lawbook_investigate`, `speclaw_setup`, `speclaw_check`) in the full profile, and no retired name.

#### Scenario: Full profile
- Given the full exposure profile
- When the MCP server lists its tools
- Then the list equals the nine canonical tools

#### Scenario: Retired names stay unregistered
- Given any profile
- When the server registers its modules
- Then none of `compass_search`, `compass_recall`, `compass_impact`, `compass_trace`, `compass_affected_tests`, `compass_hotspots`, `compass_coupling`, `compass_watch`, `lawbook_init`, `lawbook_list`, `lawbook_validate`, `lawbook_sync`, `lawbook_archive`, `lawbook_level`, `lawbook_coverage`, `lawbook_drift`, `init_project`, `configure_agent`, `list_packs` or `add_pack` is registered

### Requirement: Cortex is the only coordination entry

The system SHALL drive the Cortex harness only through the `cortex` MCP tool and the `speclaw cortex` command; `lawbook_change` SHALL reject action `harness`.

#### Scenario: Harness through lawbook_change
- Given a drafted change
- When `lawbook_change` is called with action `harness`
- Then the call fails schema validation

### Requirement: Doctor names retired references

WHEN a project's agent files (`CLAUDE.md`, `AGENTS.md`, `LAWS.md`, `docs/compass.md`, rules, `ai-specs/skills`, `ai-specs/agents`) name a retired tool, `speclaw doctor` SHALL warn with each file and the canonical replacement.

#### Scenario: A stale skill
- Given `ai-specs/skills/archive/SKILL.md` naming `lawbook_archive`
- When doctor scans the project
- Then it reports the file with the replacement `lawbook_change (action: "archive")`
