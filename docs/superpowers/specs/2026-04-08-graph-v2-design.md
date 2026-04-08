# GraphTrace Graph v2 Design

Date: 2026-04-08

## Summary

GraphTrace should evolve its architecture graph from a bounded preview panel into a
graph-first investigation workspace.

The target user experience is:

- graph is a primary view, not a secondary widget
- search is a first-class action in the graph workspace
- users can move between overview, focused, and flow-based graph modes
- the canvas remains readable on self-host repositories
- graph state, filters, and inspector work together as one triage loop

This design is informed by what we can reasonably learn from Grapuco's graph UX:

- large central canvas
- explicit filters and graph modes
- visible graph-local search
- strong node and edge semantics
- readability over raw graph volume

GraphTrace should not copy Grapuco's visual style directly. The goal is to apply the
interaction and information design lessons to GraphTrace's local-first triage workflow.

## Problem

The current GraphTrace graph view is useful as a proof of concept, but it is still too
close to a bounded side panel and not yet strong enough as a primary investigation tool.

Current weaknesses:

- graph still feels secondary to the surrounding panels
- users often land in an empty graph state and need to guess the first useful action
- node density becomes hard to read on self-host repositories
- graph controls are still relatively light compared with the complexity of the data
- graph semantics are present, but not yet visually decisive enough for fast triage
- there is no strong separation between overview-level structure and focused drill-down

The practical consequence is that users can inspect the graph, but they are not yet
naturally guided into using it as the main tool for navigation and triage.

## Goals

- Make the graph a primary investigation surface in the web UI.
- Keep GraphTrace's bounded-graph philosophy while making the output more readable.
- Support fast graph entry through search and starter entrypoints.
- Separate overview-level structure from focused drill-down modes.
- Improve graph readability through clustering, layout strategy, and strong edge/node
  semantics.
- Keep the graph useful on both self-host GraphTrace and smaller repos such as tawaco.
- Preserve GraphTrace's local-first triage workflow:
  - inspect route
  - inspect file/package
  - inspect deps/impact/flow
  - open file or copy command

## Non-Goals

- Rendering a full unbounded graph of every symbol in a repository.
- Replacing the existing query engine with a dedicated graph database.
- Building a collaborative or multi-user graph editor.
- Copying Grapuco's branding, page chrome, or overall visual identity.
- Solving every graph layout case through renderer changes alone.

## Design Principles

- Readability over completeness.
- Focused subgraphs over raw graph dumps.
- Search and starter entrypoints over empty canvas states.
- Stable semantic encoding over decorative visuals.
- Cluster first, node second.
- Keep the graph useful for triage, not just for screenshots.

## User Questions the Graph Must Answer

Graph v2 should help users answer these questions quickly:

1. Where should I start investigating?
2. What is directly connected to this route, file, or package?
3. If I move one step deeper, which node should become the next focus?
4. Which relationships matter here:
   - flow
   - dependency
   - impact
   - containment
5. How does this area fit into the larger repository structure?

## Architecture Options Considered

### Option A: Keep the current graph as a bounded subpanel and polish visuals only

Pros:

- smallest implementation
- low migration risk

Cons:

- preserves the current mental model where graph is secondary
- does not solve empty-state entry, layout semantics, or overview/focus separation
- likely to produce incremental improvements without changing product usefulness

### Option B: Add a graph-first workspace with bounded graph modes

Pros:

- keeps the bounded GraphTrace philosophy
- creates a stronger graph exploration loop
- allows clear separation between overview and focused drill-down
- supports phased implementation without rewriting the backend

Cons:

- requires a clearer UI state model
- requires a dedicated graph view-model layer
- layout and clustering logic become more important

### Option C: Move to a full repository-wide graph explorer

Pros:

- visually impressive
- maximally flexible in theory

Cons:

- very high noise on real repos
- difficult to keep readable
- expensive to compute and render well
- conflicts with GraphTrace's triage-first product shape

### Recommendation

Choose Option B:

- graph-first workspace
- bounded graph modes
- strong graph semantics
- explicit search, filters, inspector, and focus transitions

## Information Architecture

Graph v2 should use a stable 3-column layout:

- left rail: graph controls
- center: graph canvas
- right rail: inspector

### Left Rail: Graph Controls

Contents:

- repository scope
- package scope
- node type filters
- edge type filters
- graph mode selector
- legend
- control hints

This rail should answer:

- what am I looking at
- what is hidden
- what kinds of relationships are currently visible

### Center: Graph Canvas

