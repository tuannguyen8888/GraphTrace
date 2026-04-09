# Symbol Execution Graph Design

Date: 2026-04-09

## Summary

GraphTrace should evolve from a file/package/route-oriented graph into a
symbol-centered execution graph for real coding work.

The target user experience is:

- choose a function or method
- see the working execution context around it
- understand callers, callees, route entrypoints, and reachable query or DB sinks
- distinguish proven relationships from inferred ones
- let AI agents consume bounded but high-value graph context instead of rereading
  large parts of the repository
- let the UI visualize symbol-level relationships without collapsing into an
  unreadable full-repo dump

The first implementation target is TypeScript and JavaScript.

## Problem

Today GraphTrace already indexes:

- packages
- files
- basic symbols
- routes
- file import edges
- query hints

That is enough for file-level triage, but it is not enough for day-to-day AI-assisted
development in real repositories.

Current gaps:

- symbol indexing is too shallow to support function or method impact analysis
- impact analysis is file-centric and mostly derived from import relationships
- MCP tools do not return a working execution context for a function or method
- the graph UI is still bounded around packages, files, and routes rather than
  symbol-level execution paths
- inferred relationships are not surfaced with explicit confidence and evidence

The practical consequence is that GraphTrace can help a user orient in a repo,
but it cannot yet answer the higher-value question:

> "If I change this function or method, what behavior, routes, services, or query
> paths might I affect?"

## Goals

- Index TypeScript and JavaScript repositories to the function and method level.
- Support a symbol graph rich enough for AI and humans to reason about change impact.
- Model both proven and inferred relationships with clear confidence and evidence.
- Return a full working context around a selected symbol, not just a neighbor list.
- Preserve GraphTrace's bounded, triage-first philosophy even when the default
  investigation depth becomes much deeper than today.
- Extend the UI so symbol-level graph exploration becomes a primary workflow.
- Keep schema and query contracts extensible to future languages.

## Non-Goals

- Building a fully precise whole-program static analyzer for all dynamic JS or TS.
- Guaranteeing perfect resolution for every reflective or runtime-generated call.
- Replacing SQLite with a dedicated graph database in this phase.
- Rendering an unbounded full-repository symbol graph by default.
- Solving other languages in the first milestone.

## User Requirement Snapshot

The user requirement for this design is:

- GraphTrace must analyze down to function and method granularity.
- AI must be able to ask what changing a function or method may affect.
- The UI graph must visualize relationships down to functions and methods.
- TypeScript and JavaScript come first.
- GraphTrace should cover:
  - callers and callees
  - route to handler to service to DB or query flow
  - export and import plus symbol references
- GraphTrace should include both proven and inferred relationships.
- Inferred relationships must expose confidence so AI and users know what to
  verify in code.
- The default experience should favor deep working context instead of a minimal
  one-hop neighborhood.
- If graph truncation is necessary, GraphTrace should preserve execution paths
  first and use confidence as a secondary priority.

## Design Principles

- Working context over isolated facts.
- Symbol-first investigation, not file-only impact.
- Proven and inferred edges must be distinguishable everywhere.
- Execution spine first when graph size forces tradeoffs.
- Bounded expansion by value, not by arbitrary one-hop limits.
- Query outputs should be directly useful to AI agents and the web UI.
- The architecture should support future language frontends without changing the
  core graph model.

## Core Model

GraphTrace should move to a layered heterogeneous graph.

### Node Types

GraphTrace should support these node types:

- `workspace`
- `repository`
- `package`
- `file`
- `symbol`
- `route`
- `query_sink`
- `db_sink`

`symbol` is the primary node type for this design.

### Symbol Coverage

For TypeScript and JavaScript, symbol extraction should include:

- function declarations
- class methods
- object literal methods
- variable-assigned function expressions
- variable-assigned arrow functions
- route handlers and middleware
- nested local functions with meaningful scope
- anonymous callbacks when they play an execution role
- React hook callbacks and event-like inline handlers when there is a stable
  binding site

This means GraphTrace should not limit itself to clean exported symbols.

### Symbol Identity

The current symbol ID shape is too weak for multiple anonymous or similarly named
functions in one file.

GraphTrace should move to a more stable symbol identity model:

- file path
- owner path or lexical parent path
- symbol kind
- span-derived ordinal or stable structural index

The purpose is:

- distinguish multiple callbacks in the same file
- preserve identity across incremental indexing where possible
- let UI and AI refocus a symbol after refresh without brittle lookup logic

## Edge Model

GraphTrace should retain generic edge storage but expand the graph vocabulary.

### Required Edge Types

- `contains`
- `imports`
- `exports`
- `references`
- `calls`
- `implements_flow`
- `handles_route`
- `invokes_query`
- `invokes_db`
- `framework_link`

### Semantics

- `contains` models hierarchy such as repository to package to file to symbol
- `imports` models file-level import relationships
- `exports` models exposed file or module API surfaces
- `references` captures non-call symbol usage
- `calls` captures execution-level invocation relationships
- `implements_flow` and `handles_route` connect routes and middleware chains to
  symbols
