# GraphTrace Plugin Architecture Design

Date: 2026-04-06
Status: Draft for review

## Context

GraphTrace currently targets JavaScript and TypeScript monorepos and indexes source code using fixed directory globs such as `apps/**/*`, `packages/**/*`, and `services/**/*`.

That approach is too narrow for community use:

- many real projects use `backend/`, `frontend/`, `libs/`, or `src/` at the root
- large projects may contain multiple subprojects or nested repositories
- one top-level project may include units with different languages and frameworks
- framework-specific extraction should not stay hard-coded in the core indexer

GraphTrace needs to move from path convention indexing to dynamic project discovery with explicit architecture boundaries.

## Goals

- Support JS/TS projects with many directory layouts without relying on fixed source roots.
- Support large project roots that contain multiple workspace units.
- Support nested subprojects and mixed structures inside one top-level project.
- Keep deep indexing in v1 focused on JS/TS.
- Move framework detection and route/query extraction behind plugin contracts.
- Keep plugins first-party and in-repo for now.
- Preserve current CLI, MCP, and web UX while migrating internals.

## Non-Goals

- Runtime loading of external plugins.
- Full deep parsing for Go, Python, Java, .NET, PHP, or other non-JS/TS ecosystems in v1.
- Full semantic cross-language linking in v1.
- Public stable plugin API guarantees for third parties in v1.

## Core Position

GraphTrace should adopt a plugin architecture internally, but not support external plugin loading at runtime in v1.

This means:

- the core runtime owns lifecycle, orchestration, merge, and persistence
- built-in plugins live inside the GraphTrace repository
- contributors extend behavior by merging plugins into the main repo
- plugin contracts are designed cleanly enough that externalization remains possible later

## Architecture Overview

GraphTrace should treat the input path as a `project root`, not as a single workspace.

The runtime should discover multiple `workspace units` within that project root. A unit can represent:

- a root JS/TS application
- a package inside a monorepo
- a service inside a larger system
- a subproject with its own tooling and boundaries
- a nested repository or nested project root

Each unit is classified independently, then assigned the correct indexing pipeline.

### Layers

1. Core runtime
   - loads built-in plugins
   - runs discovery and extraction pipelines
   - merges normalized facts
   - persists data into the graph store

2. Plugin host
   - resolves built-in plugin manifests
   - validates plugin compatibility against the current core API version
   - schedules plugin execution by capability and priority

3. Plugins
   - detect workspace units
   - classify JS/TS units
   - detect frameworks
   - extract framework-specific semantics such as routes and query hints
   - enrich cross-unit relationships where supported

## Workspace Model

### Project Root

The path passed to GraphTrace commands. It may contain:

- a single repo
- a monorepo
- several nested repos or subprojects
- a mixed-language project root

### Workspace Unit

A unit is the smallest practical project boundary that GraphTrace can index or reason about independently.

Proposed fields:

- `id`
- `rootPath`
- `parentUnitId?`
- `displayName`
- `kind` such as `repo`, `app`, `service`, `package`, `subproject`
- `language`
- `tooling`
- `indexingMode`
- `confidence`
- `signals`

### Indexing Modes

- `full`: deep JS/TS indexing
- `shallow`: metadata only
- `skipped`: recognized but not indexed deeply

This allows mixed project roots to show all discovered units, even when only JS/TS units are deeply indexed in v1.

## Plugin Capabilities

GraphTrace should separate responsibilities into four capability types.

### 1. Workspace Detector

Input:

- project root
- lightweight filesystem snapshot
- current GraphTrace config

Output:

- discovered units
- confidence per unit
- signals explaining why each unit was created

Responsibilities:

- detect root projects, subprojects, nested repos, and candidate JS/TS units
- avoid exploding the project into meaningless nested directories

### 2. Language Plugin

V1 only needs a first-party `js-ts` language plugin.

Responsibilities:

- determine source roots dynamically
- identify files that belong to the unit
- assign file ownership and package/module boundaries
- extract symbols and import edges

This replaces the current hard-coded source globs in the indexer.

### 3. Framework Plugin

Runs only on units that the language plugin has classified as JS/TS.

Responsibilities:

- detect framework matches
- emit framework-specific facts
- extract routes, handlers, query hints, and semantic edges

First-party framework plugins in v1:

- `express`
- `fastify`
- `nest`
- `next`
- `prisma`
- `drizzle`

### 4. Linker / Enricher

Responsibilities:

- build practical cross-unit links from existing facts
- improve traceability without re-parsing source from scratch

V1 should keep this light and practical, not fully semantic across languages.

## Plugin Contract

Every plugin should declare:

- `id`
- `version`
- `apiVersion`
- `kind`
- `priority`
- `supportedLanguages`
- `supportedFrameworks`

Every fact emitted by a plugin should include:

- `pluginId`
- `pluginVersion`
- `unitId`
- `confidence`
- `source`

Important constraints:

- plugins do not write directly to SQLite
- plugins return normalized facts only
- core owns merge, dedup, priority resolution, and persistence

## Execution Pipeline

1. Scan the project root and collect lightweight signals.
2. Run workspace detectors and build the unit graph.
3. Classify each discovered unit.
4. Assign the JS/TS language plugin where appropriate.
5. Run framework detection on JS/TS units.
6. Run framework and query extractors for matched units.
7. Run linkers/enrichers.
8. Merge, deduplicate, and persist facts.
9. Report indexing results by unit and by plugin.

## JS/TS Unit Discovery Heuristics