Contents:

- top search bar
- graph toolbar
- canvas
- contextual overlays such as starter graph or focus breadcrumbs

Primary actions:

- search
- fit view
- reset view
- fullscreen
- refocus on selected node

The canvas should always feel like the visual center of the page.

### Right Rail: Inspector

Contents:

- selected node summary
- related nodes grouped by relationship type
- quick actions
- focus promotion actions
- open file / copy command actions

The inspector should answer:

- what is selected
- why it matters
- where to go next

## Primary User Flows

### Flow 1: Enter Graph From a Workspace

1. User enters a workspace.
2. User sees a meaningful overview graph or starter subgraph.
3. User does not start from a blank canvas.
4. User can immediately search or click a recommended entrypoint.

### Flow 2: Focus and Drill Down

1. User selects a route, file, or package.
2. Graph switches into focused mode around that node.
3. Inspector shows neighbors and quick actions.
4. User promotes one neighbor into the next focus.

### Flow 3: Return to Structure

1. User is deep in a focused subgraph.
2. User chooses reset or back to overview.
3. Graph returns to a structure-level view without losing orientation.

### Flow 4: Flow-Led Triage

1. User starts from an HTTP route or route-like entrypoint.
2. Graph emphasizes flow edges first.
3. Dependency and impact edges remain secondary and optional.
4. User follows execution context before broadening into general dependencies.

## Graph Modes

Graph v2 should have three explicit modes.

### Overview

Purpose:

- understand repository or package structure at a high level

Characteristics:

- repository and package nodes are primary
- only selected high-value route nodes appear
- most file and symbol detail is suppressed

Used for:

- self-host repo orientation
- first-pass structural understanding

### Focused

Purpose:

- inspect the neighborhood around one selected node

Characteristics:

- one focus node
- one-hop neighbors shown fully
- two-hop neighbors trimmed by score
- inspector becomes the main guide for next actions

Used for:

- file triage
- package boundary inspection
- dependency investigation

### Flow

Purpose:

- inspect route or execution-like paths

Characteristics:

- flow edges visually dominate
- dependencies and impact are secondary overlays
- sequence and direction are emphasized

Used for:

- route-based investigation
- request path tracing
- behavior-first debugging

## Graph View Model

The UI should not render raw query outputs directly.

Instead, GraphTrace should build a dedicated `view graph` for each screen state.

That `view graph` should be derived from:

- workspace
- repository scope
- package scope
- graph mode
- selected focus node
- filter state

This is the key boundary that keeps the renderer simple and the graph readable.

## Node Model

Graph v2 should standardize these node kinds:

- `repository`
- `package`
- `route`
- `file`
- `symbol`
- `query_hint`

Each node should carry:

- `id`
- `kind`
- `label`
- `path`
- `workspaceId`
- `repositoryId`
- `clusterId`
- `importanceScore`
- `isEntryPoint`
- `isFocus`
- `isExpandable`

### Visual Priority

Recommended visual priority:

- repository
- package
- route
- file
- symbol
- query_hint

`query_hint` should remain secondary in visual weight. It is useful context, but it
should not dominate the canvas.

## Edge Model

Graph v2 should standardize these edge kinds:

- `contains`
- `flow`
- `depends`
- `impacts`
- `query_hint`

Each edge should carry:

- `id`
- `kind`
- `sourceId`
- `targetId`
- `weight`
- `isDirectional`
- `isVisibleByDefault`

### Edge Semantics

- `contains`
  - repository -> package -> file -> symbol
- `flow`
  - route/file execution or request path
- `depends`
  - imports, calls, or outgoing dependencies
- `impacts`
  - inbound effect surface
- `query_hint`
  - inferred query-related clue edges

## Rendering Rules

- Never render the full raw graph by default.
- Always render a bounded `view graph`.
- The visible graph must be mode-dependent.
- High-degree nodes must be trimmed or summarized.
- Overview and focused modes should not reuse the exact same visible-node policy.

### Overview Rendering

- show repository nodes
- show package nodes
- show a small set of route entrypoints
- hide most files and all symbols by default

### Focused Rendering

- show one focus node
- show one-hop neighbors fully
- show two-hop neighbors only if they pass importance thresholds
- hide low-value nodes until expanded

### Flow Rendering

- prioritize flow edges
- present dependencies and impact as optional overlays
- preserve directional reading

## Layout Strategy

Renderer choice alone does not solve graph readability. GraphTrace needs a layout
strategy on top of `@xyflow/react`.

