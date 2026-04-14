# PHP, Laravel, and CrudBooster Design

Date: 2026-04-12

## Summary

GraphTrace should evolve from a JS/TS-only indexer into a language-aware graph
engine that can deeply analyze PHP repositories, with Laravel as the first
framework target and CrudBooster as a Laravel-specialized layer.

The immediate product goal is not perfect PHP static analysis. The goal is a
usable repository graph that helps developers and AI agents answer practical
questions in Laravel-heavy codebases:

- which PHP units exist in this workspace
- which routes map to which controllers or actions
- which services, models, queries, and framework entrypoints a change may affect
- how CrudBooster-generated or convention-driven modules fit into that graph

This design keeps GraphTrace's existing query, MCP, server, and web surfaces as
stable as possible by extending normalized facts rather than inventing a second
backend for PHP.

## Problem

Today GraphTrace is structurally biased toward TypeScript and JavaScript:

- workspace detection only deep-indexes `language === "js-ts"`
- the indexer constructs a TypeScript program as the root analysis primitive
- symbol extraction, references, and execution flow are all AST logic built on
  the TypeScript compiler API
- framework detection is implemented through heuristics directly in the current
  indexer flow

This creates three concrete blockers for PHP, Laravel, and CrudBooster support:

1. PHP cannot become a first-class indexed language because it is currently
   collapsed into `unknown`.
2. Laravel support cannot be added cleanly without mixing more framework logic
   into the JS/TS-centric core.
3. CrudBooster support would be fragile if built on top of current framework
   detection because the detector already produces false positives in mixed or
   tooling-heavy repositories.

Self-host analysis of the GraphTrace repository exposed the same structural
issues:

- the workspace root can degrade to `unknown` because of unrelated non-JS
  markers in fixtures
- framework matching can fire on internal source code that merely contains
  detector strings, not on actual app usage

Those two issues must be addressed before Laravel and CrudBooster support can be
trusted.

## Goals

- Make PHP a first-class language in workspace discovery, indexing, and graph
  output.
- Support mixed-language repositories without collapsing the root workspace into
  an unhelpful `unknown` bucket.
- Support Laravel route, controller, model, service, and query graphing well
  enough for `search`, `routes`, `impact`, and `flow` to be practically useful.
- Add CrudBooster-aware extraction as a specialized layer on top of Laravel.
- Preserve the current GraphTrace data model shape wherever possible so CLI,
  MCP, server, and web consumers can reuse existing contracts.
- Refactor the indexer enough to support multiple languages cleanly without
  requiring a full external plugin system in this milestone.

## Non-Goals

- Building a fully precise whole-program PHP analyzer.
- Solving every dynamic Laravel container or facade indirection in v1.
- Deep Blade, Livewire, or frontend template graphing in v1.
- Shipping a general external plugin runtime for third parties in this phase.
- Depending on proprietary CrudBooster source code that cannot live in this
  repository.

## Scope

### Required v1 outcomes

- `graphtrace doctor --units --plugins` recognizes PHP units and Laravel or
  CrudBooster matches.
- `graphtrace routes` returns Laravel routes from common conventions and
  resource-route helpers.
- `graphtrace search --kind symbol` finds PHP classes and methods with stable
  identities.
- `graphtrace flow` can traverse common Laravel paths such as route ->
  controller action -> service/model/query.
- `graphtrace impact` returns useful file and symbol impact for ordinary Laravel
  classes and methods.

### Deferred outcomes

- Perfect service-container resolution.
- Full event bus, queue, and broadcast semantic modeling.
- Exact support for all proprietary CrudBooster internals without a real sample
  repository.

## Design Principles

- First-class language support beats one-off heuristics.
- Practical graph utility beats semantic perfection.
- Mixed-language workspaces must remain explainable.
- Framework matches must be stricter and less noisy than they are today.
- Core graph facts stay normalized so one query engine can serve all languages.
- Language and framework logic should move behind internal capability boundaries
  even if the runtime remains first-party and in-repo.

## Architecture Direction

GraphTrace should adopt an internal capability-oriented indexer rather than
continuing to grow a single JS/TS-centric pipeline.

### Core orchestration

`packages/indexer/src/index.ts` should become an orchestrator that:

- inspects workspace units
- chooses the correct language analyzer per unit
- runs framework matchers for that language
- runs framework-specific extractors
- merges normalized facts
- persists facts through the existing graph store

