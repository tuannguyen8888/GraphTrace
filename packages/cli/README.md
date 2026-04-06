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
graphtrace search listUsers --kind symbol
graphtrace routes
graphtrace web --port 4310
graphtrace mcp
```

## Notes

- Supported focus for v1.0: JS/TS projects with dynamic unit discovery
- Route discovery: Express, Fastify, Nest, Next App Router
- Query hints: Prisma and Drizzle heuristics
- Storage/runtime stays local by default
