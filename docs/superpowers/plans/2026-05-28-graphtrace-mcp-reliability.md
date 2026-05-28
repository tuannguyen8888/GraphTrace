# GraphTrace MCP Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GraphTrace MCP reliable and useful enough for day-to-day agentic development across multi-workspace JS/TS and Laravel/PHP repos.

**Architecture:** Fix the MCP/runtime layer first, then improve result ergonomics and coverage, then add feedback loops. Changes stay additive and backward-compatible: optional MCP inputs, new CLI subcommands, local-only telemetry, and minimal heuristic Laravel parsing.

**Tech Stack:** TypeScript, Node.js, Vitest, Model Context Protocol SDK, GraphTrace CLI/MCP/server/indexer packages.

---

## File Map

- `packages/mcp/src/index.ts` — MCP tool schemas, workspace resolution, symbol locator ergonomics, telemetry wrapper.
- `packages/mcp/src/telemetry.ts` — local-only MCP telemetry writer.
- `packages/mcp/test/mcp.test.ts` — MCP reliability regression tests.
- `packages/cli/src/index.ts` — `agent doctor` and `analyze-sessions` commands.
- `packages/cli/src/agent/doctor.ts` — agent/MCP config and version diagnostics.
- `packages/cli/src/session-analysis.ts` — Codex session log analyzer.
- `packages/cli/test/cli.test.ts` — CLI tests for new commands.
- `packages/indexer/src/php-routes.ts` — minimal Laravel route extraction.
- `packages/indexer/src/index.ts` — wire Laravel route extraction into indexing.
- `packages/indexer/test/indexer.test.ts` — Laravel fixture regression.
- `fixtures/laravel-workspace/routes/web.php` — route fixture.
- `fixtures/laravel-workspace/app/Http/Controllers/UserController.php` — controller fixture.
- `packages/*/CHANGELOG.md` — release notes.

---

### Task 1: P0 CLI Agent Doctor

