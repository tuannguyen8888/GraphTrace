# graphtrace

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
