# graphtrace

## 1.6.0

### Minor Changes

- 053bbef: Move GraphTrace MCP to the shared workspace registry so one MCP entry can query many indexed repos from the same GraphTrace home. Existing repo-local MCP startup still works as a legacy fallback when only a local `.graphtrace/index.db` is present, but generated Codex config no longer pins the MCP server to the repository `cwd`.

  Add `graphtrace agent ... --scope user` so Codex, Claude Code, and Cursor can share one machine-level GraphTrace MCP setup instead of writing bootstrap files into every repository. Project scope stays the default, `--write-mode local` remains project-only, and user-scope restore state/backups are stored under the selected GraphTrace home.

## 1.5.2

### Patch Changes

- Pin the generated Codex MCP server config to the repository working directory so GraphTrace resolves repo-local `.graphtrace` data correctly when tools launch MCP from outside the workspace root.

## 1.5.1

### Patch Changes

- 874e515: Add first-class `--help` and `--version` support to the GraphTrace CLI, including contextual help for nested commands such as `agent` and `workspace`.

  Improve CLI self-discovery for AI agents with stable help sections, actionable unknown-command guidance, and lazy-loaded runtime modules so top-level help and version output stay clean.

## 1.5.0

### Minor Changes

- Add end-to-end symbol execution graph support across indexing, query, MCP, server, and web UI flows.

  Improve symbol extraction for nested callbacks, wrapped route handlers, and framework-owned execution chains so real-world repos resolve stable callable symbols more reliably.

  Harden symbol investigations with confidence-aware graph summaries, bounded impact expansion, and filtering that keeps tawaco and self-host symbol graphs focused on workspace-local code.

## 1.4.0

### Minor Changes

- 4069150: Improve GraphTrace self-hosting with a stronger multi-workspace daemon flow, more reliable workspace registry concurrency, safer package artifacts, and first-pass UI localization for English and Vietnamese.

## 1.3.0

### Minor Changes

- Improve the self-host experience with repository-scoped browsing, repo-first triage, a guided search workbench, and an interactive architecture graph workspace.

## 1.2.0

### Minor Changes

- Improve self-host reliability and investigation workflows across GraphTrace.

  - avoid SQLITE busy errors during concurrent query access
  - resolve internal workspace package dependencies more reliably on the GraphTrace repo
  - add safer local-only agent bootstrap behavior and richer generated Codex GraphTrace guidance
  - upgrade the self-host web UI with better triage controls, deeper inspector drill-down, and a bounded architecture graph view

## 1.1.0

### Minor Changes

- 6b6e40f: Add project-local AI agent bootstrap lifecycle commands for Codex, Claude Code, and Cursor, including setup, status, JSON status output, restore, and tool-scoped restore. Refresh the README to emphasize code-change safety, blast-radius analysis, and structured AI context as the main reasons to use GraphTrace.

## 1.0.0

### Major Changes

- Move GraphTrace to automatic JS/TS project discovery with unit-aware indexing, internal pluginized framework/query extraction, dynamic watch roots, and synchronized workspace versioning.

## 0.1.1

### Patch Changes

- c522a0e: Stabilize GraphTrace into a usable local alpha with real watch mode, richer framework coverage, inspection UI improvements, workspace status surfaces, and a smoke-tested npm package artifact.