- `invokes_query` and `invokes_db` connect symbols to storage or query sinks
- `framework_link` captures framework-specific semantic bridges that are not
  plain calls, such as controller or hook wiring

## Confidence and Evidence Model

Every relationship that is not fully proven must carry explicit confidence.

### Confidence Tiers

- `proven`
- `inferred-strong`
- `inferred-weak`

### Confidence Requirements

Each edge should expose:

- numeric `confidence`
- categorical `confidence_label`
- `provenance.kind`
- `provenance.extractor`
- `provenance.evidence`
- optional `provenance.notes`

The goal is not just to score an edge but to explain why the edge exists.

### Product Behavior

- MCP responses must expose confidence and provenance.
- The web UI must visually distinguish proven and inferred edges.
- Impact or execution summaries must not flatten weak inferred edges into facts.

## Query Contract

The existing list-style query results are not enough for symbol-level work.
GraphTrace should define a subgraph-oriented response envelope.

### Graph Envelope

Symbol-level graph queries should return:

- `focus`
- `nodes`
- `edges`
- `clusters`
- `confidence_summary`
- `coverage_summary`
- `truncation`
- `suggested_next_hops`

### Why This Shape

This envelope gives both AI and UI enough structure to:

- render a graph
- understand what was included
- understand what may be missing
- expand from the current frontier
- judge whether the graph is reliable enough for decision support

## Query Surfaces

### New Core Queries

- `get_symbol`
- `search_symbols`
- `get_symbol_neighbors`
- `get_symbol_impact`
- `get_execution_context`
- `get_route_execution_graph`
- `explain_edge`
- `expand_subgraph`

### Execution Context

`get_execution_context` is the most important new query.

For a selected function or method, it should return a deep but bounded working
context that can include:

- direct and transitive callers
- direct and transitive callees
- route entrypoints
- middleware or controller handoffs
- reachable query or DB sinks
- file and package containment context
- confidence and truncation summaries

### Impact Semantics

`get_symbol_impact` should not be a file-import proxy.

It should classify impact into:

- direct callers
- transitive callers
- route entrypoints
- reachable sinks
- referencing files
- touched packages
- high-risk inferred edges

## MCP Contract

GraphTrace's MCP surface should become symbol-oriented rather than file-oriented.

### Proposed Tool Set

- `graphtrace_search_symbols`
- `graphtrace_get_symbol`
- `graphtrace_get_execution_context`
- `graphtrace_get_symbol_impact`
- `graphtrace_get_route_flow`
- `graphtrace_explain_edge`
- `graphtrace_expand_graph`
- `graphtrace_get_workspace_overview`

### Locator Support

Tools should accept practical symbol locators such as:

- `symbol_id`
- `file + line + column`
- `file + symbol name`
- `package + file + exported name`
- route-based entrypoints
- text search queries

### Token Efficiency

GraphTrace should support response tiers:

- `summary`
- `working`
- `full`

Recommended defaults:

- MCP uses `working`
- UI uses `full`
- CLI allows explicit choice

## Storage Design

GraphTrace can retain SQLite and the existing storage package, but the schema must
be expanded.

### Schema Changes

Extend or add storage for:

- richer `symbols`
- `symbol_spans` or equivalent span metadata
- richer `edges`
- `edge_evidence`
- optional graph materialization metadata for incremental indexing

### Schema Requirements

Symbols should carry:

- stable ID
- kind
- display name
- canonical name when available
- file ID
- owner symbol ID when nested
- span
- exported flag
- async and static flags where relevant
- signature text or normalized signature metadata
- framework role hints

Edges should carry:

- source and target IDs and kinds
- edge type
- confidence
- confidence label
- metadata and provenance

### Backward Compatibility

Existing file, package, route, and import-based features should continue to work.
The new symbol graph becomes the richer substrate underneath them rather than a
separate product.

## TypeScript and JavaScript Indexing Pipeline

The TS and JS frontend should be implemented as a staged extraction pipeline.

### Stage 1: Program Setup

- load `tsconfig` or project references where available
- build a TypeScript Program per relevant workspace unit or package
- fall back to AST-first indexing when full type information is not available
- persist file-level context such as tsconfig scope, alias maps, and module mode

### Stage 2: Symbol Extraction

Extract callable symbols and relevant semantic roles.

Capture:

- declarations
- methods
- object members
- variable-bound callables
- callbacks
- route handlers
- framework callbacks

### Stage 3: Reference and Call Resolution

Resolve:

- direct identifier references
- symbol calls
- import and export links
- member calls where type or owner information is available
- framework registration and wrapper patterns through enrichers and heuristics

### Stage 4: Execution Flow Extraction

Build paths such as:

- route to handler
- middleware to handler
- controller to service
- service to query or DB sink
- component or hook callback to service or API boundary where supported

### Stage 5: Context Stitching

Connect symbol graph layers back to:

- file containment
- package containment
- repository scope
- route nodes
- query and DB sink nodes

### Stage 6: Incremental Reindexing

When files change, GraphTrace should:

- delete symbol and edge artifacts for affected files
- reindex changed files
- selectively re-resolve dependent files when export surfaces changed
- preserve unaffected graph artifacts

## Rollout Strategy for TS and JS

