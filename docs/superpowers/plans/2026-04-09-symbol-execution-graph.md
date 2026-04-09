# Symbol Execution Graph Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build GraphTrace's TypeScript and JavaScript symbol execution graph end-to-end so AI and the web UI can inspect function and method callers, callees, route-to-handler-to-sink flow, and confidence-aware impact.

**Architecture:** Extend the current SQLite-backed graph into a layered heterogeneous graph with richer symbol and edge metadata, then phase execution from graph substrate to symbol queries to symbol-first UI. Keep file and package graph features working by treating them as views over the richer graph instead of building a separate backend.

**Tech Stack:** TypeScript, SQLite, Vitest, MCP SDK, React, Vite, `@xyflow/react`, existing GraphTrace packages

---

## Scope Strategy

This is a master plan that covers milestones A, B, and C from the approved design
spec. Execution should still stop for review after each chunk:

- Chunk 1 = Milestone A: Symbol Graph Foundation
- Chunk 2 = Milestone B: Execution Context and Impact
- Chunk 3 = Milestone C: Real-World Coverage and Hardening

Do not attempt to land all chunks in one commit or one unreviewed burst. Each task
below ends with a commit step on purpose.

## File Map

### Existing files to modify

- `packages/shared/src/index.ts`
  - shared graph types, query envelopes, confidence metadata, and symbol shapes
- `packages/storage/src/index.ts`
  - schema, row mapping, graph store CRUD, graph traversal, and query primitives
- `packages/storage/test/storage.test.ts`
  - storage schema and traversal tests
- `packages/indexer/src/index.ts`
  - workspace indexing entrypoint and orchestration
- `packages/indexer/src/workspace.ts`
  - workspace and unit inspection context used by the indexer
- `packages/indexer/test/indexer.test.ts`
  - fixture-level indexing tests
- `packages/query-engine/src/index.ts`
  - query engine surface for CLI, server, and MCP consumers
- `packages/query-engine/test/query-engine.test.ts`
  - query behavior tests
- `packages/mcp/src/index.ts`
  - MCP tool registration and payload shaping
- `packages/mcp/test/mcp.test.ts`
  - MCP tool coverage tests
- `apps/web/src/App.tsx`
  - top-level web state and graph mode routing
- `apps/web/src/graph-workspace.tsx`
  - graph renderer wiring and interactions
- `apps/web/src/architecture-graph.ts`
  - bounded graph shaping and layout helpers
- `apps/web/src/view-model.ts`
  - workspace and inspector state helpers
- `apps/web/src/api-client.ts`
  - fetch helpers for new symbol graph endpoints
- `apps/web/src/i18n.ts`
  - UI copy for symbol graph modes and confidence messaging
- `apps/web/src/app.css`
  - graph workspace and inspector styling
- `packages/server/src/index.ts`
  - HTTP routes that serve UI data
- `packages/server/test/server.test.ts`
  - API endpoint tests
- `packages/server/test/architecture-graph.test.ts`
  - graph shaping and layout tests
- `packages/server/test/web-ui.test.ts`
  - UI state and text assertions

### New files to create

- `packages/indexer/src/symbol-graph-types.ts`
  - TS and JS symbol extraction result types and confidence helpers
- `packages/indexer/src/extract-symbols.ts`
  - callable symbol extraction and stable identity helpers
- `packages/indexer/src/extract-references.ts`
  - reference and call edge extraction
- `packages/indexer/src/extract-execution-flow.ts`
  - route, middleware, controller, and sink stitching helpers
- `packages/query-engine/test/symbol-query.test.ts`
  - symbol-focused query tests
- `apps/web/src/symbol-graph-types.ts`
  - graph mode and node or edge semantics for symbol graph UI
- `apps/web/src/symbol-graph-view-model.ts`
  - symbol execution, impact, and reference graph derivation
- `apps/web/src/symbol-graph-inspector.tsx`
  - symbol-specific inspector
- `apps/web/src/symbol-graph-controls.tsx`
  - graph mode, confidence, and expansion controls
- `packages/server/test/symbol-graph.test.ts`
  - server-level symbol graph API and view-model tests
- `fixtures/symbol-graph-workspace/`
  - focused TS/JS fixture for direct calls, callbacks, and route-to-sink flow
