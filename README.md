# GraphTrace

[![CI](https://github.com/tuannguyen8888/GraphTrace/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/tuannguyen8888/GraphTrace/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/graphtrace.svg)](https://www.npmjs.com/package/graphtrace)
[![GitHub Release](https://img.shields.io/github/v/release/tuannguyen8888/GraphTrace)](https://github.com/tuannguyen8888/GraphTrace/releases)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

GraphTrace is a local-first code graph for JavaScript and TypeScript projects.

It indexes code into a local SQLite graph store, then exposes the same query layer through:

- a CLI for engineers
- an MCP server for coding agents
- a local web UI for inspection

The goal is simple: make a codebase easier to understand, safer to change, and easier to query without shipping source code to a remote service by default.

## What You Can Use Today

GraphTrace now supports JS/TS projects with automatic unit discovery.

Current capabilities include:

- workspace initialization and health checks
- automatic unit discovery across flat repos, monorepos, and mixed project roots
- full and incremental indexing into a local SQLite-backed graph store
- foreground watch mode with stale cleanup on add, change, and delete
- search, dependency tracing, impact analysis, route flow, and workspace status
- route discovery for Express, Fastify, Nest, and Next App Router
- query hints for Prisma and Drizzle patterns
- MCP tools for search, deps, impact, flow, status, routes, packages, and reindex
- local HTTP API plus an inspection-focused web UI
- published npm CLI package plus GitHub release notes for tagged versions

## Install

### Use from npm

```bash
npm i -g graphtrace
```

The public package is available on npm as [`graphtrace`](https://www.npmjs.com/package/graphtrace). Tagged release notes live in [GitHub Releases](https://github.com/tuannguyen8888/GraphTrace/releases).

Or run ad hoc:

```bash
npx graphtrace doctor
pnpm dlx graphtrace doctor
```

### Work on this repo

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:smoke
```

## Quick Start

Initialize GraphTrace in a workspace:

```bash
graphtrace init
```

Build the local index:

```bash
graphtrace index --full
graphtrace index --full --explain
```

Check workspace/index state:

```bash
graphtrace status
graphtrace status --json
graphtrace doctor --units
graphtrace doctor --plugins
```

Run incremental watch mode:

```bash
graphtrace watch --json --debounce-ms 250
```

Search the indexed graph:

```bash
graphtrace search listUsers --kind symbol
graphtrace routes
graphtrace deps apps/api/src/routes/users.ts --direction out --depth 2
graphtrace impact apps/api/src/services/user-service.ts --depth 4
graphtrace flow "GET /users"
```

Start the local web UI:

```bash
graphtrace web --port 4310
```

Start the MCP server:

```bash
graphtrace mcp
```

## Why Teams Use It

GraphTrace is designed to help with:

- impact analysis before changing a file or service
- dependency tracing across packages and modules
- route discovery and route-to-code flow inspection
- local code search across symbols, files, packages, and routes
- providing structured context to AI agents through MCP
- powering internal tooling from one graph/query backend instead of separate ad hoc scripts

## Architecture

GraphTrace uses a graph-first local architecture:

1. Source code is indexed into a local SQLite graph store.
2. One query engine reads that graph and answers search, dependency, impact, flow, route, and status questions.
3. The CLI, MCP server, local API server, and web UI all sit on top of the same local data model.

For more detail, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repository Layout

```text
apps/web              Local UI
packages/cli          Public CLI package
packages/config       Workspace configuration
packages/indexer      Source indexing
packages/mcp          MCP server
packages/query-engine Query layer
packages/server       Local HTTP API
packages/shared       Shared types
packages/storage      SQLite-backed graph store
fixtures/             Test workspaces
```

## Design Principles

- local-first by default
- open source
- AI optional
- static analysis first
- one local source of truth

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)
- [Releases](https://github.com/tuannguyen8888/GraphTrace/releases)
- [SECURITY.md](SECURITY.md)
- [SUPPORT.md](SUPPORT.md)

## Contributing

GraphTrace uses `main` as the stable branch for open source collaboration.

- open pull requests against `main`
- keep feature work on topic branches
- run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:smoke` before opening a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## Support

- Use GitHub Discussions for questions and design discussion
- Use Issues for bugs and feature requests
- Use the security policy for responsible vulnerability reporting

See [SUPPORT.md](SUPPORT.md) and [SECURITY.md](SECURITY.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
