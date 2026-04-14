# PHP, Laravel, and CrudBooster Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend GraphTrace so it can deeply analyze PHP repositories, especially Laravel applications and CrudBooster-based codebases, while preserving current JS/TS capabilities and existing query surfaces.

**Architecture:** First harden mixed-language detection and reduce framework false positives, then refactor the current indexer into internal language and framework capability boundaries. After that, add a PHP language analyzer, a Laravel framework extractor, and a CrudBooster-specialized extractor that all emit normalized graph facts into the existing SQLite-backed store and query engine.

**Tech Stack:** TypeScript, Node.js, SQLite, Vitest, `php-parser`, existing GraphTrace CLI, MCP, server, and web packages

---

## Scope Strategy

This plan is intentionally phased. Do not start Laravel or CrudBooster work
before detection hardening and indexer boundary extraction are in place.

- Chunk 1 = Detection and indexer boundary cleanup
- Chunk 2 = PHP language foundation
- Chunk 3 = Laravel usable graph
- Chunk 4 = CrudBooster support and hardening

Each chunk should stop for review before proceeding.

## File Map

### Existing files to modify

- `packages/shared/src/index.ts`
  - add PHP language enums and any shared graph metadata needed by PHP support
- `packages/config/src/index.ts`
  - extend framework defaults if needed for Laravel and CrudBooster
- `packages/indexer/src/workspace.ts`
  - mixed-language discovery, PHP unit scoring, framework signal detection
- `packages/indexer/src/index.ts`
  - convert into orchestrator over language and framework analyzers
- `packages/indexer/test/indexer.test.ts`
  - end-to-end indexing coverage for PHP, Laravel, and CrudBooster fixtures
- `packages/cli/src/index.ts`
  - watch snapshot and source extension handling for PHP files
- `packages/query-engine/src/index.ts`
  - only if PHP-specific graph traversal or filtering needs minor shaping
- `packages/query-engine/test/query-engine.test.ts`
  - ensure search, routes, impact, and flow stay generic over PHP facts
- `packages/mcp/src/index.ts`
  - only if tool descriptions or payload shaping need small updates
- `packages/mcp/test/mcp.test.ts`
  - verify generic tools return PHP and Laravel facts cleanly
- `packages/server/src/index.ts`
  - only if server filtering assumes JS/TS-only languages
- `packages/server/test/server.test.ts`
  - HTTP assertions over generic graph output with PHP facts
- `packages/server/test/web-ui.test.ts`
  - UI messaging or display assumptions for mixed-language repos
- `apps/web/src/workspace-screen.tsx`
  - graph-first workspace surface that presents routes, search, and inspector
- `apps/web/src/workspace-focus-view-model.ts`
  - workspace presentation state for focused graph and inspector layouts
- `apps/web/src/view-model.ts`
  - route, search, package, and inspector display helpers used by the workspace UI
- `apps/web/test/graph-first-workspace.spec.ts`
  - Playwright coverage for the current graph-first workspace flow
- `playwright.config.ts`
  - browser test harness for graph-first workspace verification
- `packages/storage/src/index.ts`
  - only if broader symbol language persistence or metadata handling is needed
- `packages/storage/test/storage.test.ts`
  - storage round-trip for PHP symbol language metadata

### New files to create

- `packages/indexer/src/languages/js-ts/analyzer.ts`
  - adapter over current JS/TS indexing behavior
- `packages/indexer/src/languages/php/analyzer.ts`
  - PHP analysis entrypoint and orchestration
- `packages/indexer/src/languages/php/ast.ts`
  - parser wrapper and AST adapter around `php-parser`
- `packages/indexer/src/languages/php/extract-symbols.ts`
  - PHP class, method, namespace, and function extraction
- `packages/indexer/src/languages/php/extract-references.ts`
  - PHP reference and dependency extraction
- `packages/indexer/src/languages/php/extract-query-hints.ts`
  - Eloquent and DB query hint extraction