- `fixtures/react-callback-workspace/`
  - fixture for React callback and hook binding coverage

### Docs to update later in execution

- `docs/architecture-graph-renderer.md`
  - renderer and graph semantics notes after symbol graph work lands
- `.agents/skills/graphtrace/SKILL.md`
  - agent guidance for symbol-level queries and confidence usage

## Chunk 1: Milestone A - Symbol Graph Foundation

### Task 1: Add shared symbol graph types and confidence metadata

**Files:**
- Modify: `packages/shared/src/index.ts`
- Test: `packages/storage/test/storage.test.ts`
- Test: `packages/query-engine/test/query-engine.test.ts`

- [ ] **Step 1: Write failing tests for symbol graph shapes**

Add assertions covering:
- symbol metadata includes span and owner context
- graph edges can carry `confidence`, `confidenceLabel`, and provenance
- query responses can return a graph envelope instead of only `items`

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/storage/test/storage.test.ts packages/query-engine/test/query-engine.test.ts`
Expected: FAIL because shared symbol graph types and confidence fields do not exist yet

- [ ] **Step 3: Extend shared types minimally**

Add or extend shared types for:
- `GraphNodeKind`
- `GraphEdgeType`
- `GraphConfidenceLabel`
- `SymbolDescriptor`
- `GraphEdgeDescriptor`
- `GraphEnvelope`
- symbol locator inputs for `symbol_id`, `file + line + column`, and `file + symbol name`

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/storage/test/storage.test.ts packages/query-engine/test/query-engine.test.ts`
Expected: PASS for new type-shape assertions

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts packages/storage/test/storage.test.ts packages/query-engine/test/query-engine.test.ts
git commit -m "Add shared symbol graph types"
```

### Task 2: Expand storage schema for symbol spans, evidence, and typed edges

**Files:**
- Modify: `packages/storage/src/index.ts`
- Modify: `packages/storage/test/storage.test.ts`

- [ ] **Step 1: Write failing storage tests for symbol graph persistence**

Add tests covering:
- symbols persist owner IDs, line or column spans, signature text, and framework role
- edges persist confidence labels and provenance evidence
- graph store can round-trip a symbol-level edge

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/storage/test/storage.test.ts`
Expected: FAIL because current schema only stores shallow symbol and edge fields

- [ ] **Step 3: Implement schema and CRUD changes**

Update `packages/storage/src/index.ts` to:
- migrate `symbols` to richer metadata
- migrate `edges` to richer confidence metadata
- add `edge_evidence` storage if inline metadata becomes too noisy
- add helpers such as `upsertSymbolEdge`, `symbolById`, and `symbolNeighbors`

Keep file and route storage behavior backward-compatible.

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/storage/test/storage.test.ts`
Expected: PASS for symbol persistence and traversal assertions

- [ ] **Step 5: Commit**

```bash
git add packages/storage/src/index.ts packages/storage/test/storage.test.ts
git commit -m "Expand graph storage for symbol metadata"
```

### Task 3: Extract stable callable symbols for TS and JS

**Files:**
- Create: `packages/indexer/src/symbol-graph-types.ts`
- Create: `packages/indexer/src/extract-symbols.ts`
- Modify: `packages/indexer/src/index.ts`
- Modify: `packages/indexer/test/indexer.test.ts`
- Create: `fixtures/symbol-graph-workspace/`

- [ ] **Step 1: Write failing indexer tests for callable symbol coverage**

Add fixture assertions for:
- function declarations
- class methods
- object literal methods
- variable-assigned arrow functions
- inline route handlers with stable IDs

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/indexer/test/indexer.test.ts`
Expected: FAIL because the current symbol extractor does not cover all callable shapes or stable IDs

- [ ] **Step 3: Implement symbol extraction helpers**

Create `extract-symbols.ts` to:
- walk TS and JS ASTs
- assign stable symbol IDs
- compute owner relationships and spans
- classify symbol kind and framework role where obvious