### Capability groups

The internal boundaries should be:

- workspace detector
- language analyzer
- framework matcher
- fact extractor
- linker or enricher

This is intentionally aligned with the existing plugin architecture design doc,
but without requiring runtime external plugin loading.

### Language-specific modules

The indexer should split into language and framework folders:

- `packages/indexer/src/languages/js-ts/*`
- `packages/indexer/src/languages/php/*`
- `packages/indexer/src/frameworks/js/*`
- `packages/indexer/src/frameworks/php/laravel/*`
- `packages/indexer/src/frameworks/php/crudbooster/*`

The existing JS/TS code paths should be moved into the JS/TS subtree with
minimal behavioral changes first. PHP should then be added as a parallel path.

## Workspace and Unit Model

The current unit model is close to usable and should be extended rather than
replaced.

### Required type changes

- `UnitLanguage` must support `php`.
- symbol language metadata must support `php`.
- unit plugin matches must be able to record `language:php`,
  `framework:laravel`, and `framework:crudbooster`.

### Discovery improvements

Workspace discovery should:

- score PHP markers separately from JS/TS markers
- avoid downgrading a workspace root to `unknown` merely because unrelated
  nested markers exist
- allow a workspace to contain both `js-ts` and `php` full-index units
- treat `composer.json`, `artisan`, `bootstrap/app.php`, `routes/*.php`, and
  `app/**/*.php` as strong Laravel signals

### Framework detection improvements

Framework detection should stop relying so heavily on generic source-string
matches. Stronger signals should come from:

- Composer dependencies
- Laravel file layout markers
- bootstrapping files
- route registration patterns
- CrudBooster-specific namespaces, directories, base classes, or generated
  module conventions

## Parser Strategy

The recommended PHP parser for v1 is `php-parser` on Node.

Reasons:

- fits the existing TypeScript and Node monorepo
- avoids native build complexity in CLI and watch flows
- good enough to support static AST extraction for class, method, namespace,
  import, and common call patterns
- can be hidden behind a small AST adapter so GraphTrace can swap to
  `tree-sitter-php` later if incremental parsing or performance becomes a
  priority

GraphTrace should not expose the parser choice as a user-facing abstraction in
this phase.

## PHP Semantic Model

### Symbol coverage

PHP symbol extraction should include:

- namespaces
- classes
- interfaces
- traits
- enums
- top-level functions
- class methods
- important class constants and properties when useful for references

Stable symbol IDs should follow the same broad philosophy as current symbol IDs:

- file path
- symbol local name or owner-qualified name

For PHP this means typical IDs like:

- `symbol:app/Http/Controllers/UserController.php#UserController`
- `symbol:app/Http/Controllers/UserController.php#UserController.index`
- `symbol:app/Models/User.php#User`

### Reference and dependency coverage

PHP extraction should emit useful edges from:

- `use` imports
- `extends`
- `implements`
- trait inclusion
- `new ClassName(...)`
- static calls like `Foo::bar()`
- method parameter type hints
- return type hints
- obvious intra-file method calls on `$this`

The v1 objective is a practical graph, not complete interprocedural precision.

### Query coverage

Query hint extraction should target:

- Eloquent chains such as `User::query()->where(...)->get()`
- common Eloquent shortcuts like `find`, `findOrFail`, `first`, `firstOrFail`,
  `create`, `update`, `delete`
- DB facade calls
- query builder chains
- raw SQL helpers where clearly detectable

## Laravel Semantic Model

### Framework detection

Laravel should match when a unit has a meaningful combination of:

- Composer dependency on `laravel/framework` or `illuminate/*`
- `artisan`
- `bootstrap/app.php`
- `routes/web.php`, `routes/api.php`, or equivalent route files
- `app/Http/Controllers`

### Route extraction

Laravel route extraction should support:

- explicit `Route::get/post/put/patch/delete/options`
- `match` and `any`
- grouped routes with `prefix`, `name`, `middleware`, and `controller`
- controller routes declared as arrays or string actions
- invokable controllers
- closure handlers
- `resource`, `resources`, `apiResource`, `apiResources`
- `singleton` and `apiSingleton`

The extracted route fact format should stay aligned with the existing route
model:

- route ID
- method
- path
- handler name
- handler symbol ID
- file path
- framework
- unit ID
- confidence

### Flow extraction

