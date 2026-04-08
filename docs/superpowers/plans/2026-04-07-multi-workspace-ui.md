# Multi-Workspace UI and Daemon Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one GraphTrace daemon that manages many workspaces, exposes a workspace home screen, and lets users add/select workspaces before drilling into repository/package/graph views.

**Architecture:** Introduce a central workspace registry and managed per-workspace DB storage, then refactor the existing server and web UI so all graph/query APIs are explicitly scoped by `workspaceId`. Keep repository/package filtering as inner filters inside a selected workspace instead of using process boundaries for isolation.

**Tech Stack:** Node.js, Fastify, SQLite, React, Vite, TypeScript, Vitest, Biome

---

## File Structure

### New Files

- `packages/storage/src/workspace-paths.ts`
  - Build managed storage paths, canonicalize workspace roots, and derive stable workspace ids.
- `packages/storage/src/workspace-registry.ts`
  - Own registry DB schema, workspace CRUD, snapshot persistence, and job state transitions.
- `packages/server/src/daemon.ts`
  - Compose registry, per-workspace query engine access, and indexing job orchestration.
- `packages/server/test/workspace-registry.test.ts`
  - Cover registry CRUD, id/path normalization, and managed storage path behavior.
- `packages/server/test/workspace-api.test.ts`
  - Cover workspace home APIs, add/remove/reindex flows, and workspace-scoped query isolation.
- `packages/cli/test/workspace-cli.test.ts`
  - Cover `workspace add/list/remove/reindex` and `serve` commands.
- `apps/web/src/workspace-home.tsx`
  - Render the home screen listing workspaces and the add-workspace flow.
- `apps/web/src/workspace-detail.tsx`
  - Wrap the current self-host detail experience with a workspace-aware route boundary.
- `apps/web/src/home-view-model.ts`
  - Build workspace cards, status text, and add-workspace preview state.
- `apps/web/src/api-client.ts`
  - Centralize daemon API calls and workspace-scoped request building.
- `apps/web/src/route-state.ts`
  - Parse and sync `workspaceId`, `repository`, `scope`, `package`, `q`, and `kind` from the URL.

### Modified Files

- `packages/storage/src/index.ts`
  - Re-export registry/storage helpers and integrate managed workspace DB access.
- `packages/query-engine/src/index.ts`
  - Add helpers to open/query a workspace DB by explicit `workspaceId` context.
- `packages/shared/src/index.ts`
  - Add workspace summary types and any new shared API contracts.
- `packages/server/src/index.ts`
  - Serve the new home/workspace APIs and delegate to daemon helpers.
- `packages/server/test/server.test.ts`
  - Extend server integration coverage for workspace-scoped APIs.
- `packages/server/test/web-ui.test.ts`
  - Extend web view-model coverage for workspace detail routing, repository rename, and nested repo promotion.
- `packages/cli/src/index.ts`
  - Add `serve` and `workspace` subcommands while keeping `web` backward compatible.
- `apps/web/src/App.tsx`
  - Replace single-screen behavior with route-aware shell that switches between home and workspace detail.
- `apps/web/src/view-model.ts`
  - Keep detail-page logic but make it consume explicit workspace context.
- `apps/web/src/app.css`
  - Add home screen, add-workspace modal, breadcrumb, and workspace-detail context styles.
- `docs/ARCHITECTURE.md`
  - Document daemon/registry/workspace concepts.
- `README.md`
  - Update quick start from “one repo, one instance” to “one daemon, many workspaces”.

### Existing Files to Read Before Implementing

- `packages/storage/src/index.ts`
- `packages/query-engine/src/index.ts`
- `packages/server/src/index.ts`
- `packages/cli/src/index.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/view-model.ts`
- `docs/superpowers/specs/2026-04-07-multi-workspace-ui-design.md`

---

## Chunk 1: Workspace Registry and Managed Storage

### Task 1: Add stable workspace ids and managed storage paths

**Files:**
- Create: `packages/storage/src/workspace-paths.ts`
- Test: `packages/server/test/workspace-registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("derives a stable workspace id and managed db path from a root path", () => {
  const workspace = deriveWorkspaceIdentity("/tmp/example/GraphTrace");

  expect(workspace.slug).toBe("graphtrace");
  expect(workspace.id).toMatch(/^graphtrace-[a-z0-9]{6,}$/);
  expect(workspace.dbPath).toContain(`workspaces/${workspace.id}/index.db`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/server/test/workspace-registry.test.ts`
Expected: FAIL because `deriveWorkspaceIdentity` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement in `packages/storage/src/workspace-paths.ts`:

- `canonicalizeWorkspaceRoot(rootPath: string)`
- `deriveWorkspaceIdentity(rootPath: string)`
- `buildManagedWorkspaceDbPath(workspaceId: string)`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/server/test/workspace-registry.test.ts`
Expected: PASS for the new identity/path test.

- [ ] **Step 5: Commit**

```bash
git add packages/storage/src/workspace-paths.ts packages/server/test/workspace-registry.test.ts
git commit -m "feat: add workspace identity and managed storage paths"
```

### Task 2: Add the registry DB and workspace CRUD

**Files:**
- Create: `packages/storage/src/workspace-registry.ts`
- Modify: `packages/storage/src/index.ts`
- Test: `packages/server/test/workspace-registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("creates, lists, and removes managed workspaces without touching repo files", () => {
  const registry = createWorkspaceRegistry(tmpHomeDir);
  const created = registry.addWorkspace("/tmp/example/tawaco", { label: "tawaco" });

  expect(registry.listWorkspaces()).toEqual([
    expect.objectContaining({ id: created.id, label: "tawaco" }),
  ]);

  registry.removeWorkspace(created.id);
  expect(registry.listWorkspaces()).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/server/test/workspace-registry.test.ts`
Expected: FAIL because registry CRUD does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement in `packages/storage/src/workspace-registry.ts`:

- registry schema bootstrap
- `addWorkspace`
- `listWorkspaces`
- `getWorkspace`
- `removeWorkspace`
- snapshot/job update helpers

Re-export from `packages/storage/src/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/server/test/workspace-registry.test.ts`
Expected: PASS for CRUD coverage.

- [ ] **Step 5: Commit**

```bash
git add packages/storage/src/workspace-registry.ts packages/storage/src/index.ts packages/server/test/workspace-registry.test.ts
git commit -m "feat: add workspace registry storage"
```

---

## Chunk 2: Daemon and Workspace-Scoped Server APIs

### Task 3: Add a daemon layer that resolves workspaces explicitly

**Files:**
- Create: `packages/server/src/daemon.ts`
- Modify: `packages/query-engine/src/index.ts`
- Test: `packages/server/test/workspace-api.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("loads two workspaces through one daemon and keeps query results isolated", async () => {
  const daemon = await createGraphTraceDaemon(tmpHomeDir);
  const graphtrace = await daemon.addWorkspace(graphtraceFixtureRoot);
  const tawaco = await daemon.addWorkspace(tawacoFixtureRoot);

  const graphtraceStatus = await daemon.status(graphtrace.id);
  const tawacoStatus = await daemon.status(tawaco.id);

  expect(graphtraceStatus.workspaceRoot).toContain("GraphTrace");
  expect(tawacoStatus.workspaceRoot).toContain("tawaco");
  expect(graphtraceStatus.workspaceRoot).not.toBe(tawacoStatus.workspaceRoot);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/server/test/workspace-api.test.ts`
Expected: FAIL because the daemon abstraction does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement in `packages/server/src/daemon.ts`:

- `createGraphTraceDaemon`
- `addWorkspace`
- `listWorkspaces`
- `status(workspaceId)`
- `withWorkspaceQueryEngine(workspaceId, action)`

Add explicit workspace DB open helpers to `packages/query-engine/src/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/server/test/workspace-api.test.ts`
Expected: PASS for daemon isolation coverage.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/daemon.ts packages/query-engine/src/index.ts packages/server/test/workspace-api.test.ts
git commit -m "feat: add multi-workspace daemon core"
```

### Task 4: Replace implicit single-workspace APIs with `workspaceId`-scoped APIs

**Files:**
- Modify: `packages/server/src/index.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/server/test/server.test.ts`
- Modify: `packages/server/test/workspace-api.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("requires workspace-scoped routes for status and search", async () => {
  const response = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspaceId}/status`,
  });

  expect(response.statusCode).toBe(200);
  expect(response.json().workspaceRoot).toContain("GraphTrace");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/server/test/server.test.ts packages/server/test/workspace-api.test.ts`
Expected: FAIL because the current API is single-workspace only.

- [ ] **Step 3: Write minimal implementation**

Add endpoints:

- `GET /api/workspaces`
- `POST /api/workspaces`
- `DELETE /api/workspaces/:workspaceId`
- `POST /api/workspaces/:workspaceId/index`
- `GET /api/workspaces/:workspaceId/status`
- `GET /api/workspaces/:workspaceId/repositories`
- `GET /api/workspaces/:workspaceId/packages`
- `GET /api/workspaces/:workspaceId/routes`
- `GET /api/workspaces/:workspaceId/search`
- `GET /api/workspaces/:workspaceId/deps`
- `GET /api/workspaces/:workspaceId/impact`
- `GET /api/workspaces/:workspaceId/flow`

Update shared response types in `packages/shared/src/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/server/test/server.test.ts packages/server/test/workspace-api.test.ts`
Expected: PASS for workspace-scoped API behavior.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/index.ts packages/shared/src/index.ts packages/server/test/server.test.ts packages/server/test/workspace-api.test.ts
git commit -m "feat: add workspace-scoped server apis"
```

---

## Chunk 3: CLI Commands and Backward Compatibility

### Task 5: Add `serve` and `workspace` commands

**Files:**
- Modify: `packages/cli/src/index.ts`
- Create: `packages/cli/test/workspace-cli.test.ts`
- Modify: `packages/cli/test/cli.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("workspace add registers a repo and workspace list prints it", async () => {
  const add = await runCli(["workspace", "add", fixtureRoot], { cwd: tmpRoot });
  expect(add.exitCode).toBe(0);

  const list = await runCli(["workspace", "list"], { cwd: tmpRoot });
  expect(list.stdout).toContain(fixtureRoot);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/cli/test/workspace-cli.test.ts`
Expected: FAIL because the commands do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement:

- `graphtrace serve`
- `graphtrace workspace add <path>`
- `graphtrace workspace list`
- `graphtrace workspace remove <workspaceId>`
- `graphtrace workspace reindex <workspaceId> --full`

Keep `graphtrace web` as a compatibility alias that launches the daemon UI.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/cli/test/workspace-cli.test.ts packages/cli/test/cli.test.ts`
Expected: PASS for new workspace commands and no regressions on existing CLI behavior.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/test/workspace-cli.test.ts packages/cli/test/cli.test.ts
git commit -m "feat: add multi-workspace cli commands"
```

---

## Chunk 4: Workspace Home Screen and Add-Repo Flow

### Task 6: Add home screen view-model and API client helpers

**Files:**
- Create: `apps/web/src/home-view-model.ts`
- Create: `apps/web/src/api-client.ts`
- Create: `apps/web/src/route-state.ts`
- Modify: `packages/server/test/web-ui.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("builds workspace cards with clear status, counts, and open action labels", () => {
  const cards = buildWorkspaceCards([
    {
      id: "graphtrace-123abc",
      label: "GraphTrace",
      rootPath: "/tmp/GraphTrace",
      status: "ready",
      counts: { packageCount: 25, fileCount: 48, symbolCount: 804, routeCount: 15, queryEdgeCount: 6 },
    },
  ]);

  expect(cards[0]).toMatchObject({
    title: "GraphTrace",
    statusLabel: "Ready",
    openLabel: "Open workspace",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/server/test/web-ui.test.ts`
Expected: FAIL because the home view-model does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement:

- workspace card shaping
- status label formatting
- URL parse/build helpers for `/` and `/workspaces/:workspaceId`
- central API request helpers

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/server/test/web-ui.test.ts`
Expected: PASS for home card view-model behavior.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/home-view-model.ts apps/web/src/api-client.ts apps/web/src/route-state.ts packages/server/test/web-ui.test.ts
git commit -m "feat: add workspace home view-model and api helpers"
```

### Task 7: Render the workspace home screen and add-workspace modal

**Files:**
- Create: `apps/web/src/workspace-home.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/app.css`
- Modify: `packages/server/test/web-ui.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("renders add-workspace guidance and explains workspace-first navigation", () => {
  expect(buildWorkspaceHomeCopy().emptyTitle).toContain("Add new repo");
  expect(buildWorkspaceHomeCopy().emptyBody).toContain("Choose a workspace first");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/server/test/web-ui.test.ts`
Expected: FAIL because the home screen copy/model does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement:

- default route `/`
- workspace grid
- add-workspace modal with path input
- preview / confirm flow
- home screen empty state and loading state

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/server/test/web-ui.test.ts`
Expected: PASS for home screen guidance/model coverage.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/workspace-home.tsx apps/web/src/App.tsx apps/web/src/app.css packages/server/test/web-ui.test.ts
git commit -m "feat: add multi-workspace home screen"
```

---

## Chunk 5: Workspace Detail Integration and Repository Scope UX

### Task 8: Move current self-host UI under workspace detail routes

**Files:**
- Create: `apps/web/src/workspace-detail.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/view-model.ts`
- Modify: `packages/server/test/web-ui.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("treats repository scope as an inner filter inside a selected workspace", () => {
  const detailState = buildWorkspaceDetailState({
    workspaceId: "graphtrace-123abc",
    selectedRepositoryId: ".",
  });

  expect(detailState.repositoryLabel).toBe("Repository Scope");
  expect(detailState.workspaceLabel).toBe("graphtrace-123abc");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/server/test/web-ui.test.ts`
Expected: FAIL because workspace detail routing/state does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement:

- `/workspaces/:workspaceId`
- breadcrumb and workspace header
- explicit workspace fetch boundary
- repository selector rename from `Repository` to `Repository Scope`
- detail-page query URLs prefixed with `workspaceId`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/server/test/web-ui.test.ts`
Expected: PASS for workspace detail routing and label coverage.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/workspace-detail.tsx apps/web/src/App.tsx apps/web/src/view-model.ts packages/server/test/web-ui.test.ts
git commit -m "feat: route self-host ui through workspace detail pages"
```

### Task 9: Promote nested apps/subprojects to repository scope candidates

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/src/view-model.ts`
- Modify: `packages/server/test/web-ui.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("promotes nested apps with package.json roots into repository scope candidates", () => {
  const repositories = deriveRepositories(tawacoLikeUnits);

  expect(repositories.map((entry) => entry.id)).toEqual([
    ".",
    "apps/backoffice",
    "apps/kiosk",
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/server/test/web-ui.test.ts`
Expected: FAIL because nested apps are not yet promoted as repository candidates.

- [ ] **Step 3: Write minimal implementation**

Update repository derivation so:

- nested apps/subprojects with package roots become repository candidates
- duplicate labels are disambiguated by path
- repository filtering still honors longest-path ownership

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/server/test/web-ui.test.ts`
Expected: PASS for tawaco-like nested app repository derivation.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts apps/web/src/view-model.ts packages/server/test/web-ui.test.ts
git commit -m "feat: promote nested app scopes as repositories"
```

---

## Chunk 6: Missing Paths, Docs, and Final Verification

### Task 10: Handle missing workspaces and remove-workspace cleanup

**Files:**
- Modify: `packages/storage/src/workspace-registry.ts`
- Modify: `packages/server/src/daemon.ts`
- Modify: `packages/server/test/workspace-api.test.ts`
- Modify: `apps/web/src/workspace-home.tsx`

- [ ] **Step 1: Write the failing test**

```ts
test("marks a workspace missing when its root path disappears", async () => {
  const workspace = await daemon.addWorkspace(fixtureRoot);
  await removeFixtureRootFromDisk(fixtureRoot);

  const refreshed = await daemon.refreshWorkspace(workspace.id);
  expect(refreshed.status).toBe("missing");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/server/test/workspace-api.test.ts`
Expected: FAIL because missing-path health checks do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement:

- path existence checks on refresh/open/reindex
- `missing` workspace status
- remove-workspace cleanup for managed DB directories
- home-card actions for missing workspaces

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/server/test/workspace-api.test.ts`
Expected: PASS for missing-path and removal behavior.

- [ ] **Step 5: Commit**

```bash
git add packages/storage/src/workspace-registry.ts packages/server/src/daemon.ts packages/server/test/workspace-api.test.ts apps/web/src/workspace-home.tsx
git commit -m "feat: handle missing workspace paths and cleanup"
```

### Task 11: Update docs and verify the full MVP

**Files:**
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `packages/cli/README.md`

- [ ] **Step 1: Add doc updates**

Document:

- one-daemon multi-workspace mental model
- `graphtrace serve`
- `graphtrace workspace add/list/remove/reindex`
- home screen and add-repo flow
- managed storage location under `~/.graphtrace`

- [ ] **Step 2: Run release-safe verification**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:smoke
```

Expected: all commands exit `0`.

- [ ] **Step 3: Verify the end-to-end product flow manually**

Run:

```bash
graphtrace serve
```

Then verify:

- home screen lists multiple workspaces
- `Add new repo` can add a new workspace
- selecting GraphTrace and tawaco shows isolated data
- repository scope only changes nested repos inside the chosen workspace

- [ ] **Step 4: Commit**

```bash
git add README.md docs/ARCHITECTURE.md packages/cli/README.md
git commit -m "docs: describe multi-workspace daemon workflow"
```

---

## Notes for Execution

- Follow TDD strictly for every task.
- Keep commits frequent and aligned with the task boundaries above.
- Do not mix workspace-home changes with repository-derivation changes in one commit.
- Prefer managed storage under `~/.graphtrace` by default; do not reintroduce tracked repo dirtiness.
- When in doubt, preserve isolation first and optimize later.

## Suggested Execution Order

1. Chunk 1
2. Chunk 2
3. Chunk 3
4. Chunk 4
5. Chunk 5
6. Chunk 6

Plan complete and saved to `docs/superpowers/plans/2026-04-07-multi-workspace-ui.md`. Ready to execute?
