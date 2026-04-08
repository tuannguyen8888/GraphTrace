# Architecture

GraphTrace uses a graph-first local engine with two operating modes:

- repo-local mode for classic `graphtrace init/index/status/web`
- daemon mode for one UI serving many isolated workspaces

Core pieces:

- `~/.graphtrace/registry.sqlite`
  Stores workspace metadata, snapshot counts, and lifecycle state.
- `~/.graphtrace/workspaces/<workspaceId>/index.db`
  Stores the graph facts for one managed workspace.
- query engine
  Opens one workspace DB at a time and answers search, deps, impact, flow, route, package, and status queries.
- daemon/server layer
  Owns workspace add/reindex/remove flows and serves workspace-scoped APIs under `/api/workspaces/:workspaceId/*`.
- web UI
  Starts at a workspace home screen, then drills into `/workspaces/:workspaceId` with repository/package/search state in the URL.

Design constraints:

- workspace isolation is explicit by DB boundary, not by running one process per repo
- nested repository scopes prefer the deepest useful app/service/subproject path
- missing workspace roots surface as `missing` so stale entries can be cleaned up safely
- semantic search remains optional and local-first
