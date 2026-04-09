# graphtrace

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
