# GraphTrace Memory

## Identity

- Project name: `GraphTrace`
- GitHub repo name: `graphtrace`
- CLI binary name: `graphtrace`
- MCP server name: `graphtrace`
- Local web app title: `GraphTrace`
- Preferred npm package plan:
  - public package: `graphtrace`
  - fallback scoped package: `@graphtrace/cli`

## Product Direction

- GraphTrace is a local-first, open-source code intelligence tool for JS/TS monorepos.
- It is inspired by the product direction of Grapuco, but should be implemented independently as an OSS local tool, without copying branding, wording, code, or proprietary expression.
- Core value: free for developers to run locally, useful both for humans and coding agents.
- Recommended tagline:
  - `Local code graph, impact analysis, and agent context for JS/TS monorepos.`

## V1 Decisions

- Primary language ecosystem: TypeScript/JavaScript
- Primary repo shape: monorepo fullstack
- AI role: optional, not required for the tool to be useful
- Main surfaces:
  - CLI
  - MCP server
  - local web UI
- Product emphasis: balance both agent context and developer-facing exploration
- Required v1 feature ambition:
  - code graph
  - semantic/semantic-ish search
  - MCP context tools
  - impact analysis
  - dependency traversal
  - relatively deep data flow
  - route-to-handler-to-service-to-db exploration
- Initial quality target: works well for medium-to-large monorepos; extreme-scale repos are not the first commitment

## Architecture Direction

- Recommended architecture: `Graph-First Local Engine`
- Five major blocks:
  - Indexer
  - Local Graph Store
  - Query Engine
  - MCP Server
  - Local Web UI
- Storage direction for v1:
  - SQLite first
  - clear tables for files, symbols, edges, packages, routes, queries, and index runs
  - FTS for text search
  - embeddings as an optional later layer
- Important rule: CLI, MCP, and web UI should share one query engine and one local source of truth

