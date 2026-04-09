# Architecture Graph Renderer Note

Date: 2026-04-09

## Why change

The original architecture graph used a static SVG with a lightweight custom layout.
That was enough to prove the bounded-neighborhood idea, but it broke down for real
self-host investigations:

- no practical pan/zoom workflow for medium-density neighborhoods
- no fullscreen mode for focused exploration
- no graph-local search to jump to an existing node on the canvas
- no manual node dragging to de-clutter a specific investigation

## External reference and what we can safely infer

Grapuco's public product/docs strongly emphasize a graph-first exploration loop with
filters, explorer interactions, and flow tracing. From the public UX and bundle/runtime
behavior, the most likely implementation style is a viewport-based node graph system in
the React Flow / XYFlow family or something close to it.

That is an informed inference, not a confirmed package match.

## Renderer decision

GraphTrace now uses `@xyflow/react` for the interaction layer and keeps the existing
GraphTrace-specific bounded graph model in local code.

Chosen because it gives us, with low custom surface area:

- reliable pan/zoom controls
- draggable nodes
- fit/reset viewport behavior
- minimap and canvas interactions
- a clean path to fullscreen graph exploration

## Tradeoffs

Pros:

- much stronger graph UX without abandoning the bounded-neighborhood mental model
- less custom canvas code to maintain
- easier to extend with search, highlighting, and future subgraph expansion

Cons:

- extra frontend dependency weight
- graph node rendering is now mediated through a renderer abstraction, which is less
  minimal than raw SVG
- layout quality still depends on our own graph shaping and initial positioning logic;
  the renderer alone does not solve data quality problems

## Scope boundary

This change is intentionally limited to interaction quality and graph readability for
the bounded graph already produced by GraphTrace. It does not change the graph query
scope into an unbounded repo-wide visualization.

## Symbol graph semantics

The symbol graph is now the default investigation layer for function and method work.
It keeps the same bounded-neighborhood philosophy as the file graph, but with stricter
rules so self-host and real customer repositories stay readable:

- execution and impact queries default to a storage-side cap of 25 nodes / 40 edges
- the web UI starts tighter at 18 nodes / 24 edges to keep first paint readable
- UI expansion grows by 12 nodes / 18 edges per user action
- `Execution` and `Impact` only traverse `routes_to`, `calls`, and `queries`
- `Reference` mode keeps `references` separate so symbol lookups do not collapse into
  the execution spine
- direct and checker-resolved edges stay `proven`
- wrapper handoffs stay `inferred-strong`
- edges that resolve into `node_modules` or files outside the workspace root are
  dropped from symbol-level investigations because they add noise without helping repo
  triage

## UI behavior

The current UI contract for symbol-first investigations is:

- compact graphs should emphasize focus, not controls; do not show expansion actions
  unless truncation actually happened
- truncated execution graphs must surface `Expand callers`, `Expand callees`, and
  `Open impact`
- weak-confidence edges must be visible by styling and by inspector warning text
- `Show weaker edges` is opt-in and should only appear when weak edges are currently
  hidden

## Manual validation bar

Chunk 3 was treated as complete only after checking both GraphTrace self-host and a
real external workspace.

### GraphTrace self-host

Workspace: `/Users/tuannguyen8888/WorkSpace/myself-opensources/GraphTrace/.worktrees/symbol-execution-graph`

- full index completed in about 10.8s on April 9, 2026
- `createGraphTraceApp` symbol lookup returned in about 22ms after indexing
- execution context stayed bounded at 9 nodes / 8 edges with `maxNodes=18`,
  `maxEdges=24`
- the useful path was local to the repo: `createGraphTraceApp` ->
  `registerSingleWorkspaceRoutes` / `registerWorkspaceScopedRoutes` /
  `shouldServeSpaShell`
- external library symbols such as Fastify internals are intentionally excluded from
  symbol-level execution results

### tawaco

Workspace: `/Users/tuannguyen8888/WorkSpace/CotMoc/tawaco`

- full index completed in about 7.2s on April 9, 2026
- `Result.handlePrint` execution lookup returned in about 3ms after indexing
- execution context stayed bounded at 9 nodes / 8 edges with `maxNodes=18`,
  `maxEdges=24`
- the useful path was local to the app:
  `Result` -> `Result.handlePrint` -> `printReceipt` / `showToast` ->
  `mockPrint`
- callback-heavy React screens now expose stable nested symbols such as
  `CustomerSearchInput.handleManualSearch`

## Smoke checklist

These are the smoke flows that should keep working when the renderer or symbol graph
shaping changes:

1. Search for a symbol, focus it, and see a bounded graph without immediate drag
   cleanup.
2. Open a dense execution graph and confirm truncation actions appear only when needed.
3. Switch between `Execution`, `Impact`, and `Reference` and confirm the inspector
   sections change meaningfully.
4. Opt into weaker edges and confirm the warning and styling explain why the graph
   changed.
5. Re-run the same flow on both GraphTrace self-host and tawaco before calling the UX
   release-ready.