- `packages/indexer/src/frameworks/php/laravel/detect.ts`
  - Laravel framework matching
- `packages/indexer/src/frameworks/php/laravel/extract-routes.ts`
  - Laravel route extraction
- `packages/indexer/src/frameworks/php/laravel/extract-flow.ts`
  - route-to-controller-to-service or query stitching
- `packages/indexer/src/frameworks/php/crudbooster/detect.ts`
  - CrudBooster matching
- `packages/indexer/src/frameworks/php/crudbooster/extract-modules.ts`
  - CrudBooster module and controller extraction
- `packages/indexer/src/frameworks/php/crudbooster/extract-flow.ts`
  - CrudBooster graph enrichment
- `fixtures/php-basic-workspace/`
  - baseline pure PHP fixture
- `fixtures/php-mixed-workspace/`
  - mixed repo fixture with JS/TS and PHP boundaries
- `fixtures/laravel-workspace/`
  - basic Laravel application fixture
- `fixtures/laravel-resource-workspace/`
  - resource-route-heavy fixture
- `fixtures/crudbooster-legacy-workspace/`
  - archived-style CrudBooster fixture based on public conventions

### Optional follow-up fixtures

- `fixtures/crudbooster-modern-workspace/`
  - only create if the team has a legally safe sample repository or a synthetic
    fixture that reflects public conventions without copying proprietary source

## Chunk 1: Detection and Indexer Boundary Cleanup

### Task 1: Fix mixed-language unit detection before adding PHP

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/indexer/src/workspace.ts`
- Modify: `packages/indexer/test/indexer.test.ts`

- [ ] **Step 1: Write failing tests for mixed-language unit classification**

Add tests covering:
- root workspace with nested non-JS markers does not collapse into useless
  `unknown` classification when strong child units exist
- PHP units can be classified as `php`
- existing JS/TS fixtures still classify as `js-ts`

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/indexer/test/indexer.test.ts`
Expected: FAIL because `UnitLanguage` does not yet support `php` and current
mixed-language scoring degrades some roots incorrectly

- [ ] **Step 3: Implement minimal type and discovery changes**

Update:
- `UnitLanguage` to include `php`
- symbol language enums as needed for persistence
- workspace scoring so non-JS markers do not automatically poison otherwise
  useful workspace roots
- PHP discovery signals such as `composer.json`, `artisan`, `bootstrap/app.php`,
  `routes/*.php`, and `app/**/*.php`

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/indexer/test/indexer.test.ts`
Expected: PASS for mixed-language and `php` classification assertions

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts packages/indexer/src/workspace.ts packages/indexer/test/indexer.test.ts
git commit -m "Add PHP unit detection and fix mixed-language scoring"
```

### Task 2: Reduce framework false positives before expanding framework coverage

**Files:**
- Modify: `packages/indexer/src/workspace.ts`
- Modify: `packages/indexer/test/indexer.test.ts`
- Modify: `packages/cli/test/cli.test.ts`

- [ ] **Step 1: Write failing tests for stricter framework matching**

Add assertions covering:
- GraphTrace source packages are not matched as application frameworks only
  because detector strings appear in source text
- Laravel requires strong project-layout or dependency signals
- CrudBooster requires strong convention signals

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/indexer/test/indexer.test.ts packages/cli/test/cli.test.ts`
Expected: FAIL because current framework detection is still string-heavy and
over-matches

- [ ] **Step 3: Tighten framework matching heuristics**

Prefer:
- dependency markers
- bootstrap files
- directory conventions
- route files
- framework-owned entrypoints

Avoid:
- matching internal detector code as app framework usage

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/indexer/test/indexer.test.ts packages/cli/test/cli.test.ts`
Expected: PASS with reduced false positives

- [ ] **Step 5: Commit**

```bash
git add packages/indexer/src/workspace.ts packages/indexer/test/indexer.test.ts packages/cli/test/cli.test.ts
git commit -m "Tighten framework matching heuristics"
```

