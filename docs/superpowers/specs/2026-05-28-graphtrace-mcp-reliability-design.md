# GraphTrace MCP Reliability & Coverage Improvement

**Date:** 2026-05-28  
**Status:** Draft  
**Priority:** P0-P3 (phased rollout)

## Context

GraphTrace MCP hiện đang gặp vấn đề tin cậy và coverage khiến agent thường fallback sang `rg`/đọc file thay vì dùng graph data. Phân tích 37 session Codex cho thấy:

- 606 MCP tool calls, 45 errors (7.4% error rate)
- Lỗi chính: DB bootstrap fail, workspace ambiguous, version drift, sparse results cho non-JS
- Agent pattern: thử GraphTrace → fail/sparse → fallback `rg` → mất niềm tin

## Goals

1. **P0:** Ổn định runtime - zero DB bootstrap errors, version/schema consistency
2. **P1:** Workspace UX - zero ambiguous errors, explicit workspace selection
3. **P2:** Reduce friction - symbol API flexible, sparse results actionable
4. **P3:** Quality feedback - telemetry, regression suite từ real sessions

## Non-Goals

- Không làm lại indexer core
- Không support thêm language mới ngoài PHP/Laravel minimal
- Không thay đổi CLI interface hiện tại

## Design

### P0: Runtime Stability

**Problem:**
- Global `graphtrace@1.5.2` vs repo `1.6.2` → schema mismatch
- MCP cố tạo `/.graphtrace` khi `workspaceRoot` undefined
- `unable to open database file` khi DB path sai

**Solution:**

1. **Version doctor command:**
```bash
graphtrace agent doctor
```
Output:
```
GraphTrace Agent Doctor
=======================
CLI version: 1.6.2
Global binary: /opt/homebrew/bin/graphtrace
MCP schema version: 1.6.2
Active MCP config: /Users/.../config.toml
  - command: graphtrace
  - args: ["mcp"]
  - cwd: /Users/.../GraphTrace
  - home: /Users/.../.graphtrace

Workspace resolution:
  - Current cwd: /Users/.../GraphTrace
  - Registered workspaces: 8
  - Auto-selected: graphtrace-44987867 (GraphTrace)
  - Status: ✓ index fresh (2026-05-27)

Issues:
  ⚠ Global binary version (1.5.2) != repo version (1.6.2)
  → Run: npm install -g graphtrace@latest
```

2. **MCP bootstrap safety:**
```typescript
// packages/mcp/src/index.ts
function resolveWorkspaceContext(hint: WorkspaceResolutionHint): ResolvedWorkspaceContext {
  const homeDir = options.homeDir ?? homedir();
  const workspaceRoot = options.workspaceRoot;
  
  // NEVER create /.graphtrace
  if (!workspaceRoot || workspaceRoot === '/') {
    throw new Error(
      `GraphTrace MCP requires valid workspaceRoot. Got: ${workspaceRoot}. ` +
      `Check MCP config 'cwd' or pass --home flag.`
    );
  }
  
  // ... rest
}
```

3. **Config validation:**
```toml
# .codex/config.toml
[mcp_servers.graphtrace]
command = "graphtrace"
args = ["mcp", "--home", "/Users/tuannguyen8888/.graphtrace"]
# Optional: pin to local build
# command = "/Users/.../GraphTrace/packages/cli/dist/bin.js"
```

**Acceptance:**
- `graphtrace agent doctor` shows version, config, workspace state
- Zero `/.graphtrace` errors
- Zero `unable to open database` errors when workspace valid

---

### P1: Workspace Resolution UX

**Problem:**
- `get_status` fails với "could not resolve workspace" nhưng không trả candidates
- Agent không biết cần pass `workspaceId`
- MCP auto-select workspace sai (chọn `telecodex` khi đang ở repo `GraphTrace`)

**Solution:**

1. **Explicit workspace in all tools:**
```typescript
// All MCP tools accept optional workspaceId
server.registerTool("get_status", {
  inputSchema: {
    workspaceId: z.string().optional(),
    workspaceRoot: z.string().optional(), // fallback for legacy
  }
}, async ({ workspaceId, workspaceRoot }) => {
  // ...
});
```

