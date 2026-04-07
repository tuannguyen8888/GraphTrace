# Architecture Graph Renderer Note

Date: 2026-04-07

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