### Task 3: Extract current JS/TS indexing into an internal analyzer boundary

**Files:**
- Create: `packages/indexer/src/languages/js-ts/analyzer.ts`
- Modify: `packages/indexer/src/index.ts`
- Modify: `packages/indexer/test/indexer.test.ts`

- [ ] **Step 1: Write failing regression tests around current JS/TS indexing behavior**

Add assertions covering:
- existing route, symbol, and query extraction still works after refactor
- orchestrator delegates to JS/TS path without changing output counts on current
  fixtures

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/indexer/test/indexer.test.ts`
Expected: FAIL once the refactor scaffolding is introduced but the analyzer
boundary is not fully wired

- [ ] **Step 3: Refactor `index.ts` into an orchestrator**

Move existing JS/TS-specific logic into a dedicated analyzer module and leave
`packages/indexer/src/index.ts` responsible for:
- config loading
- graph store lifecycle
- unit iteration
- analyzer selection
- fact persistence

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/indexer/test/indexer.test.ts`
Expected: PASS with no JS/TS regressions

- [ ] **Step 5: Commit**

```bash
git add packages/indexer/src/index.ts packages/indexer/src/languages/js-ts/analyzer.ts packages/indexer/test/indexer.test.ts
git commit -m "Refactor indexer into language analyzers"
```

## Chunk 2: PHP Language Foundation

### Task 4: Add PHP file discovery to watch and snapshot flows

**Files:**
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/test/watch.test.ts`
- Modify: `packages/cli/test/cli.test.ts`

- [ ] **Step 1: Write failing tests for PHP watch coverage**

Add tests covering:
- workspace snapshot includes `.php` files
- watch diff detects added, changed, and removed PHP files

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/cli/test/watch.test.ts packages/cli/test/cli.test.ts`
Expected: FAIL because current snapshot logic only includes JS/TS extensions

- [ ] **Step 3: Extend source extension handling**

Update watch and snapshot logic to include `.php` while preserving current JS/TS
behavior.

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/cli/test/watch.test.ts packages/cli/test/cli.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/test/watch.test.ts packages/cli/test/cli.test.ts
git commit -m "Track PHP files in watch snapshots"
```

### Task 5: Introduce PHP AST adapter and symbol extraction

**Files:**
- Create: `packages/indexer/src/languages/php/ast.ts`
- Create: `packages/indexer/src/languages/php/extract-symbols.ts`
- Create: `packages/indexer/src/languages/php/analyzer.ts`
- Modify: `packages/indexer/src/index.ts`
- Modify: `packages/indexer/test/indexer.test.ts`
- Create: `fixtures/php-basic-workspace/`

- [ ] **Step 1: Write failing PHP symbol extraction tests**

Add fixture assertions for:
- namespaces
- classes
- methods
- interfaces or traits
- stable symbol IDs for class and method declarations

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/indexer/test/indexer.test.ts`
Expected: FAIL because there is no PHP analyzer or parser integration yet

- [ ] **Step 3: Implement the PHP AST adapter and analyzer**

Use `php-parser` behind `ast.ts` and implement:
- parser wrapper
- AST normalization helpers
- symbol extraction for PHP classes, methods, and functions
- file registration into the graph store using existing normalized record shapes

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/indexer/test/indexer.test.ts`
Expected: PASS for baseline PHP symbol extraction

- [ ] **Step 5: Commit**

```bash
git add packages/indexer/src/index.ts packages/indexer/src/languages/php/ast.ts packages/indexer/src/languages/php/extract-symbols.ts packages/indexer/src/languages/php/analyzer.ts packages/indexer/test/indexer.test.ts fixtures/php-basic-workspace
git commit -m "Add baseline PHP symbol indexing"
```

### Task 6: Add PHP reference and query hint extraction

**Files:**
- Create: `packages/indexer/src/languages/php/extract-references.ts`
- Create: `packages/indexer/src/languages/php/extract-query-hints.ts`
- Modify: `packages/indexer/src/languages/php/analyzer.ts`
- Modify: `packages/indexer/test/indexer.test.ts`
- Modify: `packages/storage/test/storage.test.ts`
- Create: `fixtures/php-mixed-workspace/`

- [ ] **Step 1: Write failing tests for PHP references and query hints**

Add tests covering:
- `use`, `extends`, and static call relationships
- Eloquent-like or DB-like query hints
- mixed PHP and JS/TS workspace indexing remains stable

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/indexer/test/indexer.test.ts packages/storage/test/storage.test.ts`
Expected: FAIL because PHP references and query hints are not emitted yet

