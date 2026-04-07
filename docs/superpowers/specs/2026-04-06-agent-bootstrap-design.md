# GraphTrace Agent Bootstrap Design

Date: 2026-04-06
Status: Draft for review

## Context

GraphTrace already exposes a local MCP server for coding agents through `graphtrace mcp`.

The missing piece is bootstrap:

- detect which coding tools are installed on the machine
- configure those tools to load GraphTrace as an MCP server
- add GraphTrace-specific guidance so agents use the MCP tools intentionally
- keep setup low-friction, repeatable, and token-efficient

The first supported tools are:

- Codex
- Claude Code
- Cursor

## Goal

Add a dedicated CLI workflow that generates and reconciles supported tool config for the current repository so GraphTrace can be used immediately after setup, with only any unavoidable native approval step left to the developer.

## Non-Goals

- global machine-wide mutation by default across every repository
- support for unsupported or unofficial third-party agent tools in v1
- dynamic remote skill marketplaces in v1
- automatic indexing daemons outside the current workspace in v1

## Key Decision

Although the product intent started as "modify the real tool configs on the machine", the official docs for Codex, Claude Code, and Cursor all support native project-scoped configuration for MCP and instructions.

GraphTrace v1 should therefore bootstrap only project-local files inside the current repository, not mutate user-scoped config outside the repo.

Why:

- it matches the native configuration model of all three tools
- it avoids polluting unrelated repositories
- it is easier to review, back up, and version
- it reduces the chance of breaking an existing personal setup

README guidance can cover any remaining native approval or import step that must still happen in the tool UI.

We can add optional `--scope user` later for teams that explicitly want global installation.

## User Experience

New command:

```bash
graphtrace agent setup
```

Proposed flags:

- `--dry-run`
- `--force`
- `--tool codex`
- `--tool claude`
- `--tool cursor`
- `--json`

High-level behavior:

1. Detect installed tools on the machine.
2. Decide which project-local target files should exist for the current repository.
3. Show a preview of the planned changes.
4. Back up any repo files that will be mutated.
5. Apply idempotent config updates inside the repository only.
6. Report what was configured, skipped, already up to date, or still needs approval in the target tool.

## Native Targets by Tool

GraphTrace should write project-local files for all supported tools, even though the actual tool may not be installed yet. This keeps the repository bootstrap deterministic and shareable across teams.

### Codex

Use project-scoped Codex config and project-local skills:

- `.codex/config.toml`
- `.agents/skills/graphtrace/`

Bootstrap behavior:

- register GraphTrace MCP in `.codex/config.toml`
- write a GraphTrace skill that teaches when and how to use GraphTrace tools
- avoid rewriting root `AGENTS.md` unless the user explicitly asks for it
- leave any Codex-side skill discovery or trust flow to the native tool behavior

Rationale:

- Codex natively supports MCP server config in `config.toml`
- Codex natively supports repository instructions through `AGENTS.md`
- Codex natively supports reusable local skills under `.agents/skills`
- local skill injection is cleaner than appending large GraphTrace-specific blocks into the repo's existing `AGENTS.md`

### Claude Code

Use project-scoped MCP and project-scoped Claude memory:

- `.mcp.json`
- `.claude/CLAUDE.md`

Bootstrap behavior:

- register GraphTrace MCP in `.mcp.json`
- write GraphTrace usage guidance into `.claude/CLAUDE.md`
- preserve any existing file content by merging or appending within a managed block
- leave any Claude-side trust or approval step to the native tool behavior

Rationale:

- Claude Code officially supports project-scoped MCP config
- Claude Code officially supports project-scoped memory/instructions through `CLAUDE.md`
- project scope is safer than modifying user-level Claude settings by default

### Cursor

Use project-scoped Cursor MCP config and Cursor rules:

- `.cursor/mcp.json`
- `.cursor/rules/graphtrace.mdc`

Bootstrap behavior:

- register GraphTrace MCP in `.cursor/mcp.json`
- create a dedicated Cursor rule for GraphTrace tool usage
- keep the rule focused on tool selection and token discipline rather than broad engineering policy
- leave MCP approval to Cursor's native flow

Rationale:

- Cursor officially supports MCP config in `.cursor/mcp.json`
- Cursor officially supports project rules in `.cursor/rules`
- Cursor also recognizes simple root instruction files, but rules are the richer and more precise mechanism

## GraphTrace Instruction Model

