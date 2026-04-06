# GraphTrace

Local-first code graph, impact analysis, and agent context for JS/TS monorepos.

## Status

GraphTrace is in active bootstrap. The current branch ships the first working vertical slice:

- workspace initialization
- local indexing
- query engine
- CLI
- MCP stdio server
- local web UI skeleton

## Principles

- local-first
- open source
- AI optional
- static analysis first
- one local source of truth

## Workspace Layout

```text
apps/web
packages/shared
packages/config
packages/storage
packages/indexer
packages/query-engine
packages/server
packages/mcp
packages/cli
fixtures/
```

## Commands

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

### CLI

```bash
pnpm --filter graphtrace exec graphtrace init
pnpm --filter graphtrace exec graphtrace index --full
pnpm --filter graphtrace exec graphtrace search listUsers
pnpm --filter graphtrace exec graphtrace routes
```