- [ ] **Step 3: Implement PHP references and query hint extraction**

Emit normalized:
- `references`
- `calls`
- `queries`

with conservative confidence and clear provenance.

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/indexer/test/indexer.test.ts packages/storage/test/storage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/indexer/src/languages/php/extract-references.ts packages/indexer/src/languages/php/extract-query-hints.ts packages/indexer/src/languages/php/analyzer.ts packages/indexer/test/indexer.test.ts packages/storage/test/storage.test.ts fixtures/php-mixed-workspace
git commit -m "Add PHP references and query hints"
```

## Chunk 3: Laravel Usable Graph

### Task 7: Detect Laravel units with strong project signals

**Files:**
- Create: `packages/indexer/src/frameworks/php/laravel/detect.ts`
- Modify: `packages/indexer/src/workspace.ts`
- Modify: `packages/indexer/test/indexer.test.ts`
- Create: `fixtures/laravel-workspace/`

- [ ] **Step 1: Write failing tests for Laravel detection**

Add assertions covering:
- Laravel fixture units match `framework:laravel`
- non-Laravel PHP fixtures do not match Laravel
- mixed workspaces keep correct unit boundaries

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/indexer/test/indexer.test.ts`
Expected: FAIL because Laravel framework matching does not exist yet

- [ ] **Step 3: Implement Laravel detection**

Use strong signals such as:
- Composer dependencies
- `artisan`
- `bootstrap/app.php`
- `routes/*.php`
- `app/Http/Controllers`

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/indexer/test/indexer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/indexer/src/frameworks/php/laravel/detect.ts packages/indexer/src/workspace.ts packages/indexer/test/indexer.test.ts fixtures/laravel-workspace
git commit -m "Detect Laravel framework units"
```

### Task 8: Extract Laravel routes, including resource routes

**Files:**
- Create: `packages/indexer/src/frameworks/php/laravel/extract-routes.ts`
- Modify: `packages/indexer/src/languages/php/analyzer.ts`
- Modify: `packages/indexer/test/indexer.test.ts`
- Create: `fixtures/laravel-resource-workspace/`
- Modify: `packages/query-engine/test/query-engine.test.ts`

- [ ] **Step 1: Write failing tests for Laravel route extraction**

Add assertions covering:
- explicit route methods
- grouped routes with prefixes
- controller routes
- `resource` and `apiResource` helpers

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/indexer/test/indexer.test.ts packages/query-engine/test/query-engine.test.ts`
Expected: FAIL because Laravel routes are not indexed yet

- [ ] **Step 3: Implement route extraction**

Emit normalized route facts with:
- method
- path
- handler name
- handler symbol ID
- file path
- framework provenance