GraphTrace should install two instruction layers.

### 1. Core guidance

Shared semantic policy across all tools:

- use GraphTrace when the task is about understanding repository structure, symbols, dependencies, routes, package relationships, or impact
- prefer narrow queries before broad scans
- check status before reindexing
- reindex only when the workspace is stale or the requested facts are missing
- do not dump large raw outputs into the conversation when a summary is enough

### 2. Tool-specific guidance

Adapt the core guidance to each tool's native mechanism:

- Codex skill content with clear tool mapping and agent behavior
- Claude Code memory content optimized for Claude's project memory model
- Cursor rule content optimized for Cursor's rule engine and project rule format

## Recommended Tool Mapping

Core mapping to include in all installed instructions:

- symbol or code lookup -> `search_code`, `get_symbol_context`
- dependency tracing -> `get_dependencies`
- change risk or blast radius -> `get_impact_analysis`
- route or request flow -> `get_routes`, `get_data_flow`
- workspace health -> `get_status`
- stale or missing graph data -> `run_index`

## Idempotency and Safety

GraphTrace must treat setup as a repeatable reconciliation process.

Rules:

- never duplicate the GraphTrace MCP entry
- never duplicate the GraphTrace managed instruction block
- preserve user-owned config outside GraphTrace-managed sections
- create timestamped backups before mutation
- report parse failures clearly instead of partially overwriting files

Managed block pattern:

- use explicit begin/end markers in instruction files
- use semantic merge for JSON/TOML MCP configs instead of string append

## Detection Strategy

Tool detection should combine:

- known executable presence on `PATH`
- ability to write the project-scoped target files

Detection is advisory in v1:

- it informs the preview output
- it does not block generating project-local files for supported tools

Initial executable hints:

- `codex`
- `claude`
- `cursor`
- `cursor-agent`

Detection result should classify each tool as:

- `available`
- `not_installed`
- `unsupported_version`
- `detected_but_unconfigurable`

## Data Model

Proposed internal shape:

- `DetectedAgentTool`
  - `id`
  - `displayName`
  - `installed`
  - `executablePath?`
  - `supported`
  - `targets`
- `BootstrapTarget`
  - `path`
  - `kind`
  - `exists`
  - `mutable`
- `BootstrapAction`
  - `toolId`
  - `targetPath`
  - `action`
  - `status`
  - `details`

## Implementation Notes

### MCP registration

Prefer stdio launch for local GraphTrace:

- command: `graphtrace`
- args: `["mcp"]`

This keeps the setup portable across tools and avoids hard-coding repo-relative Node entrypoints.

### Instruction ownership

GraphTrace should own only its own blocks/files:

- whole-file ownership is acceptable for new generated files such as `.cursor/rules/graphtrace.mdc`
- partial-file ownership is required when touching shared files such as `.claude/CLAUDE.md`

### Output

`graphtrace agent setup` should print:

- detected tools
- files created or updated
- backups created
- skipped tools with reasons
- next steps when manual intervention is required, such as native MCP approval in the tool UI

## README Changes

Add a new section:

- explain supported tools
- explain project-scoped setup behavior
- show `graphtrace agent setup`
- show `graphtrace agent setup --dry-run`
- describe how GraphTrace guidance improves tool choice and token efficiency
- include any remaining per-tool approval step after files are generated

## Open Questions

- should `Claude Code` setup prefer `.claude/CLAUDE.md` only, or fall back to root `CLAUDE.md` when that is already the team convention?
- should `Codex` setup optionally append a short pointer into existing `AGENTS.md` so the GraphTrace skill is more discoverable?
- should `Cursor` setup auto-approve the GraphTrace MCP after writing `.cursor/mcp.json`, or leave approval to the user/UI?

## References

- OpenAI Codex docs: [MCP servers](https://developers.openai.com/codex/mcp), [Config](https://developers.openai.com/codex/config), [AGENTS.md](https://developers.openai.com/codex/agents-md), [Skills](https://developers.openai.com/codex/skills)
- Anthropic Claude Code docs: [MCP](https://docs.anthropic.com/en/docs/claude-code/mcp), [Memory](https://docs.anthropic.com/en/docs/claude-code/memory), [Settings](https://docs.anthropic.com/en/docs/claude-code/settings)
- Cursor docs: [MCP](https://docs.cursor.com/en/context/mcp), [Rules](https://docs.cursor.com/en/context/rules)