Wire `packages/indexer/src/index.ts` to use the new extractor.

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/indexer/test/indexer.test.ts`
Expected: PASS for callable symbol coverage and stable identity checks

- [ ] **Step 5: Commit**

```bash
git add packages/indexer/src/symbol-graph-types.ts packages/indexer/src/extract-symbols.ts packages/indexer/src/index.ts packages/indexer/test/indexer.test.ts fixtures/symbol-graph-workspace
git commit -m "Extract stable callable symbols for ts and js"
```

### Task 4: Add direct call and reference edge extraction

**Files:**
- Create: `packages/indexer/src/extract-references.ts`
- Modify: `packages/indexer/src/index.ts`
- Modify: `packages/indexer/test/indexer.test.ts`
- Modify: `packages/storage/test/storage.test.ts`

- [ ] **Step 1: Write failing tests for direct call and reference edges**

Add assertions covering:
- direct identifier-based calls produce `calls` edges
- non-call usages produce `references` edges
- import-resolved symbol usage across files is captured when statically resolvable

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/indexer/test/indexer.test.ts packages/storage/test/storage.test.ts`
Expected: FAIL because symbol-level call and reference edges are not stored yet

- [ ] **Step 3: Implement minimal direct resolution**

Create `extract-references.ts` to:
- resolve direct identifier references via the TypeScript checker when possible
- classify each resolved relationship as `calls` or `references`
- attach `proven` confidence when resolution is direct

Persist these edges through the storage layer.

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/indexer/test/indexer.test.ts packages/storage/test/storage.test.ts`
Expected: PASS for direct call and reference graph assertions

- [ ] **Step 5: Commit**

```bash
git add packages/indexer/src/extract-references.ts packages/indexer/src/index.ts packages/indexer/test/indexer.test.ts packages/storage/test/storage.test.ts
git commit -m "Add direct symbol call and reference edges"
```

### Task 5: Expose basic symbol search and retrieval through query engine and MCP

**Files:**
- Modify: `packages/query-engine/src/index.ts`
- Create: `packages/query-engine/test/symbol-query.test.ts`
- Modify: `packages/mcp/src/index.ts`
- Modify: `packages/mcp/test/mcp.test.ts`

- [ ] **Step 1: Write failing tests for symbol search and get-symbol APIs**

Add tests covering:
- searching symbols by name
- resolving symbols by locator
- returning a symbol graph envelope with zero-hop context

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/query-engine/test/symbol-query.test.ts packages/mcp/test/mcp.test.ts`
Expected: FAIL because symbol-first query APIs and MCP tools do not exist yet

- [ ] **Step 3: Implement minimal symbol query surface**

Add:
- `searchSymbols`
- `getSymbol`
- `getSymbolNeighbors`

Add MCP tools:
- `graphtrace_search_symbols`
- `graphtrace_get_symbol`

Keep existing file-centric tools working.

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/query-engine/test/symbol-query.test.ts packages/mcp/test/mcp.test.ts`
Expected: PASS for basic symbol query coverage

- [ ] **Step 5: Commit**

```bash
git add packages/query-engine/src/index.ts packages/query-engine/test/symbol-query.test.ts packages/mcp/src/index.ts packages/mcp/test/mcp.test.ts
git commit -m "Expose symbol search and retrieval APIs"
```

## Chunk 2: Milestone B - Execution Context and Impact

### Task 6: Add route-to-handler-to-sink execution stitching

**Files:**
- Create: `packages/indexer/src/extract-execution-flow.ts`
- Modify: `packages/indexer/src/index.ts`
- Modify: `packages/indexer/test/indexer.test.ts`
- Modify: `fixtures/symbol-graph-workspace/`

- [ ] **Step 1: Write failing tests for execution flow edges**

Add assertions covering:
- route to handler edges
- handler to service calls
- service to query or DB sink edges
- middleware or wrapper handoff edges when statically recognizable

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/indexer/test/indexer.test.ts`
Expected: FAIL because execution flow stitching beyond route discovery is incomplete

- [ ] **Step 3: Implement execution flow extractor**