Support the common Laravel helper patterns from the approved spec.

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/indexer/test/indexer.test.ts packages/query-engine/test/query-engine.test.ts`
Expected: PASS for Laravel route listing and search coverage

- [ ] **Step 5: Commit**

```bash
git add packages/indexer/src/frameworks/php/laravel/extract-routes.ts packages/indexer/src/languages/php/analyzer.ts packages/indexer/test/indexer.test.ts packages/query-engine/test/query-engine.test.ts fixtures/laravel-resource-workspace
git commit -m "Add Laravel route extraction"
```

### Task 9: Stitch Laravel route-to-controller-to-query flow

**Files:**
- Create: `packages/indexer/src/frameworks/php/laravel/extract-flow.ts`
- Modify: `packages/indexer/src/languages/php/analyzer.ts`
- Modify: `packages/indexer/test/indexer.test.ts`
- Modify: `packages/query-engine/test/query-engine.test.ts`
- Modify: `packages/mcp/test/mcp.test.ts`

- [ ] **Step 1: Write failing tests for Laravel flow and impact**

Add assertions covering:
- route to controller action edges
- controller action to service or model call edges when statically visible
- query hints reachable from a route flow

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/indexer/test/indexer.test.ts packages/query-engine/test/query-engine.test.ts packages/mcp/test/mcp.test.ts`
Expected: FAIL because Laravel flow stitching does not exist yet

- [ ] **Step 3: Implement conservative Laravel flow extraction**

Support:
- invokable controllers
- array action references
- string controller action references where obvious
- `$this` intra-controller method dispatch where statically visible
- implicit model binding only when backed by route params and type hints

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/indexer/test/indexer.test.ts packages/query-engine/test/query-engine.test.ts packages/mcp/test/mcp.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/indexer/src/frameworks/php/laravel/extract-flow.ts packages/indexer/src/languages/php/analyzer.ts packages/indexer/test/indexer.test.ts packages/query-engine/test/query-engine.test.ts packages/mcp/test/mcp.test.ts
git commit -m "Add Laravel route flow stitching"
```

## Chunk 4: CrudBooster Support and Hardening

### Task 10: Detect legacy CrudBooster conventions safely

**Files:**
- Create: `packages/indexer/src/frameworks/php/crudbooster/detect.ts`
- Modify: `packages/indexer/src/workspace.ts`
- Modify: `packages/indexer/test/indexer.test.ts`
- Create: `fixtures/crudbooster-legacy-workspace/`

- [ ] **Step 1: Write failing tests for CrudBooster detection**

Add assertions covering:
- legacy public conventions such as `CBController` inheritance or equivalent
  markers trigger `framework:crudbooster`
- ordinary Laravel fixtures do not match CrudBooster accidentally

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/indexer/test/indexer.test.ts`
Expected: FAIL because CrudBooster detection does not exist yet

- [ ] **Step 3: Implement legacy CrudBooster detection**

Use strong convention signals from public knowledge only. Do not copy
proprietary source. Favor explainable matching over broad heuristics.

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/indexer/test/indexer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/indexer/src/frameworks/php/crudbooster/detect.ts packages/indexer/src/workspace.ts packages/indexer/test/indexer.test.ts fixtures/crudbooster-legacy-workspace
git commit -m "Detect CrudBooster legacy conventions"
```

### Task 11: Extract CrudBooster modules, controllers, and graph relationships

**Files:**
- Create: `packages/indexer/src/frameworks/php/crudbooster/extract-modules.ts`
- Create: `packages/indexer/src/frameworks/php/crudbooster/extract-flow.ts`
- Modify: `packages/indexer/src/languages/php/analyzer.ts`
- Modify: `packages/indexer/test/indexer.test.ts`
- Modify: `packages/query-engine/test/query-engine.test.ts`

- [ ] **Step 1: Write failing tests for CrudBooster module graph extraction**

Add assertions covering:
- module or admin controller discovery
- controller to model relationships where visible
- CRUD lifecycle method symbols when conventional names exist

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/indexer/test/indexer.test.ts packages/query-engine/test/query-engine.test.ts`
Expected: FAIL because CrudBooster graph extraction does not exist yet

- [ ] **Step 3: Implement module and flow extraction**

Emit normalized graph facts for:
- controllers
- modules
- model relationships
- route or admin entrypoint relationships where recoverable

