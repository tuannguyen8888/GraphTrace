# graphtrace

GraphTrace is a local-first code graph for JavaScript and TypeScript monorepos.

It builds a local SQLite-backed graph, then exposes the same data through:

- a CLI for engineers
- an MCP server for coding agents
- a local web UI for inspection

## Install

```bash
npm i -g graphtrace
```

Or run without installing:

```bash
npx graphtrace doctor
pnpm dlx graphtrace doctor
```

## Quick start

```bash
graphtrace init
graphtrace index --full
graphtrace status
graphtrace search listUsers --kind symbol
graphtrace routes
graphtrace web --port 4310
graphtrace mcp
```

## Notes

- Supported focus for v0.1: JS/TS monorepos
- Route discovery: Express, Fastify, Nest, Next App Router
- Query hints: Prisma and Drizzle heuristics
- Storage/runtime stays local by default