Even though the product ambition is high, implementation should still roll out in
phases without painting the architecture into a corner.

### Phase A: Symbol Graph Foundation

- deep symbol extraction
- direct call edges
- import and export symbol links
- route to handler edges
- basic query or DB sink linking

### Phase B: Execution Context

- stronger member and wrapper resolution
- richer route or service or sink flows
- confidence and provenance surfacing
- symbol impact queries

### Phase C: Real-World Coverage

- framework-specific enrichers
- callback-heavy patterns
- React, Express, Fastify, and Nest coverage improvements
- denser graph UX hardening

Schema and query contracts should be designed up front for all phases.

## UI Design

The current Graph v2 work provides a strong interaction foundation, but symbol-level
work needs an additional graph mode and state model.

### Graph Modes

GraphTrace should provide:

- `Architecture`
- `Execution`
- `Impact`
- `Reference`

Recommended default behavior:

- package or repository entry opens `Architecture`
- selecting a symbol opens `Execution`

### Entry Points

Users should be able to enter symbol graph mode from:

- search
- route detail
- file or package inspector
- impact panels
- file plus line deep links

### Inspector Responsibilities

The inspector should answer:

- what symbol is selected
- who calls it
- what it calls
- which routes reach it
- which query or DB sinks are reachable
- which edges are weak and need human verification
- what the next likely focus actions are

### Canvas Behavior

The graph canvas must support:

- pan and zoom
- drag
- fit selection
- fullscreen
- graph-local search
- focus promotion
- branch expansion
- explicit display of truncated branches

### Visual Encoding

The UI should distinguish:

- node kind
- edge type
- execution spine
- confidence level
- selected versus contextual relationships

Weak inferred edges should remain visible but visually subdued.

## Boundedness and Truncation Strategy

The user requirement is to avoid unnecessary cutting and prefer deep context by
default.

GraphTrace should therefore use budget-aware graph shaping instead of shallow
default depth limits.

### Budget Model

Graph shaping should consider:

- node budget
- edge budget
- layout budget
- response tier budget

### Truncation Priority

If truncation becomes necessary, keep in order:

1. execution spine
2. proven edges
3. inferred-strong edges
4. inferred-weak and lower-value reference branches

### User Experience

When branches are hidden, the system should surface expandable placeholders such as:

- additional callers
- additional callees
- additional weak inferred branches

This preserves the "deep by default" spirit while keeping the graph usable.

## Verification Strategy

This initiative needs stronger verification than the current file-level graph.

### Verification Layers

- fixture repositories with known graph assertions
- self-host validation on GraphTrace
- real-world validation on tawaco
- golden graph assertions for selected symbols

### Assertions to Cover

- expected direct callers
- expected direct callees
- expected route entrypoints
- expected reachable query or DB sinks
- expected confidence bands for heuristic edges

### Performance Verification

Track:

- indexing time
- incremental indexing cost
- query response size
- query latency
- graph UI rendering performance for dense symbol neighborhoods

## Architecture Options Considered

### Option A: Call Graph First

Pros:

- smallest technical step
- easiest to validate early

Cons:

- still weak for full working context
- AI must reconstruct route and sink context elsewhere

### Option B: Execution Graph First

Pros:

- maps most directly to the real user task
- better immediate value for AI and humans

Cons:

- bigger implementation jump
- requires earlier design of heterogeneous graph semantics

### Option C: Hybrid Layered Graph

Pros:

- best long-term architecture
- keeps call, reference, and execution layers conceptually clean
- supports future languages and new graph views

Cons:

- largest up-front design burden

### Recommendation

Choose Option C as the architecture and execute it in an execution-driven order
closer to Option B.

In practice this means:

- build a layered graph substrate
- prioritize execution-context queries first
- keep file and package graph views as consumers of the richer graph

## Milestones

### Milestone A: Symbol Graph Foundation

- schema expansion
- TS and JS symbol extraction
- direct calls and references
- basic symbol-aware search and retrieval

### Milestone B: Execution Context and Impact

- execution path stitching
- route and sink traversal
- confidence-aware impact queries
- symbol graph UI modes

### Milestone C: Real-World Coverage and Hardening

- richer framework enrichers
- callback-heavy pattern coverage
- self-host and tawaco hardening
- token-efficient MCP defaults and documentation updates

## Open Questions for Implementation Planning

- which framework enrichers should be first-class in milestone A versus B
- whether edge evidence lives inline in `edges` or in a separate normalized table
- how aggressive incremental invalidation should be across exported surface changes
- what exact symbol ID strategy is stable enough without overfitting to TypeScript AST
- whether UI graph expansion should prefetch adjacent branches or load them lazily

## Conclusion

GraphTrace should become a symbol-centered, execution-aware graph system for
TypeScript and JavaScript repositories.

The key product change is not merely "more symbols." The key change is that
GraphTrace should answer function-level engineering questions with a usable working
context:

- where execution comes from
- where it goes next
- what storage or query paths it can reach
- which parts are proven
- which parts are inferred and need verification

That is the level required for GraphTrace to become a practical AI companion for
real development work rather than a lightweight architecture viewer.
