# Graph-First Workspace UX Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish issue `#43` by making the selected symbol workflow feel graph-first on desktop and mobile, while keeping the implementation maintainable and avoiding new UI debt.

**Architecture:** Treat this as a presentation-state and workflow problem, not a CSS-only polish pass. Keep `App.tsx` as the data-loading and URL-sync coordinator, move workspace rendering into focused screen components, and derive a pure `WorkspacePresentationState` that controls whether the UI is in overview or focused investigation mode. Reuse the existing `GraphEnvelope` confidence and provenance data already returned by symbol graph queries so the inspector can explain trust directly without inventing a second backend path unless the current payload proves insufficient during implementation.

**Tech Stack:** React 19, TypeScript, Vite, `@xyflow/react`, existing GraphTrace server routes, Vitest, Playwright, Biome

---

## Scope Notes

This plan is the execution-focused follow-up to:

- `docs/superpowers/specs/2026-04-08-graph-v2-design.md`
- `docs/superpowers/plans/2026-04-08-graph-v2.md`

Those earlier documents established the graph-first direction. This plan narrows the work to the concrete gap still visible in issue `#43` and the current UI screenshots:

- graph and inspector still do not dominate strongly enough after selection
- search, graph, and inspector still feel like adjacent panels instead of one flow
- inspector still hides trust and provenance behind raw node lists
- mobile still stacks useful state too low in the page
- `apps/web/src/App.tsx` is already too large to absorb another round of inline branching safely

## Guardrails

- Do not solve this with CSS-only reordering layered on top of the current `App.tsx`.
- Do not introduce a brand-new backend graph contract unless the existing `GraphEnvelope.edges[].provenance` data is proven insufficient.
- Keep English and Vietnamese copy in parity.
- Keep the bounded graph philosophy. This issue is about hierarchy and workflow clarity, not about rendering a larger graph.
- Land the work in vertical slices that stay shippable and testable after each chunk.

## File Map

### Existing files to modify

- `apps/web/src/App.tsx`
  - keep only data fetching, URL sync, and event orchestration
- `apps/web/src/app.css`
  - replace the current one-size-fits-all page layout with explicit overview and focused investigation states
- `apps/web/src/graph-workspace.tsx`
  - coordinate graph emphasis, node highlight behavior, and focused canvas sizing
- `apps/web/src/symbol-graph-controls.tsx`
  - keep symbol controls compact and aligned with the promoted graph state
- `apps/web/src/symbol-graph-inspector.tsx`
  - render richer evidence rows instead of raw node-only lists
- `apps/web/src/symbol-graph-view-model.ts`
  - stop discarding edge confidence and provenance when building inspector sections
- `apps/web/src/view-model.ts`
  - keep search/workbench/starter helpers aligned with the new focused workflow
- `apps/web/src/i18n.ts`
  - add focused-state, trust, and mobile-friendly copy
- `packages/server/test/web-ui.test.ts`
  - extend the current view-model regression coverage
- `playwright.config.ts`
  - wire a real browser regression loop for desktop and mobile workflow assertions
- `README.md`
  - refresh screenshots only if the new UI materially changes the documented product surface

### New files to create

- `apps/web/src/workspace-screen.tsx`
  - presentational shell for the selected workspace view
- `apps/web/src/workspace-focus-view-model.ts`
  - pure state builder for overview versus focused investigation mode
- `apps/web/src/workspace-sidebar.tsx`
  - left rail extracted from `App.tsx`
- `apps/web/src/workspace-supporting-panels.tsx`
  - search workbench and route explorer grouped as secondary panels
- `apps/web/src/symbol-inspector-view-model.ts`
  - transforms graph edges into trust-aware inspector rows with confidence and provenance summaries
- `apps/web/test/graph-first-workspace.spec.ts`
  - desktop and mobile browser regression coverage for the selected symbol workflow
- `apps/web/test/helpers/graphtrace-fixture-server.ts`
  - starts a fixture-backed GraphTrace server against built web assets for Playwright

## Data and State Boundaries

### `WorkspacePresentationState`

Create a pure presentation-state helper in `apps/web/src/workspace-focus-view-model.ts`:

```ts
export interface WorkspacePresentationState {
  mode: "overview" | "focused-route" | "focused-symbol" | "focused-file";
  emphasizeGraph: boolean;
  emphasizeInspector: boolean;
  showStarterGuide: boolean;
  supportingPanelsVariant: "full" | "secondary";
  mobileSectionOrder: Array<"graph" | "inspector" | "supporting">;
  graphCanvasDensity: "default" | "expanded";
}
```

Rules:

- idle state stays in `overview`
- route, symbol, and file investigations all enter a focused mode
- focused mode promotes graph and inspector and demotes search plus route explorer
- mobile order becomes graph -> inspector -> supporting panels when focus exists
- duplicate starter-guide narratives disappear once the user has a concrete selection

### `SymbolInspectorRow`

Create a trust-aware inspector row model in `apps/web/src/symbol-inspector-view-model.ts`:

```ts
export interface SymbolInspectorRow {
  item: GraphItem;
  confidenceLabel?: GraphConfidenceLabel;
  relationshipKind: "caller" | "callee" | "route" | "sink";
  evidenceSummary: string;
  evidenceLines: string[];
  focusAction: {
    kind: "focus";
    targetId: string;
  };
}
```

Rules:

- derive `confidenceLabel` from the connecting edge, not from the node alone
- derive `evidenceSummary` from `edge.provenance.kind`, `edge.provenance.source`, and the first useful evidence line
- show weak-confidence warnings at row level and at section level when needed
- keep rows actionable: select row, focus target, open file, or copy command

## Chunk 1: Freeze the Workflow Contract and Extract the Screen Boundary

### Task 1: Add failing tests for workspace presentation state

**Files:**
- Create: `apps/web/src/workspace-focus-view-model.ts`
- Modify: `packages/server/test/web-ui.test.ts`
- Test: `packages/server/test/web-ui.test.ts`

- [ ] **Step 1: Write the failing tests**

Add coverage for:

- idle workspace state returns `mode: "overview"`
- symbol inspection returns `mode: "focused-symbol"`
- focused states promote graph and inspector
- focused states switch mobile order to `["graph", "inspector", "supporting"]`
- focused states suppress duplicate starter guidance

Example assertion skeleton:

```ts
expect(
  buildWorkspacePresentationState({
    inspector: {
      type: "search",
      item: {
        id: "symbol:apps/kiosk/src/pages/Result.tsx#Result.handlePrint",
        kind: "symbol",
        label: "Result.handlePrint",
        path: "apps/kiosk/src/pages/Result.tsx",
      },
    },
  }),
).toMatchObject({
  mode: "focused-symbol",
  emphasizeGraph: true,
  emphasizeInspector: true,
  mobileSectionOrder: ["graph", "inspector", "supporting"],
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/server/test/web-ui.test.ts -t "workspace presentation state"`

Expected: FAIL because `buildWorkspacePresentationState` does not exist yet

- [ ] **Step 3: Implement the minimal pure state builder**

Create `apps/web/src/workspace-focus-view-model.ts` and export:

- `buildWorkspacePresentationState`
- `hasConcreteSelection`
- any tiny discriminated helpers needed to keep React components branch-light

Do not touch layout markup yet. This task only defines the contract.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/server/test/web-ui.test.ts -t "workspace presentation state"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/workspace-focus-view-model.ts packages/server/test/web-ui.test.ts
git commit -m "Add workspace presentation state model"
```

### Task 2: Extract `WorkspaceScreen` and the left rail before behavior changes

**Files:**
- Create: `apps/web/src/workspace-screen.tsx`
- Create: `apps/web/src/workspace-sidebar.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/app.css`
- Test: `packages/server/test/web-ui.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests that assert the current localized copy and structural labels still exist after extraction:

- graph state
- triage lens
- route filter
- inspector

