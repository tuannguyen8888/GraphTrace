# @graphtrace/server

## 1.6.0

### Patch Changes

- 053bbef: Move GraphTrace MCP to the shared workspace registry so one MCP entry can query many indexed repos from the same GraphTrace home. Existing repo-local MCP startup still works as a legacy fallback when only a local `.graphtrace/index.db` is present, but generated Codex config no longer pins the MCP server to the repository `cwd`.

  Add `graphtrace agent ... --scope user` so Codex, Claude Code, and Cursor can share one machine-level GraphTrace MCP setup instead of writing bootstrap files into every repository. Project scope stays the default, `--write-mode local` remains project-only, and user-scope restore state/backups are stored under the selected GraphTrace home.

  - @graphtrace/query-engine@1.6.0
  - @graphtrace/shared@1.6.0
  - @graphtrace/storage@1.6.0

## 1.5.2

### Patch Changes

- Pin the generated Codex MCP server config to the repository working directory so GraphTrace resolves repo-local `.graphtrace` data correctly when tools launch MCP from outside the workspace root.
- Updated dependencies
  - @graphtrace/query-engine@1.5.2
  - @graphtrace/shared@1.5.2
  - @graphtrace/storage@1.5.2

## 1.5.1

### Patch Changes

- @graphtrace/query-engine@1.5.1
- @graphtrace/shared@1.5.1
- @graphtrace/storage@1.5.1

## 1.5.0

### Minor Changes

- Add end-to-end symbol execution graph support across indexing, query, MCP, server, and web UI flows.

  Improve symbol extraction for nested callbacks, wrapped route handlers, and framework-owned execution chains so real-world repos resolve stable callable symbols more reliably.

  Harden symbol investigations with confidence-aware graph summaries, bounded impact expansion, and filtering that keeps tawaco and self-host symbol graphs focused on workspace-local code.

### Patch Changes

- Updated dependencies
  - @graphtrace/query-engine@1.5.0
  - @graphtrace/shared@1.5.0
  - @graphtrace/storage@1.5.0

## 1.4.0

### Patch Changes

- @graphtrace/query-engine@1.4.0
- @graphtrace/shared@1.4.0
- @graphtrace/storage@1.4.0

## 1.3.0

### Patch Changes

- @graphtrace/query-engine@1.3.0
- @graphtrace/shared@1.3.0
- @graphtrace/storage@1.3.0

## 1.2.0

### Patch Changes

- @graphtrace/query-engine@1.2.0
- @graphtrace/shared@1.2.0
- @graphtrace/storage@1.2.0

## 1.1.0

### Patch Changes

- @graphtrace/query-engine@1.1.0
- @graphtrace/shared@1.1.0
- @graphtrace/storage@1.1.0