Keep provenance explicit because some of these relationships will be inferred
from framework conventions.

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/indexer/test/indexer.test.ts packages/query-engine/test/query-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/indexer/src/frameworks/php/crudbooster/extract-modules.ts packages/indexer/src/frameworks/php/crudbooster/extract-flow.ts packages/indexer/src/languages/php/analyzer.ts packages/indexer/test/indexer.test.ts packages/query-engine/test/query-engine.test.ts
git commit -m "Add CrudBooster graph extraction"
```

### Task 12: Harden generic query surfaces over PHP and Laravel facts

**Files:**
- Modify: `packages/query-engine/src/index.ts`
- Modify: `packages/query-engine/test/query-engine.test.ts`
- Modify: `packages/mcp/test/mcp.test.ts`
- Modify: `packages/server/test/server.test.ts`
- Modify: `packages/server/test/web-ui.test.ts`
- Modify: `apps/web/src/workspace-screen.tsx`
- Modify: `apps/web/src/workspace-focus-view-model.ts`
- Modify: `apps/web/src/view-model.ts`
- Modify: `apps/web/test/graph-first-workspace.spec.ts`
- Modify: `playwright.config.ts`

- [ ] **Step 1: Write failing tests for end-to-end PHP query surfaces**

Add assertions covering:
- `search` finds PHP classes and methods
- `routes` lists Laravel routes
- `impact` and `flow` operate on PHP facts without JS/TS assumptions
- MCP and server responses surface PHP-derived graph data without shape changes
- the graph-first workspace UI continues to prioritize graph and inspector flows
  correctly when PHP or Laravel-backed results are present

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test packages/query-engine/test/query-engine.test.ts packages/mcp/test/mcp.test.ts packages/server/test/server.test.ts packages/server/test/web-ui.test.ts && pnpm exec playwright test apps/web/test/graph-first-workspace.spec.ts`
Expected: FAIL if any consumer still assumes JS/TS-only language values or route
patterns

- [ ] **Step 3: Make minimal generic consumer fixes**

Do not fork PHP behavior in multiple consumers unless strictly necessary. Prefer
generic handling of shared graph facts and optional language labels only where
display text needs them. If the workspace-focused UI needs adjustment, prefer
fixes in `workspace-screen.tsx`, `workspace-focus-view-model.ts`, or shared
workspace view-model helpers over ad hoc patches in tests.

- [ ] **Step 4: Re-run tests to verify they pass**

Run: `pnpm test packages/query-engine/test/query-engine.test.ts packages/mcp/test/mcp.test.ts packages/server/test/server.test.ts packages/server/test/web-ui.test.ts && pnpm exec playwright test apps/web/test/graph-first-workspace.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/query-engine/src/index.ts packages/query-engine/test/query-engine.test.ts packages/mcp/test/mcp.test.ts packages/server/test/server.test.ts packages/server/test/web-ui.test.ts apps/web/src/workspace-screen.tsx apps/web/src/workspace-focus-view-model.ts apps/web/src/view-model.ts apps/web/test/graph-first-workspace.spec.ts playwright.config.ts
git commit -m "Harden query surfaces for PHP frameworks"
```

## Final Verification Checklist

- [ ] Run targeted indexer, query, MCP, server, and CLI tests after each chunk.
- [ ] Run full workspace verification before closing the feature:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright test apps/web/test/graph-first-workspace.spec.ts
```

Expected:
- lint exits `0`
- typecheck exits `0`
- test exits `0`
- Playwright graph-first workspace test exits `0`

- [ ] Run manual smoke checks on GraphTrace CLI against:
  - the GraphTrace repo itself
  - `fixtures/laravel-workspace`
  - `fixtures/crudbooster-legacy-workspace`

Commands:

```bash
pnpm exec tsx packages/cli/src/bin.ts doctor --units
pnpm exec tsx packages/cli/src/bin.ts doctor --plugins
pnpm exec tsx packages/cli/src/bin.ts index --full --json
pnpm exec tsx packages/cli/src/bin.ts routes
pnpm exec tsx packages/cli/src/bin.ts search UserController --kind symbol
```

Expected:
- PHP units appear with `language: "php"`
- Laravel and CrudBooster plugin matches are explainable
- route and symbol search return useful PHP results