The intent is to protect against accidental UI regressions during the extraction.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/server/test/web-ui.test.ts -t "graph state"`

Expected: FAIL only if copy or exported component wiring is broken during extraction

- [ ] **Step 3: Move markup out of `App.tsx` without changing behavior**

Move the selected-workspace render branch into `workspace-screen.tsx` and the left rail into `workspace-sidebar.tsx`.

`App.tsx` should keep:

- remote data loading
- search and inspector state
- URL persistence
- event callbacks passed into extracted components

It should stop owning large blocks of JSX for:

- the left rail
- graph panel shell
- search/workbench shell
- route explorer shell
- inspector shell

- [ ] **Step 4: Run verification**

Run:

- `pnpm vitest run packages/server/test/web-ui.test.ts`
- `pnpm typecheck`

Expected:

- tests PASS
- typecheck PASS
- `App.tsx` becomes materially smaller and mostly orchestration-only

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/workspace-screen.tsx apps/web/src/workspace-sidebar.tsx apps/web/src/App.tsx apps/web/src/app.css packages/server/test/web-ui.test.ts
git commit -m "Extract workspace screen and sidebar shell"
```

---

## Chunk 2: Make the Selected Symbol Workflow Actually Graph-First

### Task 3: Promote graph plus inspector and demote supporting panels

**Files:**
- Modify: `apps/web/src/workspace-screen.tsx`
- Create: `apps/web/src/workspace-supporting-panels.tsx`
- Modify: `apps/web/src/app.css`
- Modify: `apps/web/src/graph-workspace.tsx`
- Modify: `apps/web/src/workspace-focus-view-model.ts`
- Test: `packages/server/test/web-ui.test.ts`

- [ ] **Step 1: Write the failing tests**

Add view-model coverage for:

- focused route and symbol states using `supportingPanelsVariant: "secondary"`
- focused states using `graphCanvasDensity: "expanded"`
- idle state keeping `supportingPanelsVariant: "full"`

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/server/test/web-ui.test.ts -t "supportingPanelsVariant"`

Expected: FAIL on missing focused-layout fields

- [ ] **Step 3: Implement the focused layout**

In `workspace-screen.tsx` and `app.css`:

- add explicit overview and focused layout classes or data attributes
- keep the left rail visible, but visually secondary
- make the graph panel taller and visually dominant in focused mode
- make the inspector sticky or visually anchored beside the graph on wide screens
- move search workbench and route explorer into `workspace-supporting-panels.tsx`
- render the supporting panels as a secondary band below the graph plus inspector instead of equal-weight primary columns

Do not hide search or routes completely. They remain available, but they stop competing with the active graph state.

- [ ] **Step 4: Remove duplicate guidance**

In focused mode:

- do not render the starter guide in both the graph empty state and the inspector empty state
- compress the workbench guidance into one clear “next action” block instead of layered intro + quick picks + triage copy

In overview mode:

- keep the onboarding affordance, but trim narrative density

- [ ] **Step 5: Run verification**

Run:

- `pnpm vitest run packages/server/test/web-ui.test.ts`
- `pnpm typecheck`
- `pnpm web:build`

Expected:

- focused states visually promote graph and inspector
- no build errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/workspace-screen.tsx apps/web/src/workspace-supporting-panels.tsx apps/web/src/app.css apps/web/src/graph-workspace.tsx apps/web/src/workspace-focus-view-model.ts packages/server/test/web-ui.test.ts
git commit -m "Promote focused graph and inspector workflow"
```

### Task 4: Strengthen active-state coordination across graph, search, and inspector

**Files:**
- Modify: `apps/web/src/workspace-screen.tsx`
- Modify: `apps/web/src/graph-workspace.tsx`
- Modify: `apps/web/src/symbol-graph-controls.tsx`
- Modify: `apps/web/src/app.css`
- Modify: `apps/web/src/view-model.ts`
- Modify: `apps/web/src/i18n.ts`
- Test: `packages/server/test/web-ui.test.ts`

- [ ] **Step 1: Write the failing tests**

Add coverage for shared selection behavior:

- search result selection and graph focus use the same selected item id
- symbol selection resets symbol graph mode and confidence defaults consistently
- focused states expose one clear selected title across graph and inspector

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/server/test/web-ui.test.ts -t "selected title"`

Expected: FAIL on missing shared selection helpers or inconsistent defaults

- [ ] **Step 3: Implement shared active-state affordances**

Add the minimal state and styling needed so the same selection is visually obvious across:

- search results
- graph-local search hits
- graph focus node
- inspector title and rows
- route explorer rows when the selected item is a route

Use existing localized `focus` copy where an explicit focus action improves clarity.

Avoid creating another global store. Keep the source of truth in existing React state and derive visual flags from it.

- [ ] **Step 4: Add mobile focus handoff**

On small screens, after selecting a search result, route, or graph node:

- scroll the graph container into view when entering focus mode
- keep the inspector directly after the graph
- avoid forcing the user to scroll through search guidance before seeing useful graph state

Keep this behavior progressive. Only trigger it when focus actually changes.

- [ ] **Step 5: Run verification**

Run:

- `pnpm vitest run packages/server/test/web-ui.test.ts`
- `pnpm typecheck`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/workspace-screen.tsx apps/web/src/graph-workspace.tsx apps/web/src/symbol-graph-controls.tsx apps/web/src/app.css apps/web/src/view-model.ts apps/web/src/i18n.ts packages/server/test/web-ui.test.ts
git commit -m "Coordinate active focus across graph search and inspector"
```

---

## Chunk 3: Make Trust Legible Instead of Implicit

### Task 5: Add a symbol inspector evidence view-model

