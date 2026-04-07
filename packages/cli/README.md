# graphtrace

GraphTrace is a local-first code graph for JavaScript and TypeScript projects.

It builds a local SQLite-backed graph, then exposes the same data through:

- a CLI for engineers
- an MCP server for coding agents
- a local web UI for inspection

## Install

```bash
npm i -g graphtrace
```

The published package lives at [npmjs.com/package/graphtrace](https://www.npmjs.com/package/graphtrace). Tagged release notes live in [GitHub Releases](https://github.com/tuannguyen8888/GraphTrace/releases).

Or run without installing:

```bash
npx graphtrace doctor
pnpm dlx graphtrace doctor
```

## Quick start

```bash
graphtrace init
graphtrace index --full
graphtrace index --full --explain
graphtrace status
graphtrace doctor --units
graphtrace doctor --plugins
graphtrace agent setup
graphtrace agent setup --dry-run
graphtrace agent status
graphtrace agent status --json
graphtrace agent restore
graphtrace agent restore --tool codex
graphtrace search listUsers --kind symbol
graphtrace routes
graphtrace web --port 4310
graphtrace mcp
```

## Agent setup

Generate project-local MCP and instruction files for Codex, Claude Code, and Cursor:

```bash
graphtrace agent setup
```

Useful options:

- `graphtrace agent setup --dry-run`
- `graphtrace agent setup --tool codex`
- `graphtrace agent setup --tool claude`
- `graphtrace agent setup --tool cursor`

Lifecycle helpers:

- `graphtrace agent status`
- `graphtrace agent status --json`
- `graphtrace agent restore`
- `graphtrace agent restore --tool codex`

Generated files:

- Codex: `.codex/config.toml`, `.agents/skills/graphtrace/SKILL.md`
- Claude Code: `.mcp.json`, `.claude/CLAUDE.md`
- Cursor: `.cursor/mcp.json`, `.cursor/rules/graphtrace.mdc`

If the target tool asks for MCP approval or trust confirmation, approve GraphTrace there after the files are generated.

`graphtrace agent restore` uses the latest setup state stored in `.graphtrace/agent/setup-state.json` plus any backups under `.graphtrace/backups/agent-setup/`.

## Notes

- Supported focus for v1.0: JS/TS projects with dynamic unit discovery
- Route discovery: Express, Fastify, Nest, Next App Router
- Query hints: Prisma and Drizzle heuristics
- Storage/runtime stays local by default
