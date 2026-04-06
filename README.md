# GraphTrace

[![CI](https://github.com/tuannguyen8888/GraphTrace/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/tuannguyen8888/GraphTrace/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

GraphTrace is a local-first code graph for JavaScript and TypeScript monorepos.

It indexes your codebase into a local graph store, then exposes one query layer to three surfaces:

- a CLI for engineers
- an MCP server for coding agents
- a local web UI for inspection

The goal is simple: make a codebase easier to understand, safer to change, and easier to query without shipping your source code to a remote service by default.

## Why GraphTrace Exists

Modern monorepos are difficult to reason about because the information you need is split across files, frameworks, packages, routes, imports, and conventions.

When a team asks questions like:

- "If I change this service, what breaks?"
- "Which route reaches this file?"
- "What depends on this package?"
- "How do I give an AI agent useful context without handing it the whole repo?"

the answers are usually slow, manual, and inconsistent.

GraphTrace is built to turn those questions into local queries against one source of truth.

## Who GraphTrace Is For

GraphTrace is intended for teams working in JS/TS codebases, especially monorepos, who need both human-readable and machine-readable understanding of their system.

Typical users include:

- application engineers doing refactors, reviews, and incident analysis
- platform and architecture teams who need dependency and route visibility
- engineering managers or tech leads who want safer change planning
- AI-assisted development workflows that need scoped, local context through MCP instead of broad repo dumps

## What Problems It Solves

GraphTrace is designed to help with:

- impact analysis before changing a file or service
- dependency tracing across packages and modules
- route discovery and route-to-code flow inspection
- local code search across symbols, files, packages, and routes
- providing structured context to AI agents through MCP
- powering internal tooling from one graph/query backend instead of separate ad hoc scripts

## How Teams Use It

### 1. Change Planning

Before editing a file, engineers ask GraphTrace which routes, files, and dependencies are likely to be affected.

### 2. Codebase Navigation

Instead of grepping blindly through a large monorepo, teams search symbols, packages, or routes from one local interface.

### 3. AI Context Delivery

An agent can call the MCP server to fetch targeted context such as routes, dependency edges, or impact results without reading the entire repository.

### 4. Local Exploration

Teams can expose the same indexed graph to the CLI, API server, and local web UI without introducing a hosted backend as a requirement.

## Core Capabilities

Today, GraphTrace focuses on a graph-first local engine and a thin set of interfaces on top of it.

Current capabilities include:

- workspace initialization
- local indexing into a SQLite-backed graph store
- queries for search, dependencies, impact analysis, and route flow
- a CLI entry point
- an MCP stdio server
- a local HTTP server and web UI skeleton

## Product Shape

GraphTrace is not just an AI integration and it is not just a developer CLI.

It is a shared local graph/query layer that can serve:

- humans through terminal and UI workflows
- automation through APIs
- coding agents through MCP

That is why the project is positioned as a hybrid developer tool plus agent context engine.

## Architecture

GraphTrace currently uses a graph-first local architecture:

1. Source code is indexed into a local SQLite graph store.
2. One query engine reads that graph and answers search, dependency, impact, and flow questions.
3. The CLI, MCP server, local API server, and web UI all sit on top of the same local data model.

This architecture keeps the system local-first, composable, and AI-optional.

For more detail, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Current Status

GraphTrace is in active bootstrap, not a finished platform.

What is real today:

- local indexing
- package, symbol, file, and route discovery
- dependency and impact queries
- MCP tool exposure
- local web UI foundation

What is still evolving:

- broader framework coverage
- production hardening
- richer graph semantics
- optional embeddings and semantic retrieval

See [docs/ROADMAP.md](docs/ROADMAP.md) for the current sequence.

## Quick Start

### Requirements

- Node.js 22 or newer within the supported range declared in `package.json`
- `pnpm`

### Install

```bash
pnpm install
```

### Verify the workspace

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## CLI Examples

Initialize GraphTrace in a workspace:

```bash
pnpm --filter graphtrace exec graphtrace init
```

Build or refresh the local index:

```bash
pnpm --filter graphtrace exec graphtrace index --full
```

Search the indexed graph:

```bash
pnpm --filter graphtrace exec graphtrace search listUsers
```

List discovered routes:

```bash
pnpm --filter graphtrace exec graphtrace routes
```

## Repository Layout

```text
apps/web              Local UI
packages/cli          CLI surface
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
- [SECURITY.md](SECURITY.md)
- [SUPPORT.md](SUPPORT.md)

## Contributing

GraphTrace uses `main` as the stable branch for open source collaboration.

- open pull requests against `main`
- keep feature work on topic branches
- run `pnpm lint`, `pnpm typecheck`, and `pnpm test` before opening a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## Support

- Use GitHub Discussions for questions and design discussion
- Use Issues for bugs and feature requests
- Use the security policy for responsible vulnerability reporting

See [SUPPORT.md](SUPPORT.md) and [SECURITY.md](SECURITY.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