GraphTrace should stop relying on specific folder names and instead use signal-based scoring.

### Signals

- `package.json`
- `tsconfig.json`, `tsconfig.base.json`, `jsconfig.json`
- lockfiles
- workspace manifests such as `pnpm-workspace.yaml`, `nx.json`, `turbo.json`
- JS/TS source density
- framework markers such as `nest-cli.json`, `next.config.*`, `schema.prisma`
- nested `.git` boundaries

### Example Scoring Model

- `package.json`: +50
- `tsconfig/jsconfig`: +20
- enough JS/TS source files: +20
- framework markers: +15
- direct workspace manifest target: +25
- too deep without independent metadata: -20
- only a few stray JS/TS files: -15

Suggested thresholds:

- `>= 60`: create a strong unit
- `40-59`: candidate unit, resolve against parent and children
- `< 40`: do not create an independent unit

### Boundary Rules

- if the parent is already a strong unit and the child has no metadata of its own, do not split
- if the child has its own `package.json`, framework marker, or nested repo boundary, allow a child unit
- if a workspace manifest exists, use it as a strong signal, not the only truth
- when confidence is low, prefer creating one root JS/TS unit rather than silently indexing nothing

## Framework Detection and Extraction

Framework detection should become plugin-driven.

### Framework Signals

- Nest:
  - `@nestjs/core` or `@nestjs/common`
  - `nest-cli.json`
  - decorators such as `@Controller`, `@Get`, `@Post`

- Next:
  - dependency on `next`
  - `next.config.*`
  - file conventions under `app/` or `pages/`

- Express:
  - dependency on `express`
  - `express()`, `Router()`, `app.get(...)`

- Fastify:
  - dependency on `fastify` or `@fastify/*`
  - `fastify()` or `app.route(...)`

- Prisma:
  - dependency on `prisma` or `@prisma/client`
  - `schema.prisma`
  - `prisma.<model>.<method>`

- Drizzle:
  - dependency on `drizzle-orm`
  - schema and query-builder patterns

### Route Facts

Route extraction should emit normalized route facts:

- `routeId`
- `unitId`
- `framework`
- `method`
- `path`
- `filePath`
- `handlerSymbolId?`
- `confidence`

### Query Facts

Query extraction should emit normalized query edges or hints:

- source file or symbol
- target model, table, or logical query entity
- ORM kind
- confidence

V1 should optimize for practical impact analysis and traceability, not complete ORM semantics.

## Graph Store Evolution

The graph store should add first-class support for units.

New or updated entities:

- `Project`
- `Unit`
- `File` with `unitId`
- `Symbol`
- `Route` with `unitId`
- `Package` as a JS/TS package concept, not the only workspace boundary

This prevents GraphTrace from conflating package discovery with overall project structure.

## Config Evolution

Config should move from path prescription to discovery guidance.

Current `workspaceGlobs` should become a legacy hint instead of the main source of truth.

Proposed direction:

```json
{
  "exclude": ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/coverage/**"],
  "detection": {
    "mode": "auto",
    "maxDepth": 6,
    "minUnitConfidence": 60
  },
  "plugins": {
    "disable": [],
    "prefer": []
  }
}
```

`workspaceGlobs` may remain temporarily as a migration aid, but it should not drive the architecture anymore.

## CLI and Debuggability

Auto-discovery must be explainable or users will not trust it.

Recommended additions:

- `graphtrace doctor --units`
  - list discovered units, scores, signals, and indexing mode

- `graphtrace doctor --plugins`
  - show which plugins matched each unit and why

- `graphtrace index --explain`
  - explain why a unit or file was indexed, shallow-indexed, or skipped

## Rollout Strategy

Refactoring should happen in phases so existing surfaces stay stable.

### Phase 1

- add unit graph
- add project scan and auto-discovery
- keep current extractor behavior behind adapters where needed

### Phase 2

- add internal plugin runtime
- move JS/TS source discovery into the `js-ts` language plugin
- remove hard dependency on fixed `SOURCE_GLOBS`

### Phase 3

- move framework detection and extraction into first-party framework plugins
- migrate query extraction into framework/query plugins
- clean up legacy code paths

### Phase 4

- update documentation and product messaging
- demote or remove `workspaceGlobs` from the primary workflow

## Risks

- incorrect unit boundaries on large or unusual projects
- false-positive framework matches
- slower indexing on large roots
- user confusion when only part of a mixed-language project is deeply indexed

## Mitigations

- confidence scoring and explain mode
- fixture-based testing with multiple real repo shapes
- benchmark scan and index performance before and after refactors
- clear status output that reports what was indexed deeply, shallowly, or skipped

## Recommended V1 Scope

Ship internal plugin architecture with:

- dynamic JS/TS unit discovery
- deep JS/TS indexing
- first-party framework plugins for Nest, Next, Express, Fastify, Prisma, and Drizzle
- shallow detection for non-JS/TS units in mixed project roots

Do not ship runtime external plugin loading in v1.

## Acceptance Criteria

- GraphTrace can index JS/TS projects with flat roots, monorepos, `backend/frontend`, `src`-root apps, and nested subprojects without requiring fixed source-path conventions.
- A top-level project containing multiple subprojects produces a useful unit graph.
- JS/TS units are indexed deeply.
- Non-JS/TS units are still surfaced as recognized units with shallow metadata.
- Framework detection and route/query extraction no longer depend on hard-coded logic in the core indexer.
- CLI diagnostics explain what GraphTrace discovered and why.
