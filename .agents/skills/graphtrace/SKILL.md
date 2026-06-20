---
name: graphtrace
description: Use when investigating repository structure, symbol context, route flow, impact, dependencies, package ownership, or GraphTrace MCP freshness before broad source scans.
---

# GraphTrace

## Overview

Use GraphTrace as a fast first pass for repo-local context. Start with freshness,
run short focused searches, resolve exact symbols/routes, inspect bounded execution
or impact graphs, then fall back to source reads only for the remaining gap.

## When to Use

- The question is about callers, callees, route flow, package ownership,
  dependencies, or blast radius.
- The task would otherwise require broad grep, many file opens, or guessing where
  behavior lives.
- You need confidence-aware evidence before deciding what to edit or retest.

Do not use GraphTrace as the only source of truth when results are stale,
partial, truncated, inferred in a way that matters, or outside indexed coverage.

## Decision Tree

1. Freshness: `get_status` -> `run_index` only when missing, stale, or after
   significant workspace changes.
2. Search: use focused `search_code` queries with one concept per query.
3. Symbol: resolve with `get_symbol_context` or exact symbol tools.
4. Graph: use `graphtrace_get_execution_context` for caller/callee/sink flow or
   `graphtrace_get_symbol_impact` for blast radius.
5. Fallback: targeted source read/`rg` only for the exact gap GraphTrace exposed.

Main path: `get_status` -> focused `search_code` -> `get_symbol_context` ->
`graphtrace_get_execution_context` / `graphtrace_get_symbol_impact` -> targeted
source fallback.

## Query Splitting

- Split multi-concept prompts into short queries; use one route path, symbol name,
  file path, package, or framework term at a time.
- Bad: `React form state Next route Laravel permission business flow`.
- Good: `handleSubmit`, `/api/users`, `AdminUsersController`, `PermissionService`.
- Stop after the first useful hits, resolve the exact symbol/route, then switch to
  graph tools instead of issuing another broad search.

## Trust And Fallback

- Trust `proven` edges for orientation, but still read source before risky edits.
- Confirm `inferred-strong` edges when they affect implementation, testing, or a
  user-facing claim.
- Treat `inferred-weak` as a lead, not evidence; use `graphtrace_explain_edge` or
  read source before relying on it.
- If results are empty, partial, stale, or truncated, check `get_status`, re-index
  when appropriate, then retry one narrower query.
- Stop expanding GraphTrace when one or two targeted file reads would answer the
  remaining question faster.

## Quick Reference

- `list_workspaces`: resolve workspace ambiguity; pass `workspaceId` afterward.
- `get_status`: freshness, coverage, and whether `run_index` is justified.
- `search_code`: short first-pass search across symbols, files, routes, packages.
- `get_symbol_context`: disambiguate a symbol hit before graph traversal.
- `graphtrace_get_execution_context`: bounded caller -> callee -> sink graph.
- `graphtrace_get_symbol_impact`: bounded impact graph for symbol changes.
- `graphtrace_explain_edge`: provenance for important inferred edges.
- `get_routes` + `get_data_flow`: route and request-to-query investigation.

## Common Mistakes

- Running one long multi-topic query instead of splitting concepts.
- Repeating broad searches after a good hit instead of resolving the symbol.
- Treating inferred edges as guaranteed execution.
- Expanding a truncated graph when a targeted source read is cheaper and clearer.
- Forgetting `list_workspaces`/`workspaceId` when multiple repos are registered.
