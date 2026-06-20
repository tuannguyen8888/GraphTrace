# Search Replay Benchmark

This benchmark captures historical GraphTrace search behavior that caused agents to fall back to broad file search. It is intentionally small and deterministic so search quality can be tracked before changing ranking or query rewriting.

## Run

```bash
pnpm vitest run packages/query-engine/test/search-replay.test.ts
```

The test exercises `evaluateSearchReplay` against `fixtures/express-prisma-workspace` and reports whether each replay query has a useful top-k match.

## Baseline

Current baseline from 2026-06-19:

```json
{
  "total": 4,
  "hits": 1,
  "misses": 3,
  "hitRate": 0.25,
  "missedCaseIds": [
    "express-user-route-intent",
    "next-session-data-route-intent",
    "laravel-admin-users-controller-intent"
  ]
}
```

The exact-symbol control query passes, while the long multi-concept intent queries miss. Improving those misses without regressing the control case is the next search-quality target.
