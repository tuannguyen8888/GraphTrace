---
name: graphtrace
description: Use when investigating a JS or TS workspace with GraphTrace and you need symbol-level callers, callees, impact, or confidence-aware execution paths before reading many files manually
---

# GraphTrace

## Overview

Use GraphTrace as the first repo-local investigation pass for TypeScript and JavaScript
code. Start from a symbol, inspect bounded execution or impact context, then fall back
to direct code reads only where confidence or truncation makes the graph insufficient.

## When to Use

- The question is about "who calls this", "what does this trigger", or "what breaks if
  I change this function?"
- The workspace is JS/TS and GraphTrace indexing is available.
- You need repo-local execution context faster than manually hopping files.

Do not use this as the only source of truth when:

- the graph is truncated around the part you care about
- the only remaining edges are inferred and materially affect the answer
- the target is outside JS/TS coverage or outside the indexed workspace

## Workflow

1. Find the symbol.
   Use `graphtrace_search_symbols` when you only know a rough name.
   Use `graphtrace_get_symbol` when you know `symbolId`, `filePath + symbolName`, or
   `filePath + line + column`.

2. Pick the right graph.
   Use `graphtrace_get_execution_context` for caller -> callee -> sink paths.
   Use `graphtrace_get_symbol_impact` for "what depends on this" style questions.
   Use symbol neighbors only when you want a zero-hop local picture.

3. Read confidence before making claims.
   Treat `proven` as directly resolved.
   Treat `inferred-strong` as useful but still worth source confirmation for edits or
   risk assessment.
   Treat `inferred-weak` as a lead, not evidence.

4. Explain suspicious edges.
   Use `graphtrace_explain_edge` whenever an inferred edge changes the answer or when
   you need provenance/evidence for a user-facing explanation.

5. Fall back cleanly.
   If the graph is truncated, expand the query budget or read the relevant files.
   If confidence stays low, say so explicitly and confirm in source before concluding.

## Quick Reference

- `graphtrace_search_symbols`: broad symbol search with a zero-hop envelope.
- `graphtrace_get_symbol`: exact symbol resolution.
- `graphtrace_get_execution_context`: bounded caller/callee/sink graph.
- `graphtrace_get_symbol_impact`: bounded impact graph with truncation metadata.
- `graphtrace_explain_edge`: provenance for a specific edge.

## Operating Rules

- Prefer symbol-level investigation before broad file search when the task is function
  or method scoped.
- Keep graph requests bounded first; only raise `maxNodes` / `maxEdges` after the first
  useful pass.
- Ignore library noise; GraphTrace should stay focused on workspace-local symbols.
- When a low-confidence edge is critical, quote the source file path and confirm by
  reading code instead of repeating the graph as fact.

## Common Mistakes

- Jumping straight from search results to conclusions without resolving the exact
  symbol.
- Treating inferred edges as guaranteed execution.
- Continuing to expand a truncated graph when one or two source files would answer the
  question faster.
