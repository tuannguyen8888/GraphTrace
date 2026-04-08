# Multi-Workspace UI and Daemon Design

Date: 2026-04-07

## Summary

GraphTrace should move from a single-workspace web server model to a
single-daemon, multi-workspace model.

The target user experience is:

- one GraphTrace daemon
- one web UI
- many workspaces added over time
- strict workspace-level data isolation
- workspace selection first, repository selection second
- add new repo/workspace directly from the UI

This replaces the current requirement to run one GraphTrace instance per repo.

## Problem

Today GraphTrace is scoped to one workspace root per running server:

- one workspace root
- one `.graphtrace/index.db`
- one UI instance

This causes product and UX problems:

- users must run multiple ports to inspect multiple repos
- the current `Repository` dropdown is easy to misread as a global repo switcher
- data isolation is implicit through process boundaries instead of explicit in the product
- adding a newly discovered repo requires leaving the UI and starting another server
- local experiments can still create confusion around where DBs live and which workspace the UI is showing

The user requirement for this design is:

- one GraphTrace instance should serve many repos
- data should remain isolated per repo/workspace
- the UI should provide a home screen that lists indexed workspaces
- the UI should allow adding a new repo for indexing

## Goals

- Run one GraphTrace daemon that manages many workspaces.
- Make workspace selection explicit in the UI.
- Keep graph/query/search/package/route data isolated by workspace.
- Keep repository-scoped filtering inside a selected workspace.
- Let users add a new workspace from the UI without manually starting another instance.
- Default storage should avoid dirtying tracked repo files.

## Non-Goals

- Global graph traversal across multiple workspaces in one query.
- Cross-workspace search results mixed in a single result list.
- Multi-user remote hosting or authentication.
- Cloud sync or distributed indexing.
- A repo-wide supergraph across all workspaces in the MVP.

## Core Concepts

### Workspace

A workspace is a root path added to GraphTrace, for example:

- `/Users/.../GraphTrace`
- `/Users/.../tawaco`

Each workspace gets its own index DB and query boundary.

### Repository Scope

A repository scope is a nested repository or sub-repo inside a selected workspace,
derived from units. This is a secondary filter that only exists after the user has
entered a workspace.

### Package Scope

A package scope is the package/app/unit filter inside the selected workspace and
repository scope.

## Design Principles

- Workspace isolation must be explicit, not accidental.
- UI must distinguish workspace selection from repository filtering.
- The default storage mode should keep user repos clean.
- The daemon should own lifecycle and job scheduling for indexing.
- Backward compatibility with current CLI flows should be preserved where practical.

## Product Model

GraphTrace becomes:

- a background-capable daemon
- a single web UI served by that daemon
- a workspace registry
- a per-workspace managed DB store

The new top-level flow is:

1. Open GraphTrace.
2. See a home screen listing indexed workspaces.
3. Add a workspace or choose an existing one.
4. Enter that workspace.
5. Inside that workspace, choose repository scope, package, search, graph, and drill-down views.

## Architecture Options Considered

### Option A: One Shared SQLite DB with `workspace_id` in Every Table

Pros:

- one DB file
- future cross-workspace queries are easier

Cons:

- much riskier migration
- higher chance of accidental data mixing
- more complex locking and maintenance
- harder to debug or rebuild one workspace in isolation

### Option B: One Daemon, One Registry, One DB Per Workspace

Pros:

- strongest isolation
- simplest rebuild/delete/import story
- easiest to reason about
- lower migration risk
- keeps current query engine model close to existing behavior

Cons:

- requires registry metadata storage
- future cross-workspace search requires aggregation at a higher layer

### Option C: Keep Local `.graphtrace` in Each Repo and Build a Thin Multi-Repo Shell

Pros:

- minimal indexing changes

Cons:

- still scatters DBs into user repos
- still creates repo hygiene issues
- weak add/remove/import UX
- unclear ownership and lifecycle

### Recommendation

Choose Option B:

- one daemon
- one registry DB
- one managed graph DB per workspace

## Storage Design

### Registry Storage

Use one central registry DB:

- `~/.graphtrace/registry.sqlite`

This DB stores workspace metadata and indexing job state, but not graph facts.

### Workspace Graph Storage

Use one DB per workspace under managed storage:

- `~/.graphtrace/workspaces/<workspaceId>/index.db`

This becomes the default storage mode for all workspaces added through the UI.

### Why Managed Storage

Managed storage is preferred because it:

- keeps user repos clean
- avoids accidental tracked-file churn
- makes workspace removal and rebuild simpler
- centralizes operational ownership in the daemon

### Optional Compatibility Mode

The daemon may later support:

- importing an existing repo-local `.graphtrace/index.db`
- adopting a local DB as an advanced mode

This is not the default.

## Registry Schema

### `workspaces`

Fields:

- `id`
- `label`
- `root_path`
- `canonical_root_path`
- `slug`
- `created_at`
- `updated_at`
- `last_opened_at`
- `status` (`ready`, `indexing`, `failed`, `missing`, `paused`)
- `db_path`
- `storage_mode` (`managed`, `imported_local`)
- `notes`
- `pinned`

### `workspace_snapshots`

Fields:

- `workspace_id`
- `last_index_mode`
- `last_index_started_at`
- `last_index_completed_at`
- `package_count`
- `file_count`
- `symbol_count`
- `route_count`
- `query_edge_count`
- `unit_count`
- `repository_count`
- `error_summary`

### `workspace_jobs`

Fields:

- `id`
- `workspace_id`
- `type` (`full_index`, `incremental_index`, `rebuild`, `delete`)
- `status`
- `created_at`
- `started_at`
- `completed_at`
- `error_message`

## Workspace Identity

Each workspace should have a stable, user-friendly identifier:

- `slug + short hash`

Examples:

- `graphtrace-3f92a6`
- `tawaco-kiosk-c1d824`

This keeps URLs readable while avoiding collisions.

## Daemon Design

### Process Model

One daemon process owns:

- UI static assets
- API server
- workspace registry access
- indexing job scheduling
- per-workspace query engine instances

### Concurrency Rules

- one write/index job per workspace at a time
- read queries may continue for completed workspaces
- global indexing concurrency defaults to `1`
- WAL mode should be used for workspace DBs

This keeps the system predictable and reduces lock contention.

### Workspace Lifecycle

States:

- `ready`
- `indexing`
- `failed`
- `missing`
- `paused`

Transitions:

- add workspace -> `indexing` or `ready`
- full reindex -> `indexing`
- path missing -> `missing`
- indexing error -> `failed`

## CLI Changes

### New Commands

- `graphtrace serve`
- `graphtrace workspace add <path>`
- `graphtrace workspace list`
- `graphtrace workspace remove <workspace-id>`
- `graphtrace workspace reindex <workspace-id> --full`
- `graphtrace workspace open <workspace-id>`

### Existing Commands

`graphtrace web` should remain as a compatibility entry point, but should become
an alias or thin wrapper around the daemon-backed web server.

## API Design

### Home / Registry Endpoints

- `GET /api/workspaces`
- `POST /api/workspaces`
- `POST /api/workspaces/preview`
- `GET /api/workspaces/:workspaceId`
- `DELETE /api/workspaces/:workspaceId`
- `POST /api/workspaces/:workspaceId/index`
- `GET /api/workspaces/:workspaceId/jobs`

### Workspace-Scoped Data Endpoints

- `GET /api/workspaces/:workspaceId/status`
- `GET /api/workspaces/:workspaceId/repositories`
- `GET /api/workspaces/:workspaceId/packages`
- `GET /api/workspaces/:workspaceId/routes`
- `GET /api/workspaces/:workspaceId/search`
- `GET /api/workspaces/:workspaceId/deps`
- `GET /api/workspaces/:workspaceId/impact`
- `GET /api/workspaces/:workspaceId/flow`

### API Rule

All graph/search/query endpoints must be explicitly scoped by `workspaceId`.

There should be no ambiguous "current workspace" server state in the API.

## UI Design

### Route Model

- `/` -> workspace home
- `/workspaces/:workspaceId` -> workspace detail

### Workspace Home

This is the default screen when opening GraphTrace.

It must show:

- list of indexed workspaces
- filter/search by label or path
- `Add new repo` action
- indexing status
- quick summary counts
- recent/opened state

Each workspace card should show:

- display name
- root path
- status badge
- last indexed time
- counts
- quick actions: `Open`, `Re-index`, `Reveal path`, `Remove`

### Add New Repo Flow

The home screen should expose an `Add new repo` action that opens a modal or sheet.

Inputs:

- `Path`
- optional `Display name`
- `Start full index now` toggle, default on
- `Storage mode`, default `Managed by GraphTrace`

Flow:

1. User clicks `Add new repo`.
2. User picks a folder or pastes a path.
3. Daemon validates the path.
4. Daemon returns a preview:
   - suggested label
   - canonical path
   - detected unit count
   - repository candidates
   - warnings
5. User confirms.
6. Workspace is created in the registry.
7. Full indexing starts if enabled.
8. The new workspace appears immediately on the home screen.

### Path Picking

Preferred:

- local folder picker via File System Access API on supported browsers

Fallback:

- paste path manually

### Workspace Detail

The current UI becomes a workspace detail view with clearer context.

Header must show:

- breadcrumb: `Home / <Workspace>`
- workspace name
- workspace root path
- actions: `Re-index`, `Open folder`, `Back to home`

Inside this page, existing self-host views remain:

- graph state
- triage lens
- package filter
- search workbench
- route explorer
- inspector
- architecture graph

### Repository Selector Rename

Inside workspace detail, rename the current `Repository` control to:

- `Repository Scope`

Supporting hint:

- `Only applies to nested repositories inside this workspace.`

This avoids the exact confusion seen in current self-host UX.

## Repository Derivation in Multi-Workspace Mode

Repository scope should remain derived from units, but the derivation rules should
be broadened for monorepo-style frontend workspaces like `tawaco`.

### New Rule

Any nested app or subproject with:

- its own `package.json`
- its own root path
- its own `src` or clear source root

may be promoted to a repository candidate in workspace detail.

### Why

In repos like `tawaco`, current indexing shows:

- root project with `src`
- `apps/kiosk`
- `apps/backoffice`

These are real user-facing scopes, but current repository UX may only show the root.

### UX for Duplicate Labels

If labels collide, UI must disambiguate by path, for example:

- `tawaco-kiosk · .`
- `tawaco-kiosk · apps/kiosk`
- `tawaco-backoffice · apps/backoffice`

## Query Semantics

MVP query model:

- workspace is the outermost isolation boundary
- repository scope is an inner filter
- package is a deeper inner filter

Search, graph, route, deps, impact, and flow should never cross workspace
boundaries in the MVP.

## Migration Plan

### Phase 1

- add daemon registry
- add managed per-workspace storage
- add home screen
- make API workspace-scoped
- keep current workspace detail experience mostly intact

### Phase 2

- support importing or migrating local `.graphtrace` DBs
- improve nested repository derivation
- add missing-path recovery flows

### Backward Compatibility

Current CLI flows should continue to work as much as practical:

- `graphtrace index --full` in a repo still works
- `graphtrace web` still works

But the daemon-backed flow becomes the preferred UX.

## Operational Behavior

### Missing Paths

If a workspace root is moved or deleted:

- mark workspace as `missing`
- do not delete DB automatically
- show recovery actions in UI:
  - `Locate new path`
  - `Remove workspace`

### Reindexing

Reindexing one workspace must not block reading from others.

### Deletion

Removing a workspace should:

- remove it from the registry
- optionally delete its managed DB directory
- never affect other workspace DBs

## Risks

- confusion between workspace and repository terminology
- path canonicalization and symlink behavior
- duplicate root and nested app labels
- job scheduling complexity as workspace count grows
- future desire for global search before local isolation UX is mature

## Risk Mitigations

- use explicit naming in UI
- store canonical paths
- disambiguate labels with path
- default indexing concurrency to `1`
- show workspace status clearly on home

## Acceptance Criteria

- one daemon can manage at least 20 workspaces
- UI opens to a workspace home screen
- users can add a new workspace from the UI
- users choose workspace first, then repository scope inside it
- GraphTrace and `tawaco` data remain isolated from each other
- repository dropdown only shows repository scopes inside the selected workspace
- default add/index flow does not dirty tracked files in user repos
- reindexing workspace A does not break queries in workspace B
- workspace removal only affects that workspace

## Recommended Rollout Order

1. Add daemon registry and managed storage.
2. Add workspace home screen and add-workspace flow.
3. Refactor API to require `workspaceId`.
4. Move current UI into workspace detail routes.
5. Rename repository filter to `Repository Scope`.
6. Improve repository derivation for nested apps and subprojects.
7. Consider cross-workspace search only after the above is stable.

## Final Recommendation

Lock these two principles:

- one daemon, many workspaces, one DB per workspace
- home screen chooses workspace, detail screen chooses repository scope

This is the cleanest way to satisfy the product requirement:

- one GraphTrace instance can serve many repos
- data remains separated
- users can add and manage repos from one place
- current self-host detail UX can evolve without forcing users into multiple ports
