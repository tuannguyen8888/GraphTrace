# graphtrace

GraphTrace is a local-first code graph for JavaScript, TypeScript, and PHP projects.

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
graphtrace workspace add /absolute/path/to/repo --label my-repo
```

## Help and version

Use the built-in CLI help when you or an AI agent need the current command surface:

```bash
graphtrace --help
graphtrace doctor --help
graphtrace workspace add --help
graphtrace --version
```

## Agent setup

Generate project or user-scoped MCP and instruction files for Codex, Claude Code, and Cursor:

```bash
graphtrace agent setup
```

Useful options:

- `graphtrace agent setup --dry-run`
- `graphtrace agent setup --tool codex`
- `graphtrace agent setup --tool claude`
- `graphtrace agent setup --tool cursor`
- `graphtrace agent setup --scope user`
- `graphtrace agent setup --scope user --home ~/.graphtrace-dev`

Lifecycle helpers:

- `graphtrace agent status`
- `graphtrace agent status --json`
- `graphtrace agent status --scope user`
- `graphtrace agent restore`
- `graphtrace agent restore --tool codex`
- `graphtrace agent restore --scope user`

Project scope generated files:

- Codex: `.codex/config.toml`, `.agents/skills/graphtrace/SKILL.md`
- Claude Code: `.mcp.json`, `.claude/CLAUDE.md`
- Cursor: `.cursor/mcp.json`, `.cursor/rules/graphtrace.mdc`

User scope generated files:

- Codex: `~/.codex/config.toml`, `~/.codex/skills/graphtrace/SKILL.md`
- Claude Code: `~/.claude.json`, `~/.claude/CLAUDE.md`
- Cursor: `~/.cursor/mcp.json`

The generated Codex MCP config no longer pins `cwd` to the repository root. One GraphTrace MCP entry can serve any workspace registered through `graphtrace workspace add`.

If multiple workspaces are indexed and a request is ambiguous, ask GraphTrace for `list_workspaces` first and retry with `workspaceId`.

If the target tool asks for MCP approval or trust confirmation, approve GraphTrace there after the files are generated.

`graphtrace agent restore` uses the latest setup state stored in `<repo>/.graphtrace/agent/setup-state.json` for project scope or `<graphtrace-home>/.graphtrace/agent/setup-state.json` for `--scope user`, plus backups under the matching `.graphtrace/backups/agent-setup/` directory.

`graphtrace agent setup --write-mode local` is available only for project scope, because user-scoped files are machine-level config rather than repo artifacts.

## Notes

- Supported focus for v1.0: JS/TS plus PHP projects with dynamic unit discovery
- Route discovery: Express, Fastify, Nest, Next App Router, and Laravel
- PHP coverage: Laravel routing, CrudBooster route conventions, service-object calls, and Artisan command class registration
- Query hints: Prisma, Drizzle, Eloquent-style chains, and `DB::table()` / `DB::query()` heuristics
- Storage/runtime stays local by default