Create `extract-execution-flow.ts` to:
- connect routes to handlers and middleware
- mark framework bridge edges such as controller wiring
- connect symbols to query or DB sinks
- emit `proven` or `inferred-strong` confidence with provenance

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/indexer/test/indexer.test.ts`
Expected: PASS for route-to-sink execution path assertions

- [ ] **Step 5: Commit**

```bash
git add packages/indexer/src/extract-execution-flow.ts packages/indexer/src/index.ts packages/indexer/test/indexer.test.ts fixtures/symbol-graph-workspace
git commit -m "Add symbol execution flow stitching"
```

### Task 7: Implement symbol impact and execution-context queries

**Files:**
- Modify: `packages/storage/src/index.ts`
- Modify: `packages/query-engine/src/index.ts`
- Modify: `packages/query-engine/test/symbol-query.test.ts`
- Modify: `packages/storage/test/storage.test.ts`

- [ ] **Step 1: Write failing tests for execution-context and impact queries**

Add tests covering:
- direct and transitive callers
- reachable callees and sinks
- route entrypoints
- truncation metadata when graph budgets are exceeded

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/query-engine/test/symbol-query.test.ts packages/storage/test/storage.test.ts`
Expected: FAIL because symbol impact and execution graph traversals do not exist yet

- [ ] **Step 3: Implement graph envelope queries**

Add store and query-engine methods for:
- `executionContextFromSymbol`
- `impactFromSymbol`
- `explainEdge`
- graph envelope summaries for confidence, coverage, and truncation

Preserve execution-spine-first truncation behavior.

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/query-engine/test/symbol-query.test.ts packages/storage/test/storage.test.ts`
Expected: PASS for symbol execution and impact graph assertions

- [ ] **Step 5: Commit**

```bash
git add packages/storage/src/index.ts packages/query-engine/src/index.ts packages/query-engine/test/symbol-query.test.ts packages/storage/test/storage.test.ts
git commit -m "Add symbol execution context and impact queries"
```

### Task 8: Expand MCP and server APIs for symbol graph work

**Files:**
- Modify: `packages/mcp/src/index.ts`
- Modify: `packages/mcp/test/mcp.test.ts`
- Modify: `packages/server/src/index.ts`
- Modify: `packages/server/test/server.test.ts`
- Create: `packages/server/test/symbol-graph.test.ts`

- [ ] **Step 1: Write failing tests for symbol graph API endpoints and tools**

Add coverage for:
- `graphtrace_get_execution_context`
- `graphtrace_get_symbol_impact`
- `graphtrace_explain_edge`
- HTTP endpoints returning symbol graph envelopes

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/mcp/test/mcp.test.ts packages/server/test/server.test.ts packages/server/test/symbol-graph.test.ts`
Expected: FAIL because symbol graph APIs and payload contracts are missing

- [ ] **Step 3: Implement symbol graph API surfaces**

Add MCP tools and server endpoints for:
- symbol search and lookup
- execution graph retrieval
- impact retrieval
- edge explanation

Use response tiers so MCP defaults to `working` while server endpoints can serve `full`.

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/mcp/test/mcp.test.ts packages/server/test/server.test.ts packages/server/test/symbol-graph.test.ts`
Expected: PASS for symbol graph tool and API coverage

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/index.ts packages/mcp/test/mcp.test.ts packages/server/src/index.ts packages/server/test/server.test.ts packages/server/test/symbol-graph.test.ts
git commit -m "Expose symbol graph APIs for mcp and server"
```

### Task 9: Add symbol-first graph modes to the web UI

**Files:**
- Create: `apps/web/src/symbol-graph-types.ts`
- Create: `apps/web/src/symbol-graph-view-model.ts`
- Create: `apps/web/src/symbol-graph-controls.tsx`
- Create: `apps/web/src/symbol-graph-inspector.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/graph-workspace.tsx`
- Modify: `apps/web/src/api-client.ts`
- Modify: `apps/web/src/i18n.ts`
- Modify: `apps/web/src/app.css`
- Modify: `packages/server/test/web-ui.test.ts`
- Modify: `packages/server/test/architecture-graph.test.ts`

- [ ] **Step 1: Write failing tests for symbol graph modes**