2. **Better error messages:**
```typescript
function ambiguousWorkspaceError(workspaces: WorkspaceRecord[]): Error {
  const candidates = workspaces.map(w => 
    `  - ${w.id} (${w.label}) at ${w.canonicalRootPath}`
  ).join('\n');
  
  return new Error(
    `GraphTrace MCP could not resolve workspace automatically.\n` +
    `Pass workspaceId or workspaceRoot explicitly.\n\n` +
    `Registered workspaces:\n${candidates}\n\n` +
    `Hint: Use list_workspaces tool to see all options.`
  );
}
```

3. **Smarter auto-selection:**
```typescript
function resolveWorkspaceContext(hint: WorkspaceResolutionHint): ResolvedWorkspaceContext {
  // Priority:
  // 1. Explicit workspaceId
  // 2. Explicit workspaceRoot
  // 3. Match cwd against registered workspaces
  // 4. Single registered workspace
  // 5. Legacy local .graphtrace/index.db
  // 6. Error with candidates
  
  if (hint.workspaceId) {
    return getById(hint.workspaceId);
  }
  
  if (hint.workspaceRoot) {
    return getByRoot(hint.workspaceRoot);
  }
  
  const cwd = options.workspaceRoot; // from MCP startup
  const matchingByCwd = registeredWorkspaces.filter(w => 
    cwd.startsWith(w.canonicalRootPath)
  );
  
  if (matchingByCwd.length === 1) {
    return matchingByCwd[0];
  }
  
  // ... rest
}
```

**Acceptance:**
- Zero ambiguous errors without helpful message
- `get_status` without args works when cwd matches exactly one workspace
- Error messages include `list_workspaces` hint

---

### P2: Reduce Friction

**Problem:**
- `graphtrace_get_execution_context` requires `filePath + symbolName` but agent often only has `symbolName`
- Laravel/PHP repos return sparse/empty results
- Agent không biết khi nào nên fallback

**Solution:**

1. **Flexible symbol locator:**
```typescript
server.registerTool("graphtrace_get_execution_context", {
  inputSchema: {
    workspaceId: z.string().optional(),
    // Accept any of:
    symbolId: z.string().optional(),
    symbolName: z.string().optional(), // search first if alone
    filePath: z.string().optional(),
    line: z.number().optional(),
    column: z.number().optional(),
  }
}, async (args) => {
  if (args.symbolName && !args.filePath && !args.symbolId) {
    // Auto-search and disambiguate
    const candidates = engine.searchSymbols(args.symbolName);
    if (candidates.items.length === 0) {
      return asToolResult({
        error: `No symbol found matching "${args.symbolName}"`,
        hint: "Try search_code or graphtrace_search_symbols first"
      });
    }
    if (candidates.items.length === 1) {
      args.symbolId = candidates.items[0].id;
    } else {
      return asToolResult({
        error: `Multiple symbols match "${args.symbolName}"`,
        candidates: candidates.items.slice(0, 5),
        hint: "Pass symbolId or filePath to disambiguate"
      });
    }
  }
  // ... rest
});
```

2. **Sparse result metadata:**
```typescript
interface GraphEnvelope {
  items: Item[];
  graph: Graph;
  coverage?: {
    language: string;
    indexingMode: 'full' | 'shallow' | 'skipped';
    warnings?: string[];
    fallbackHints?: string[];
  };
}

// Example for Laravel repo:
{
  items: [...],
  coverage: {
    language: 'unknown',
    indexingMode: 'shallow',
    warnings: [
      'PHP/Laravel not fully indexed',
      'Routes may be incomplete'
    ],
    fallbackHints: [
      'Use rg "Route::" routes/ for route definitions',
      'Use rg "class.*Controller" app/Http/Controllers for handlers'
    ]
  }
}
```

3. **Minimal PHP/Laravel support:**
```typescript
// packages/indexer/src/php-routes.ts
export function extractLaravelRoutes(
  workspaceRoot: string,
  routesDir: string
): RouteItem[] {
  // Parse routes/*.php for Route::get/post/...
  // Extract controller@method
  // Return RouteItem[] with framework: 'laravel'
}

// packages/indexer/src/index.ts
if (matchedPluginIds.has('framework:laravel')) {
  routes.push(...extractLaravelRoutes(workspaceRoot, 'routes'));
}
```

**Acceptance:**
- `graphtrace_get_execution_context` với chỉ `symbolName` trả candidates hoặc auto-resolve
- Laravel repos trả `coverage.warnings` + `fallbackHints`
- Laravel routes cơ bản được index (GET/POST path + controller)