### Core Rule

Layout should be cluster-first, node-second.

Default clusters:

- repository
- package

### Inside a Cluster

- route nodes near the entry side
- file nodes in the main body
- symbol and query hint nodes near the edges or periphery

### Mode-Based Layout Recommendations

- `Overview`
  - layered or dagre-like topological layout
- `Focused`
  - radial or layered-around-focus layout
- `Flow`
  - left-to-right path-emphasis layout

### Dense Regions

When a node has too many visible neighbors:

- do not expand everything
- summarize using `+N more`
- or create cluster summary nodes

This is critical for self-host use on GraphTrace itself.

## Visual Semantics

Graph v2 should use more decisive semantics:

- node kind changes color
- node kind changes size
- edge kind changes color
- edge kind changes stroke style
- focus node receives the strongest treatment
- selected node and highlighted node should be visibly distinct

Color alone is not enough. Size, spacing, edge style, and grouping should reinforce
the meaning.

## Search and Entry Strategy

Search should be a primary graph action, not a small supporting control.

Graph search should:

- sit at the top of the canvas workspace
- support keyboard shortcut
- focus and highlight matching nodes
- allow promoting a match into the current focus

When no node is selected yet, Graph v2 should prefer:

- overview graph
- starter subgraph
- recommended entrypoints

Blank graph states should be rare.

## Inspector Strategy

The inspector should be structured around:

- what is selected
- what is connected
- what to do next

Recommended inspector sections:

- summary
- quick actions
- flow neighbors
- dependency neighbors
- impact neighbors
- containment context
- promote-to-focus actions

The inspector should help the user keep moving, not just describe the current node.

## Performance Constraints

- UI should render bounded subgraphs only.
- Layout should re-run only on meaningful graph-state changes.
- Search highlight should avoid full graph reconstruction when possible.
- Dragged node positions may be preserved within the current local session.
- Large self-host repos should still open into a readable default graph.

## Rollout Plan

### Phase 1: Graph Workspace Foundation

Scope:

- elevate graph into a stronger dedicated workspace
- add stable 3-column layout
- add legend, control hint, search, fullscreen, fit/reset view

Acceptance:

- graph no longer feels like a secondary widget
- search is a first-class action
- fullscreen and reset view are usable on desktop
- graph entry does not feel blank when starter data exists

### Phase 2: Bounded Graph Modes

Scope:

- add `Overview`, `Focused`, and `Flow`
- derive a mode-specific `view graph`
- support starter subgraphs for repos with and without routes

Acceptance:

- overview reveals repository and package structure clearly
- focused mode gives a useful local neighborhood
- flow mode emphasizes route-driven investigation
- repos with few or no routes still get meaningful graph entry

### Phase 3: Layout and Readability

Scope:

- package or repository clustering
- reduced node overlap
- stronger edge semantics
- summary handling for dense regions

Acceptance:

- self-host GraphTrace default graph is readable without immediate manual dragging
- zoomed-out structure remains legible
- graph does not collapse into dense unreadable overlap in the default view

### Phase 4: Triage Workflow Polish

Scope:

- stronger inspector actions
- better search/canvas/inspector coordination
- faster focus promotion workflows

Acceptance:

- users can move from search result to graph focus cleanly
- users can promote neighbors into the next focus quickly
- graph becomes a practical navigation tool, not just an auxiliary visualization

## Success Criteria

Graph v2 is successful when:

- self-host GraphTrace reveals structure faster than the current graph panel
- smaller repos such as tawaco do not feel empty or underpowered
- users can identify a meaningful entrypoint in fewer steps
- graph readability improves without abandoning bounded triage
- the graph becomes a place users want to stay in during investigation

## Risks

- trying to show too much data at once
- over-investing in renderer polish without improving graph shaping
- adding too many controls without improving defaults
- introducing layout instability that makes the graph feel unpredictable

## Open Questions

- should `symbol` nodes be visible only in deep focus states, or remain optional in
  all focused views
- which node expansion actions should be explicit versus automatic
- whether package-level clustering is sufficient, or whether repository-level
  super-clusters should appear in overview for large monorepos
- whether graph mode should be its own route state or remain local UI state

## Recommendation

Proceed with a phased Graph v2 centered on:

- graph-first workspace
- bounded graph modes
- cluster-first layout
- graph-local search
- strong starter entrypoints
- inspector-driven focus transitions

This is the smallest design that meaningfully applies the strongest lessons from
Grapuco without abandoning GraphTrace's local-first bounded triage model.
