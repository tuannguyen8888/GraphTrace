# @graphtrace/shared

## 1.8.0

### Minor Changes

- Add shared coverage metadata types for query results and graph envelopes.

## 1.7.2

## 1.7.1

## 1.7.0

## 1.6.2

## 1.6.1

## 1.6.0

## 1.5.2

### Patch Changes

- Pin the generated Codex MCP server config to the repository working directory so GraphTrace resolves repo-local `.graphtrace` data correctly when tools launch MCP from outside the workspace root.

## 1.5.1

## 1.5.0

### Minor Changes

- Add end-to-end symbol execution graph support across indexing, query, MCP, server, and web UI flows.

  Improve symbol extraction for nested callbacks, wrapped route handlers, and framework-owned execution chains so real-world repos resolve stable callable symbols more reliably.

  Harden symbol investigations with confidence-aware graph summaries, bounded impact expansion, and filtering that keeps tawaco and self-host symbol graphs focused on workspace-local code.

## 1.4.0

## 1.3.0

## 1.2.0

## 1.1.0