Add assertions covering:
- `Execution`, `Impact`, and `Reference` mode labels
- symbol focus state
- graph-local confidence filters
- inspector sections for callers, callees, routes, and sinks

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/server/test/web-ui.test.ts packages/server/test/architecture-graph.test.ts`
Expected: FAIL because symbol graph state and rendering modes do not exist yet

- [ ] **Step 3: Implement minimal symbol graph UI shell**

Add:
- symbol graph mode state
- symbol graph API fetches
- execution graph rendering over the existing XYFlow canvas
- symbol inspector with next-hop actions

Keep architecture mode intact and make symbol graph an additional path, not a replacement.

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/server/test/web-ui.test.ts packages/server/test/architecture-graph.test.ts`
Expected: PASS for symbol mode and inspector assertions

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/symbol-graph-types.ts apps/web/src/symbol-graph-view-model.ts apps/web/src/symbol-graph-controls.tsx apps/web/src/symbol-graph-inspector.tsx apps/web/src/App.tsx apps/web/src/graph-workspace.tsx apps/web/src/api-client.ts apps/web/src/i18n.ts apps/web/src/app.css packages/server/test/web-ui.test.ts packages/server/test/architecture-graph.test.ts
git commit -m "Add symbol graph modes to the web ui"
```

### Task 10: Add confidence-aware rendering, branch expansion, and impact drill-down

**Files:**
- Modify: `apps/web/src/symbol-graph-view-model.ts`
- Modify: `apps/web/src/symbol-graph-controls.tsx`
- Modify: `apps/web/src/symbol-graph-inspector.tsx`
- Modify: `apps/web/src/graph-workspace.tsx`
- Modify: `apps/web/src/app.css`
- Modify: `packages/server/test/web-ui.test.ts`

- [ ] **Step 1: Write failing tests for confidence rendering and expansion**

Add assertions covering:
- proven versus inferred visual treatment
- expansion placeholders for truncated branches
- inspector warnings for weak-confidence edges
- impact mode switching from the selected symbol

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/server/test/web-ui.test.ts`
Expected: FAIL because confidence-aware graph rendering and branch expansion are missing

- [ ] **Step 3: Implement graph usability behavior**

Add:
- confidence badges or edge styling
- execution-spine-first truncation placeholders
- expand-callers, expand-callees, and show-weaker-edges actions
- impact drill-down from the selected symbol

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/server/test/web-ui.test.ts`
Expected: PASS for confidence and expansion behavior

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/symbol-graph-view-model.ts apps/web/src/symbol-graph-controls.tsx apps/web/src/symbol-graph-inspector.tsx apps/web/src/graph-workspace.tsx apps/web/src/app.css packages/server/test/web-ui.test.ts
git commit -m "Improve symbol graph confidence and expansion ux"
```

## Chunk 3: Milestone C - Real-World Coverage and Hardening

### Task 11: Add framework enrichers and callback-heavy coverage

**Files:**
- Modify: `packages/indexer/src/extract-symbols.ts`
- Modify: `packages/indexer/src/extract-references.ts`
- Modify: `packages/indexer/src/extract-execution-flow.ts`
- Modify: `packages/indexer/test/indexer.test.ts`
- Create: `fixtures/react-callback-workspace/`

- [ ] **Step 1: Write failing tests for hard cases**

Add assertions covering:
- React hook callbacks
- inline middleware wrappers
- object-member dispatch with resolvable ownership
- controller or service wiring in Nest-style code

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/indexer/test/indexer.test.ts`
Expected: FAIL because callback-heavy and framework-specific patterns are not yet covered well enough

- [ ] **Step 3: Implement focused enrichers**

Extend the indexer with:
- callback naming and ownership heuristics
- framework link extraction
- stronger inferred confidence classes with provenance evidence

Avoid speculative weak edges when there is no actionable evidence.

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/indexer/test/indexer.test.ts`
Expected: PASS for callback-heavy fixture assertions

- [ ] **Step 5: Commit**

```bash
git add packages/indexer/src/extract-symbols.ts packages/indexer/src/extract-references.ts packages/indexer/src/extract-execution-flow.ts packages/indexer/test/indexer.test.ts fixtures/react-callback-workspace
git commit -m "Improve callback and framework symbol coverage"
```

### Task 12: Validate on self-host and tawaco with performance budgets

**Files:**
- Modify: `packages/query-engine/test/symbol-query.test.ts`
- Modify: `packages/server/test/symbol-graph.test.ts`
- Modify: `packages/server/test/web-ui.test.ts`
- Modify: `docs/architecture-graph-renderer.md`

- [ ] **Step 1: Add verification tests and manual checklists**