**Files:**
- Create: `packages/cli/src/agent/doctor.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/test/cli.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests near existing agent tests in `packages/cli/test/cli.test.ts`:

```ts
test("agent doctor reports versions, config, and workspace hints", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-cli-agent-doctor-"));
  await writeFile(join(workspaceRoot, ".codex", "config.toml"), "[mcp_servers.graphtrace]\ncommand = \"graphtrace\"\nargs = [\"mcp\"]\n", "utf8").catch(async () => {
    await mkdir(join(workspaceRoot, ".codex"), { recursive: true });
    await writeFile(join(workspaceRoot, ".codex", "config.toml"), "[mcp_servers.graphtrace]\ncommand = \"graphtrace\"\nargs = [\"mcp\"]\n", "utf8");
  });

  const result = await runCli(["agent", "doctor"], { cwd: workspaceRoot });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("GraphTrace Agent Doctor");
  expect(result.stdout).toContain("cli_version:");
  expect(result.stdout).toContain("workspace_root:");
  expect(result.stdout).toContain("mcp_config:");
  expect(result.stdout).toContain("recommendation:");
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm vitest run packages/cli/test/cli.test.ts -t "agent doctor reports"`
Expected: FAIL because `agent doctor` is unknown.

- [ ] **Step 3: Implement doctor**

Create `packages/cli/src/agent/doctor.ts` with exported `inspectAgentDoctor()` and `formatAgentDoctorResult()` that report CLI version from package JSON, binary path from `process.argv[1]`, workspace root, GraphTrace home, and detected `.codex/config.toml` presence/content hints.

- [ ] **Step 4: Wire CLI command**

Modify `packages/cli/src/index.ts`:
- Add `graphtrace agent doctor` help entry.
- Import doctor helpers.
- Add `case "doctor"` inside `case "agent"`.

- [ ] **Step 5: Verify test passes**

Run: `pnpm vitest run packages/cli/test/cli.test.ts -t "agent doctor reports"`
Expected: PASS.

---

### Task 2: P0/P1 MCP Workspace Resolution

**Files:**
- Modify: `packages/mcp/src/index.ts`
- Test: `packages/mcp/test/mcp.test.ts`

- [ ] **Step 1: Write failing MCP tests**

Add tests that cover:
- MCP started from a repo matching one registered workspace selects that workspace even when multiple exist.
- Ambiguous errors include candidate root paths and `list_workspaces` hint.
- Invalid `/` workspaceRoot never attempts `/.graphtrace` and returns a helpful error.

- [ ] **Step 2: Run failing tests**

Run: `pnpm vitest run packages/mcp/test/mcp.test.ts -t "workspace"`
Expected: at least one new test fails with old behavior.

- [ ] **Step 3: Implement workspaceRoot inputs and cwd preference**

Modify `WorkspaceResolutionHint` to include `workspaceRoot?: string`. Add `workspaceRoot` optional input to all MCP tools that currently accept `workspaceId`. Resolution priority:
1. `workspaceId`
2. `workspaceRoot`
3. MCP startup cwd contained by exactly one registered workspace, choosing longest root match
4. path hints from file/target/symbol
5. single registered workspace
6. legacy local DB
7. helpful ambiguous error

- [ ] **Step 4: Improve error copy**

`ambiguousWorkspaceError()` must include id, label, canonicalRootPath, and `Hint: call list_workspaces`.

- [ ] **Step 5: Verify MCP tests pass**

Run: `pnpm vitest run packages/mcp/test/mcp.test.ts`
Expected: PASS.

---

### Task 3: P2 Symbol API Ergonomics

**Files:**
- Modify: `packages/mcp/src/index.ts`
- Test: `packages/mcp/test/mcp.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for:
- `graphtrace_get_execution_context` with only `symbolName: "listUsers"` auto-resolves when one match exists.
- Ambiguous `symbolName: "report"` returns structured candidates and hint instead of hard error.
- `graphtrace_get_symbol_impact` supports same behavior.

- [ ] **Step 2: Run failing tests**

Run: `pnpm vitest run packages/mcp/test/mcp.test.ts -t "symbolName"`
Expected: FAIL with old `Expected symbolId...` error.

- [ ] **Step 3: Implement symbol locator preparation**

Add helper `resolveSymbolLocatorFromInput(engine, locator)` in `packages/mcp/src/index.ts`:
- If `symbolId` or `filePath + symbolName` or `filePath + line + column`, keep existing behavior.
- If `symbolName` only, call `engine.searchSymbols(symbolName)`.
- If one match, return `{ symbolId }`.
- If zero/multiple, return a tool result with `resolutionRequired: true`, `candidates`, and `hint`.

- [ ] **Step 4: Verify symbol tests pass**

Run: `pnpm vitest run packages/mcp/test/mcp.test.ts -t "symbolName"`
Expected: PASS.

---

### Task 4: P2 Laravel Routes and Sparse Coverage

**Files:**
- Create: `packages/indexer/src/php-routes.ts`
- Modify: `packages/indexer/src/index.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/indexer/test/indexer.test.ts`
- Create: `fixtures/laravel-workspace/routes/web.php`
- Create: `fixtures/laravel-workspace/app/Http/Controllers/UserController.php`
- Create: `fixtures/laravel-workspace/composer.json`

- [ ] **Step 1: Write failing Laravel indexer test**

Add test asserting Laravel route fixture indexes at least `GET /users` with framework `laravel` and heuristic confidence.

- [ ] **Step 2: Run failing test**

Run: `pnpm vitest run packages/indexer/test/indexer.test.ts -t "laravel"`
Expected: FAIL because Laravel routes are not indexed.

- [ ] **Step 3: Implement minimal Laravel extraction**

`extractLaravelRoutes(workspaceRoot)` reads `routes/*.php` and matches:
- `Route::get('/users', [UserController::class, 'index'])`
- `Route::post('/users', 'UserController@store')`
- `Route::put`, `patch`, `delete`

Return `RouteItem[]` with `framework: "laravel"`, `confidence: 0.65`, and provenance source `framework:laravel`.

- [ ] **Step 4: Wire into indexer**

When workspace has `composer.json`, `artisan`, or `routes/*.php`, append Laravel route items after JS/TS extraction.

- [ ] **Step 5: Add coverage metadata minimally**

Extend shared search/graph envelope types with optional `coverage`. Add coverage warning in query engine when selected units are `unknown`/`shallow`.

- [ ] **Step 6: Verify Laravel test passes**

Run: `pnpm vitest run packages/indexer/test/indexer.test.ts -t "laravel"`
Expected: PASS.

---

### Task 5: P3 Telemetry and Session Analysis

**Files:**
- Create: `packages/mcp/src/telemetry.ts`
- Modify: `packages/mcp/src/index.ts`
- Create: `packages/cli/src/session-analysis.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/test/cli.test.ts`
- Test: `packages/mcp/test/mcp.test.ts`

- [ ] **Step 1: Write failing CLI session-analysis test**

Create temp JSONL session with one `mcp_tool_call_end` error and one GraphTrace → `rg` fallback message. Assert `graphtrace analyze-sessions <dir>` reports calls, errors, and fallback.

- [ ] **Step 2: Implement session analyzer**

Parse `.jsonl` recursively and count:
- `mcp_tool_call_end` where `invocation.server === "graphtrace"`
- errors where result `Ok.isError === true`
- top first-line errors
- fallback messages containing GraphTrace then `rg|grep|sed|đọc code|fallback`

- [ ] **Step 3: Implement opt-in telemetry**

`packages/mcp/src/telemetry.ts` writes NDJSON only if `GRAPHTRACE_MCP_TELEMETRY=1`. Wrap MCP handlers to record tool name, duration, success/error/empty, result size.

- [ ] **Step 4: Verify CLI and MCP tests pass**

Run: `pnpm vitest run packages/cli/test/cli.test.ts packages/mcp/test/mcp.test.ts`
Expected: PASS.

---

### Task 6: Release Readiness

**Files:**
- Modify: `packages/cli/CHANGELOG.md`
- Modify: `packages/mcp/CHANGELOG.md`
- Modify: `packages/indexer/CHANGELOG.md`
- Modify: `packages/shared/CHANGELOG.md` if shared types change
- Modify: root/package version files via changeset/version tooling

- [ ] **Step 1: Run targeted tests**

Run:
```bash
pnpm vitest run packages/cli/test/cli.test.ts packages/mcp/test/mcp.test.ts packages/indexer/test/indexer.test.ts
```
Expected: PASS.

- [ ] **Step 2: Run full validation**

Run:
```bash
pnpm test
pnpm typecheck
pnpm build
```
Expected: PASS.

- [ ] **Step 3: Update release notes**

Add changelog bullets for P0-P3.

- [ ] **Step 4: Publish**

Run:
```bash
pnpm changeset
pnpm release:version
pnpm build
npm publish --workspace packages/cli --access public
```
Expected: `graphtrace@1.7.0` published.

- [ ] **Step 5: Close issues**

Comment on #57-#60 with verification evidence and npm version, then close them.