**Files:**
- Create: `apps/web/src/symbol-inspector-view-model.ts`
- Modify: `apps/web/src/symbol-graph-view-model.ts`
- Modify: `packages/server/test/web-ui.test.ts`
- Test: `packages/server/test/web-ui.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests that prove the current node-only inspector is insufficient, then lock the new behavior:

- caller and callee rows retain the connecting edge confidence label
- evidence summary is derived from `edge.provenance.kind` and `edge.provenance.source`
- weak-confidence edges surface warnings without hiding the row
- routes and sinks remain empty in reference mode

Example expectation shape:

```ts
expect(sections[0].rows[0]).toMatchObject({
  item: expect.objectContaining({
    id: "symbol:apps/api/src/routes/users.ts#auditedListUsers",
  }),
  confidenceLabel: "inferred-strong",
  evidenceSummary: expect.stringContaining("route-handler"),
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/server/test/web-ui.test.ts -t "confidence label"`

Expected: FAIL because inspector sections currently expose only `items`

- [ ] **Step 3: Implement the trust-aware row builder**

Create `symbol-inspector-view-model.ts` and refactor `symbol-graph-view-model.ts` so section building retains:

- the related node
- the edge that connects the node to the current root symbol
- a short trust summary
- whether the row should show a weak-confidence warning

Do not fetch per-edge detail from the server yet. First use the edge provenance already present in the graph payload. Only add `getWorkspaceSymbolEdge` later if a real gap remains after implementation.

- [ ] **Step 4: Run verification**

Run: `pnpm vitest run packages/server/test/web-ui.test.ts`

Expected: PASS with no regressions to the current symbol graph controls tests

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/symbol-inspector-view-model.ts apps/web/src/symbol-graph-view-model.ts packages/server/test/web-ui.test.ts
git commit -m "Preserve trust evidence in symbol inspector state"
```

### Task 6: Render provenance and confidence in the inspector UI

**Files:**
- Modify: `apps/web/src/symbol-graph-inspector.tsx`
- Modify: `apps/web/src/symbol-graph-controls.tsx`
- Modify: `apps/web/src/app.css`
- Modify: `apps/web/src/i18n.ts`
- Modify: `apps/web/src/workspace-screen.tsx`
- Test: `packages/server/test/web-ui.test.ts`

- [ ] **Step 1: Write the failing tests**

Add assertions for new UI copy and state labels:

- confidence badge labels
- provenance microcopy
- row-level focus action label
- focused symbol summary copy

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/server/test/web-ui.test.ts -t "provenance"`

Expected: FAIL on missing localized copy and missing row properties

- [ ] **Step 3: Implement the UI**

Update `symbol-graph-inspector.tsx` so each row shows:

- node chip
- label and path
- confidence badge
- one-line provenance summary
- optional weak-confidence warning
- explicit focus/select action when it improves navigation clarity

Update `symbol-graph-controls.tsx` so the currently selected symbol summary does not compete visually with the new inspector trust content.

- [ ] **Step 4: Run verification**

Run:

- `pnpm vitest run packages/server/test/web-ui.test.ts`
- `pnpm typecheck`
- `pnpm web:build`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/symbol-graph-inspector.tsx apps/web/src/symbol-graph-controls.tsx apps/web/src/app.css apps/web/src/i18n.ts apps/web/src/workspace-screen.tsx packages/server/test/web-ui.test.ts
git commit -m "Show symbol provenance and confidence in inspector"
```

---

## Chunk 4: Lock the UX with Real Browser Coverage and Update Docs

### Task 7: Add Playwright regression coverage for desktop and mobile

**Files:**
- Create: `apps/web/test/helpers/graphtrace-fixture-server.ts`
- Create: `apps/web/test/graph-first-workspace.spec.ts`
- Modify: `playwright.config.ts`
- Test: `apps/web/test/graph-first-workspace.spec.ts`

- [ ] **Step 1: Write the failing browser tests**

Add one desktop and one mobile test.

Desktop assertion set:

- open the fixture workspace screen
- search and select `Result.handlePrint`
- graph canvas is visible without scrolling past the supporting panels
- inspector shows the selected symbol plus confidence or provenance text

Mobile assertion set:

- same selection flow in a narrow viewport
- after selection, graph is visible first
- inspector appears before the workbench and route explorer in DOM or rendered order

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm playwright test apps/web/test/graph-first-workspace.spec.ts`

Expected: FAIL because the harness and the focused layout assertions do not exist yet

- [ ] **Step 3: Build the fixture server harness**

Create `apps/web/test/helpers/graphtrace-fixture-server.ts` that:

- ensures a known fixture workspace is initialized and indexed
- starts `createGraphTraceApp` against built web assets
- binds to `127.0.0.1:4310`
- shuts down cleanly after Playwright completes

Update `playwright.config.ts` to use this harness as `webServer`.

- [ ] **Step 4: Re-run browser tests**

Run:

- `pnpm web:build`
- `pnpm playwright test apps/web/test/graph-first-workspace.spec.ts`

Expected: PASS on both desktop and mobile assertions

- [ ] **Step 5: Commit**

```bash
git add apps/web/test/helpers/graphtrace-fixture-server.ts apps/web/test/graph-first-workspace.spec.ts playwright.config.ts
git commit -m "Add browser regression coverage for graph-first workflow"
```

### Task 8: Refresh screenshots and perform full verification

**Files:**
- Modify: `README.md`
- Modify: `docs/screenshots/workspace-overview-en.png`
- Modify: `docs/screenshots/symbol-execution-graph-en.png`

- [ ] **Step 1: Capture updated screenshots if the UI changed materially**

Use the Playwright flow or a manual local run to update:

- `docs/screenshots/workspace-overview-en.png`
- `docs/screenshots/symbol-execution-graph-en.png`

Only do this after the focused layout is stable.

- [ ] **Step 2: Run the full verification suite**

Run:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm web:build`
- `pnpm playwright test`

Expected:

- all commands PASS
- no i18n gaps
- desktop and mobile workflow stays readable

- [ ] **Step 3: Update README only if screenshots changed**

If the visible UI changed enough that the current README shots are misleading:

- replace the screenshot assets
- keep the existing README narrative unless the UI workflow wording is now stale

- [ ] **Step 4: Commit**

```bash
git add README.md docs/screenshots/workspace-overview-en.png docs/screenshots/symbol-execution-graph-en.png
git commit -m "Refresh graph-first workspace screenshots"
```

## Execution Order Summary

1. Lock the presentation-state contract with tests.
2. Extract the workspace screen boundary before changing behavior.
3. Promote graph plus inspector and demote supporting panels.
4. Unify active-state affordances across graph, search, and inspector.
5. Preserve trust metadata in the symbol inspector model.
6. Render provenance and confidence so users can judge the graph quickly.
7. Add desktop and mobile Playwright regression coverage.
8. Refresh product screenshots only after the UI is stable.

## Expected End State

After this plan lands:

- selecting a symbol immediately promotes graph plus inspector as the primary surface
- search result -> graph -> inspector reads as one continuous investigation loop
- provenance and confidence are visible where users make navigation decisions
- mobile shows useful graph state before the user scrolls through support content
- `App.tsx` remains an orchestration file instead of becoming the permanent dumping ground for another UI rewrite

Plan complete and saved to `docs/superpowers/plans/2026-04-12-graph-first-workspace-ux.md`. Ready to execute?