---

### P3: Quality Feedback

**Problem:**
- Không biết tool nào fail nhiều
- Không biết khi nào agent fallback sau GraphTrace
- Không có regression suite cho MCP UX

**Solution:**

1. **MCP telemetry:**
```typescript
// packages/mcp/src/telemetry.ts
interface McpCallLog {
  timestamp: string;
  tool: string;
  args: Record<string, unknown>;
  duration_ms: number;
  status: 'success' | 'error' | 'empty';
  error?: string;
  result_size?: number;
}

// Log to ~/.graphtrace/mcp-telemetry.ndjson
// Opt-in via env var GRAPHTRACE_MCP_TELEMETRY=1
```

2. **Session analysis tool:**
```bash
graphtrace analyze-sessions /Users/.../sessions/2026/05
```
Output:
```
GraphTrace MCP Session Analysis
================================
Period: 2026-05-01 to 2026-05-28
Sessions: 37
Total calls: 606
Errors: 45 (7.4%)

Top errors:
  - unable to open database: 24
  - workspace ambiguous: 12
  - Expected symbolId: 4

Tools with >10% error rate:
  - get_status: 16/82 (19.5%)
  - graphtrace_get_execution_context: 4/24 (16.7%)

Fallback patterns:
  - GraphTrace → rg: 89 occurrences
  - GraphTrace → read file: 67 occurrences
```

3. **MCP integration tests:**
```typescript
// packages/mcp/test/mcp-reliability.test.ts
describe('MCP reliability', () => {
  test('get_status without workspaceId when single workspace', async () => {
    // ...
  });
  
  test('get_status with ambiguous workspaces returns candidates', async () => {
    // ...
  });
  
  test('graphtrace_get_execution_context with symbolName-only', async () => {
    // ...
  });
  
  test('Laravel repo returns coverage warnings', async () => {
    // ...
  });
});
```

**Acceptance:**
- Telemetry logs MCP calls khi opt-in
- `graphtrace analyze-sessions` báo cáo error rate, fallback patterns
- MCP test suite cover các issue đã gặp

---

## Implementation Plan

### Phase 1: P0 (Week 1)
1. Add `graphtrace agent doctor` command
2. Fix MCP bootstrap validation (no `/.graphtrace`)
3. Add version/schema checks
4. Update global package to 1.6.2
5. Test: zero bootstrap errors

### Phase 2: P1 (Week 1-2)
1. Add `workspaceId` to all MCP tools
2. Improve workspace auto-selection logic
3. Better error messages with candidates
4. Update skill docs
5. Test: zero ambiguous errors without hints

### Phase 3: P2 (Week 2-3)
1. Flexible symbol locator with auto-search
2. Add `coverage` metadata to results
3. Minimal Laravel route extraction
4. Update MCP tests
5. Test: Laravel repos usable, symbol API flexible

### Phase 4: P3 (Week 3-4)
1. Add MCP telemetry (opt-in)
2. Build `analyze-sessions` tool
3. MCP reliability test suite
4. Documentation updates
5. Test: telemetry working, analysis accurate

### Phase 5: Release
1. Run full test suite
2. Update CHANGELOG.md
3. Version bump to 1.7.0
4. `npm publish`
5. Create GitHub release
6. Update global install: `npm install -g graphtrace@latest`

---

## Testing Strategy

1. **Unit tests:** Each package has tests for new logic
2. **Integration tests:** MCP test suite covers real scenarios
3. **Manual testing:** Test against real Codex sessions
4. **Regression:** Run against saved session logs

---

## Risks & Mitigations

**Risk:** Breaking changes to MCP schema  
**Mitigation:** All new params optional, backward compatible

**Risk:** Laravel support incomplete  
**Mitigation:** Start minimal (routes only), add coverage warnings

**Risk:** Telemetry privacy concerns  
**Mitigation:** Opt-in only, local storage, no network

---

## Success Metrics

- MCP error rate < 2% (from 7.4%)
- Agent fallback rate < 30% (from ~50%)
- Laravel repos show coverage warnings
- Zero version drift issues
- `graphtrace agent doctor` used in troubleshooting

---

## Open Questions

1. Should we auto-update global package on `graphtrace agent setup`?
2. Should telemetry be on by default with opt-out?
3. Should we add `graphtrace mcp --validate` to check config before starting?