Laravel execution flow should connect:

- route to controller action
- controller action to service class or method when statically visible
- controller action to model or query hints
- route parameters to action type hints when implicit model binding is obvious

The graph should prefer conservative proven edges and allow inferred edges only
when the evidence is clear enough to explain.

### Optional route-list enrichment

GraphTrace may later add optional enrichment from `php artisan route:list` when
the command is available in a local workspace, but this must remain optional.
Static extraction must stand on its own because CLI command execution is not
always safe, cheap, or deterministic.

## CrudBooster Semantic Model

CrudBooster should be modeled as a Laravel-specialized framework layer rather
than a separate language.

### Two support modes

#### `crudbooster-legacy`

Targets public and archived OSS conventions such as:

- `CBController` inheritance
- `cbInit` configuration methods
- CRUD-oriented admin module controllers
- generated module conventions visible from source structure

#### `crudbooster-modern`

Targets public-site conventions and user-supplied sample repositories for newer
versions, including:

- `app/Cb/Modules/*`
- `app/Cb/Types/*`
- custom type registration
- generated module structures
- API builder or admin module conventions that can be seen from source

Because the modern product is not fully public source, GraphTrace should treat
this mode as convention-driven and sample-driven support, not a completeness
guarantee.

### Facts to extract

CrudBooster extraction should produce:

- module/controller discovery
- module-to-controller relationships
- module-to-model relationships when visible
- generated admin route patterns where recoverable
- CRUD lifecycle method symbols where conventional names exist

## Graph Model Impact

The core graph store and query engine should stay normalized.

No new parallel PHP-only database model should be created.

The existing entities remain sufficient with type extensions:

- units
- files
- symbols
- routes
- edges
- query hints

The main changes are:

- broader language enums
- broader framework provenance
- broader symbol extraction coverage

## CLI, MCP, Server, and Web Impact

The preferred path is compatibility-first.

### CLI

`doctor`, `index`, `status`, `search`, `routes`, `deps`, `impact`, and `flow`
should continue to work without mandatory new flags.

Possible later additions:

- `--language`
- `--framework`

These should be optional filters, not required for PHP support.

### MCP

Existing MCP tools should benefit automatically once PHP facts are indexed into
the shared graph model.

### Server and Web UI

The current server and UI layers should require only minimal changes if they
already render generic route, file, and symbol facts.

The biggest benefit should come from better indexed data, not a rewritten UI.

However, the current `main` branch now uses a graph-first workspace UI with
dedicated workspace presentation and Playwright coverage. PHP support should
therefore be verified against the workspace-focused UI flow as it exists today,
not only against server-side or view-model-only tests.

## Rollout Strategy

### Phase 0

- Fix mixed-language workspace detection and current framework false positives.

### Phase 1

- Refactor the current JS/TS indexer into internal capability boundaries.

### Phase 2

- Add PHP language support with symbol, import/reference, and query extraction.

### Phase 3

- Add Laravel route and controller flow extraction.

### Phase 4

- Add CrudBooster extraction and sample-driven hardening.

### Phase 5

- Harden query, MCP, server, and web behaviors over the new PHP facts.

## Risks

- Laravel route configuration can be highly dynamic.
- Container and facade magic can hide real dependencies.
- CrudBooster modern coverage may stall without a real sample repository.
- PHP support may worsen false positives if framework detection is not tightened
  first.
- Watch mode and snapshot logic currently assume JS/TS file extensions and will
  silently miss PHP unless explicitly updated.

## Mitigations

- Keep the graph conservative and evidence-based.
- Use fixture-driven coverage for ordinary Laravel patterns before unusual ones.
- Support optional enrichment later, but do not depend on runtime shelling out.
- Land Phase 0 detection cleanup before broad PHP extraction.
- Add fixture workspaces for basic PHP, Laravel, and CrudBooster patterns.

## Acceptance Criteria

- GraphTrace recognizes PHP units as first-class units instead of `unknown`.
- Mixed workspaces with JS/TS and PHP remain explainable in `doctor --units`.
- Laravel route extraction works for common route conventions and resource
  helpers.
- PHP class and method symbols appear in search and can participate in impact
  and flow output.
- Query hints capture useful Eloquent and DB access patterns.
- CrudBooster repositories gain usable module and controller graph coverage from
  source conventions.
- Existing JS/TS behavior remains intact after the internal refactor.