Add tests or documented assertions for:
- GraphTrace self-host function-level paths
- tawaco symbol execution context lookups
- graph response size and latency expectations
- UI smoke flows for search, focus, expansion, and fullscreen

- [ ] **Step 2: Run automated tests to verify baseline failures or gaps**

Run: `pnpm test packages/query-engine/test/symbol-query.test.ts packages/server/test/symbol-graph.test.ts packages/server/test/web-ui.test.ts`
Expected: Some new assertions fail or require implementation details from prior tasks to be tuned

- [ ] **Step 3: Tune budgets and graph shaping**

Adjust:
- node and edge budgets
- truncation summaries
- response tier defaults
- UI graph shaping for dense neighborhoods

Document the final renderer and semantics behavior in `docs/architecture-graph-renderer.md`.

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/query-engine/test/symbol-query.test.ts packages/server/test/symbol-graph.test.ts packages/server/test/web-ui.test.ts`
Expected: PASS with stable self-host and tawaco-oriented assertions

- [ ] **Step 5: Commit**

```bash
git add packages/query-engine/test/symbol-query.test.ts packages/server/test/symbol-graph.test.ts packages/server/test/web-ui.test.ts docs/architecture-graph-renderer.md
git commit -m "Harden symbol graph on self host and tawaco"
```

### Task 13: Update docs and agent guidance for symbol graph workflows

**Files:**
- Modify: `.agents/skills/graphtrace/SKILL.md`
- Modify: `packages/mcp/CHANGELOG.md`
- Modify: `packages/query-engine/CHANGELOG.md`
- Modify: `apps/web/CHANGELOG.md`

- [ ] **Step 1: Write failing review checklist for agent guidance**

Create a short checklist in the implementation branch notes covering:
- when agents should use `graphtrace_get_execution_context`
- how agents should treat inferred edges
- how to fall back to code reads when confidence is low

- [ ] **Step 2: Review current docs and confirm they are missing the new workflow**

Run: `rg -n "execution_context|confidence|inferred" .agents/skills/graphtrace/SKILL.md packages/mcp/CHANGELOG.md packages/query-engine/CHANGELOG.md apps/web/CHANGELOG.md`
Expected: Missing or incomplete references to the new symbol graph workflow

- [ ] **Step 3: Update docs and guidance**

Document:
- symbol graph MCP tools
- confidence-aware usage
- UI graph modes and expectations
- recommended agent behavior for low-confidence edges

- [ ] **Step 4: Sanity-check docs and changelog consistency**

Run: `pnpm lint`
Expected: PASS or no docs-related issues

- [ ] **Step 5: Commit**

```bash
git add .agents/skills/graphtrace/SKILL.md packages/mcp/CHANGELOG.md packages/query-engine/CHANGELOG.md apps/web/CHANGELOG.md
git commit -m "Document symbol execution graph workflows"
```

## Review Gates

After Chunk 1:

- symbol extraction and direct call graph are reliable on fixtures
- search and retrieval work for symbol locators
- schema changes do not break file-level queries

After Chunk 2:

- a selected function or method can return an execution context
- MCP and HTTP APIs expose confidence-aware graph envelopes
- the UI can render `Execution`, `Impact`, and `Reference` views

After Chunk 3:

- self-host GraphTrace and tawaco produce useful symbol-level investigations
- confidence and truncation behavior are understandable in UI and MCP
- docs and agent guidance are aligned with the new workflow

## Recommended Execution Order

1. Complete Chunk 1 and validate the substrate before any UI work.
2. Complete Chunk 2 and verify the symbol graph is actually useful through MCP first, then UI.
3. Complete Chunk 3 and use self-host plus tawaco as the final usefulness bar.

## Final Verification

Before claiming the full initiative complete, run:

```bash
pnpm test packages/storage/test/storage.test.ts packages/indexer/test/indexer.test.ts packages/query-engine/test/query-engine.test.ts packages/query-engine/test/symbol-query.test.ts packages/mcp/test/mcp.test.ts packages/server/test/server.test.ts packages/server/test/symbol-graph.test.ts packages/server/test/architecture-graph.test.ts packages/server/test/web-ui.test.ts
pnpm lint
pnpm build
```

Expected:

- all targeted tests pass
- lint passes
- build passes
- GraphTrace self-host and tawaco manual checks match the chunk 3 review gates
