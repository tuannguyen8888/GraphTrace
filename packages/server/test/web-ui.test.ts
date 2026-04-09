import { describe, expect, test } from "vitest";

import {
  type DiscoveredUnit,
  createGraphEnvelope,
  deriveRepositories,
  resolveRepositoryForPath,
} from "@graphtrace/shared";

import {
  type WorkspaceHomeSummary,
  buildWorkspaceCards,
} from "../../../apps/web/src/home-view-model";
import { getMessages } from "../../../apps/web/src/i18n";
import {
  buildRouteHref,
  parseRouteState,
} from "../../../apps/web/src/route-state";
import {
  buildSymbolGraphControlsState,
  buildSymbolInspectorSections,
} from "../../../apps/web/src/symbol-graph-view-model";
import type {
  GraphItem,
  PackageSummary,
  RouteSummary,
  SearchResult,
} from "../../../apps/web/src/view-model";
import {
  buildGraphTraceCommand,
  buildPackageEntries,
  buildRouteInsights,
  buildSearchWorkbenchGuidance,
  buildWorkspaceStarterGuide,
  filterRoutesForDisplay,
  filterSearchResultsForDisplay,
  matchesScope,
} from "../../../apps/web/src/view-model";

const packages: PackageSummary[] = [
  {
    id: "package:packages/server",
    label: "@graphtrace/server",
    path: "packages/server",
  },
  {
    id: "package:fixtures/express-prisma-workspace/apps/api",
    label: "@fixture/api",
    path: "fixtures/express-prisma-workspace/apps/api",
  },
  {
    id: "package:fixtures/mixed-workspace/services/api",
    label: "@fixture/api",
    path: "fixtures/mixed-workspace/services/api",
  },
  {
    id: "package:packages/cli",
    label: "graphtrace",
    path: "packages/cli",
  },
  {
    id: "package:.",
    label: "graphtrace-workspace",
    path: ".",
  },
];

const routes: RouteSummary[] = [
  {
    id: "GET /api/impact",
    method: "GET",
    path: "/api/impact",
    filePath: "packages/server/src/index.ts",
    framework: "fastify",
    confidence: 0.95,
  },
  {
    id: "GET /admins",
    method: "GET",
    path: "/admins",
    filePath: "packages/cli/test/watch.test.ts",
    framework: "express",
    confidence: 0.95,
  },
  {
    id: "GET /users",
    method: "GET",
    path: "/users",
    filePath: "fixtures/express-prisma-workspace/apps/api/src/routes/users.ts",
    framework: "express",
    confidence: 0.9,
  },
];

const searchResults: SearchResult[] = [
  {
    id: "symbol:packages/server/src/index.ts#startGraphTraceServer",
    kind: "symbol",
    label: "startGraphTraceServer function packages/server/src/index.ts",
    path: "packages/server/src/index.ts",
  },
  {
    id: "symbol:fixtures/express-prisma-workspace/apps/api/src/server.ts#app_get_handler",
    kind: "symbol",
    label:
      "app_get_handler function fixtures/express-prisma-workspace/apps/api/src/server.ts",
    path: "fixtures/express-prisma-workspace/apps/api/src/server.ts",
  },
];

const units: DiscoveredUnit[] = [
  {
    id: "unit:root",
    rootPath: ".",
    displayName: "graphtrace-workspace",
    kind: "project",
    language: "unknown",
    tooling: "pnpm",
    indexingMode: "shallow",
    confidence: 100,
    signals: [],
    sourceRoots: ["."],
    pluginMatches: [],
  },
  {
    id: "unit:packages/server",
    rootPath: "packages/server",
    displayName: "@graphtrace/server",
    kind: "package",
    language: "js-ts",
    tooling: "node",
    indexingMode: "full",
    confidence: 100,
    signals: [],
    sourceRoots: ["packages/server/src"],
    parentUnitId: "unit:root",
    pluginMatches: [],
  },
  {
    id: "unit:fixtures/express-prisma-workspace",
    rootPath: "fixtures/express-prisma-workspace",
    displayName: "express-prisma-workspace",
    kind: "subproject",
    language: "js-ts",
    tooling: "node",
    indexingMode: "shallow",
    confidence: 90,
    signals: [],
    sourceRoots: ["fixtures/express-prisma-workspace/apps"],
    parentUnitId: "unit:root",
    pluginMatches: [],
  },
  {
    id: "unit:fixtures/backend-frontend-workspace",
    rootPath: "fixtures/backend-frontend-workspace",
    displayName: "backend-frontend-workspace",
    kind: "subproject",
    language: "js-ts",
    tooling: "node",
    indexingMode: "shallow",
    confidence: 90,
    signals: [],
    sourceRoots: ["fixtures/backend-frontend-workspace/backend"],
    parentUnitId: "unit:root",
    pluginMatches: [],
  },
];

const monorepoUnits: DiscoveredUnit[] = [
  {
    id: "unit:root",
    rootPath: ".",
    displayName: "tawaco",
    kind: "project",
    language: "unknown",
    tooling: "pnpm",
    indexingMode: "shallow",
    confidence: 100,
    signals: [],
    sourceRoots: ["apps", "src"],
    pluginMatches: [],
  },
  {
    id: "unit:apps",
    rootPath: "apps",
    displayName: "apps",
    kind: "subproject",
    language: "js-ts",
    tooling: "pnpm",
    indexingMode: "shallow",
    confidence: 80,
    signals: [],
    sourceRoots: ["apps"],
    parentUnitId: "unit:root",
    pluginMatches: [],
  },
  {
    id: "unit:apps/backoffice",
    rootPath: "apps/backoffice",
    displayName: "web",
    kind: "app",
    language: "js-ts",
    tooling: "pnpm",
    indexingMode: "full",
    confidence: 95,
    signals: [],
    sourceRoots: ["apps/backoffice/src"],
    parentUnitId: "unit:apps",
    pluginMatches: [],
  },
  {
    id: "unit:apps/kiosk",
    rootPath: "apps/kiosk",
    displayName: "web",
    kind: "app",
    language: "js-ts",
    tooling: "pnpm",
    indexingMode: "full",
    confidence: 95,
    signals: [],
    sourceRoots: ["apps/kiosk/src"],
    parentUnitId: "unit:apps",
    pluginMatches: [],
  },
];

const workspaces: WorkspaceHomeSummary[] = [
  {
    id: "graphtrace-123abc",
    label: "GraphTrace",
    canonicalRootPath: "/tmp/GraphTrace",
    status: "ready",
    dbPath: "/tmp/.graphtrace/workspaces/graphtrace-123abc/index.db",
    snapshot: {
      packageCount: 8,
      fileCount: 56,
      symbolCount: 312,
      routeCount: 4,
      queryEdgeCount: 18,
      lastIndexCompletedAt: "2026-04-07T20:00:00.000Z",
    },
  },
  {
    id: "tawaco-987def",
    label: "tawaco",
    canonicalRootPath: "/tmp/tawaco",
    status: "indexing",
    dbPath: "/tmp/.graphtrace/workspaces/tawaco-987def/index.db",
    snapshot: {
      packageCount: 3,
      fileCount: 81,
      symbolCount: 534,
      routeCount: 0,
      queryEdgeCount: 0,
      lastIndexCompletedAt: null,
    },
  },
];

const symbolGraph = createGraphEnvelope({
  nodes: [
    {
      id: "symbol:apps/api/src/services/user-service.ts#listUsers",
      kind: "symbol",
      label: "listUsers",
      path: "apps/api/src/services/user-service.ts",
    },
    {
      id: "symbol:apps/api/src/routes/users.ts#auditedListUsers",
      kind: "symbol",
      label: "auditedListUsers",
      path: "apps/api/src/routes/users.ts",
    },
    {
      id: "symbol:apps/api/src/services/user-service.ts#withAudit",
      kind: "symbol",
      label: "withAudit",
      path: "apps/api/src/services/user-service.ts",
    },
    {
      id: "symbol:apps/api/src/routes/users.ts#legacyWrapper",
      kind: "symbol",
      label: "legacyWrapper",
      path: "apps/api/src/routes/users.ts",
    },
    {
      id: "symbol:apps/api/src/services/user-service.ts#prisma",
      kind: "symbol",
      label: "prisma",
      path: "apps/api/src/services/user-service.ts",
    },
    {
      id: "GET /users",
      kind: "route",
      label: "GET /users",
      path: "apps/api/src/routes/users.ts",
    },
    {
      id: "query:apps/api/src/services/user-service.ts#prisma.user.findMany(",
      kind: "query",
      label: "prisma.user.findMany(",
    },
  ],
  edges: [
    {
      id: "edge:calls:auditedListUsers->listUsers",
      type: "calls",
      sourceId: "symbol:apps/api/src/routes/users.ts#auditedListUsers",
      sourceKind: "symbol",
      targetId: "symbol:apps/api/src/services/user-service.ts#listUsers",
      targetKind: "symbol",
      confidence: 0.85,
      confidenceLabel: "inferred-strong",
    },
    {
      id: "edge:references:withAudit->listUsers",
      type: "references",
      sourceId: "symbol:apps/api/src/services/user-service.ts#withAudit",
      sourceKind: "symbol",
      targetId: "symbol:apps/api/src/services/user-service.ts#listUsers",
      targetKind: "symbol",
      confidence: 1,
      confidenceLabel: "proven",
    },
    {
      id: "edge:calls:legacyWrapper->listUsers",
      type: "calls",
      sourceId: "symbol:apps/api/src/routes/users.ts#legacyWrapper",
      sourceKind: "symbol",
      targetId: "symbol:apps/api/src/services/user-service.ts#listUsers",
      targetKind: "symbol",
      confidence: 0.45,
      confidenceLabel: "inferred-weak",
    },
    {
      id: "edge:references:listUsers->prisma",
      type: "references",
      sourceId: "symbol:apps/api/src/services/user-service.ts#listUsers",
      sourceKind: "symbol",
      targetId: "symbol:apps/api/src/services/user-service.ts#prisma",
      targetKind: "symbol",
      confidence: 1,
      confidenceLabel: "proven",
    },
    {
      id: "edge:routes_to:GET /users->listUsers",
      type: "routes_to",
      sourceId: "GET /users",
      sourceKind: "route",
      targetId: "symbol:apps/api/src/services/user-service.ts#listUsers",
      targetKind: "symbol",
      confidence: 1,
      confidenceLabel: "proven",
    },
    {
      id: "edge:queries:listUsers->findMany",
      type: "queries",
      sourceId: "symbol:apps/api/src/services/user-service.ts#listUsers",
      sourceKind: "symbol",
      targetId:
        "query:apps/api/src/services/user-service.ts#prisma.user.findMany(",
      targetKind: "query",
      confidence: 1,
      confidenceLabel: "proven",
    },
  ],
  summary: {
    nodeCount: 7,
    edgeCount: 6,
    rootNodeIds: ["symbol:apps/api/src/services/user-service.ts#listUsers"],
    confidence: {
      proven: 4,
      "inferred-strong": 1,
      "inferred-weak": 1,
    },
  },
});

describe("web ui view-model", () => {
  test("derives explicit repositories from workspace units and resolves paths against them", () => {
    const repositories = deriveRepositories(units);

    expect(repositories.map((entry) => entry.id)).toEqual([
      ".",
      "fixtures/backend-frontend-workspace",
      "fixtures/express-prisma-workspace",
    ]);
    expect(
      resolveRepositoryForPath("packages/server/src/index.ts", repositories)
        ?.id,
    ).toBe(".");
    expect(
      resolveRepositoryForPath(
        "fixtures/express-prisma-workspace/apps/api/src/server.ts",
        repositories,
      )?.id,
    ).toBe("fixtures/express-prisma-workspace");
  });

  test("filters fixtures out of the default primary scope but keeps them for tests scope", () => {
    expect(matchesScope("packages/server/src/index.ts", "primary")).toBe(true);
    expect(matchesScope("packages/cli/test/cli.test.ts", "primary")).toBe(
      false,
    );
    expect(
      matchesScope(
        "fixtures/express-prisma-workspace/apps/api/src/routes/users.ts",
        "primary",
      ),
    ).toBe(false);
    expect(
      matchesScope(
        "fixtures/express-prisma-workspace/apps/api/src/routes/users.ts",
        "tests",
      ),
    ).toBe(true);
    expect(matchesScope("packages/cli/test/cli.test.ts", "tests")).toBe(true);
  });

  test("promotes nested app scopes as repository candidates and disambiguates duplicate labels", () => {
    const repositories = deriveRepositories(monorepoUnits);

    expect(repositories.map((entry) => entry.id)).toEqual([
      ".",
      "apps/backoffice",
      "apps/kiosk",
    ]);
    expect(
      repositories.find((entry) => entry.id === "apps/backoffice")?.label,
    ).toBe("web · apps/backoffice");
    expect(repositories.find((entry) => entry.id === "apps/kiosk")?.label).toBe(
      "web · apps/kiosk",
    );
    expect(
      resolveRepositoryForPath("apps/backoffice/src/main.tsx", repositories)
        ?.id,
    ).toBe("apps/backoffice");
    expect(
      resolveRepositoryForPath("apps/kiosk/src/main.tsx", repositories)?.id,
    ).toBe("apps/kiosk");
  });

  test("builds package entries with disambiguation for duplicate labels", () => {
    const entries = buildPackageEntries(packages, "all");
    const duplicateEntries = entries.filter(
      (entry) => entry.label === "@fixture/api",
    );

    expect(duplicateEntries).toHaveLength(2);
    expect(duplicateEntries.every((entry) => entry.disambiguation)).toBe(true);
    expect(duplicateEntries.map((entry) => entry.secondaryLabel)).toEqual(
      expect.arrayContaining([
        "fixtures/express-prisma-workspace/apps/api",
        "fixtures/mixed-workspace/services/api",
      ]),
    );
  });

  test("keeps the workspace shell package after concrete repo packages in primary mode", () => {
    const repositories = deriveRepositories(units);
    const entries = buildPackageEntries(packages, "primary", repositories, ".");

    expect(entries.map((entry) => entry.id)).toContain("package:packages/cli");
    expect(entries.map((entry) => entry.id)).toContain(
      "package:packages/server",
    );
    expect(entries.at(-1)?.id).toBe("package:.");
  });

  test("filters routes using package id rather than ambiguous package label", () => {
    const repositories = deriveRepositories(units);
    const primaryRoutes = filterRoutesForDisplay(routes, packages, {
      repositories,
      selectedRepositoryId: ".",
      scopeMode: "primary",
      selectedPackageId: "",
    });
    const serverRoutes = filterRoutesForDisplay(routes, packages, {
      repositories,
      selectedRepositoryId: ".",
      scopeMode: "all",
      selectedPackageId: "package:packages/server",
    });
    const fixtureRoutes = filterRoutesForDisplay(routes, packages, {
      repositories,
      selectedRepositoryId: "fixtures/express-prisma-workspace",
      scopeMode: "all",
      selectedPackageId: "package:fixtures/express-prisma-workspace/apps/api",
    });

    expect(primaryRoutes.map((route) => route.id)).toEqual(["GET /api/impact"]);
    expect(serverRoutes.map((route) => route.id)).toEqual(["GET /api/impact"]);
    expect(fixtureRoutes.map((route) => route.id)).toEqual(["GET /users"]);
  });

  test("filters search results by scope", () => {
    const repositories = deriveRepositories(units);
    expect(
      filterSearchResultsForDisplay(
        searchResults,
        "primary",
        repositories,
        ".",
      ),
    ).toHaveLength(1);
    expect(filterSearchResultsForDisplay(searchResults, "tests")).toHaveLength(
      1,
    );
    expect(
      filterSearchResultsForDisplay(
        searchResults,
        "all",
        repositories,
        "fixtures/express-prisma-workspace",
      ),
    ).toHaveLength(1);
  });

  test("builds guided search quick picks for first-run repo triage", () => {
    const repositories = deriveRepositories(units);
    const guidance = buildSearchWorkbenchGuidance({
      locale: "en",
      packages,
      routes,
      repositories,
      selectedRepositoryId: ".",
      scopeMode: "primary",
      selectedPackageId: "",
      searchKind: "symbol",
    });

    expect(guidance.quickPicks).toHaveLength(3);
    expect(guidance.quickPicks.map((item) => item.kind)).toEqual([
      "route",
      "package",
      "file",
    ]);
    expect(guidance.quickPicks.map((item) => item.query)).toEqual([
      "GET /api/impact",
      "@graphtrace/server",
      "packages/server/src/index.ts",
    ]);
    expect(guidance.triageSteps[0]).toContain("route");
  });

  test("adapts guided search quick picks when scope and package change", () => {
    const repositories = deriveRepositories(units);
    const packageScoped = buildSearchWorkbenchGuidance({
      locale: "en",
      packages,
      routes,
      repositories,
      selectedRepositoryId: ".",
      scopeMode: "all",
      selectedPackageId: "package:packages/server",
      searchKind: "route",
    });
    const testsScoped = buildSearchWorkbenchGuidance({
      locale: "vi",
      packages,
      routes,
      repositories,
      selectedRepositoryId: ".",
      scopeMode: "tests",
      selectedPackageId: "",
      searchKind: "route",
    });

    expect(packageScoped.quickPicks.map((item) => item.query)).toEqual([
      "GET /api/impact",
      "@graphtrace/server",
      "packages/server/src/index.ts",
    ]);
    expect(testsScoped.quickPicks.map((item) => item.query)).toEqual([
      "GET /admins",
      "graphtrace",
      "packages/cli/test/watch.test.ts",
    ]);
    expect(packageScoped.kindGuide).toContain("HTTP");
    expect(testsScoped.emptyStateTitle).toContain("Bắt đầu");
    expect(testsScoped.kindGuide).toContain("Tìm route");
  });

  test("builds starter actions that open concrete entrypoints before the inspector is active", () => {
    const repositories = deriveRepositories(units);
    const starterGuide = buildWorkspaceStarterGuide({
      locale: "en",
      packages,
      routes,
      repositories,
      selectedRepositoryId: ".",
      scopeMode: "primary",
      selectedPackageId: "",
    });

    expect(starterGuide.actions.map((item) => item.kind)).toEqual([
      "route",
      "file",
      "package",
    ]);
    expect(starterGuide.actions.map((item) => item.query)).toEqual([
      "GET /api/impact",
      "packages/server/src/index.ts",
      "@graphtrace/server",
    ]);
  });

  test("falls back to file-first starter actions when the current scope has no routes", () => {
    const starterGuide = buildWorkspaceStarterGuide({
      locale: "vi",
      packages: [
        {
          id: "package:.",
          label: "tawaco-kiosk",
          path: ".",
        },
      ],
      routes: [],
      repositories: [
        {
          id: ".",
          rootPath: ".",
          label: "tawaco-kiosk",
          kind: "primary",
          sourceUnitId: "unit:apps/kiosk",
        },
      ],
      selectedRepositoryId: ".",
      scopeMode: "primary",
      selectedPackageId: "",
    });

    expect(starterGuide.actions.map((item) => item.kind)).toEqual(["package"]);
    expect(starterGuide.title).toContain("Điểm bắt đầu");
  });

  test.each([
    ["app intro", "intro", "Tìm trong code, xem route"],
    [
      "graph description",
      "architectureGraphDescription",
      "Đồ thị chỉ hiển thị vùng lân cận quanh vùng chọn hiện tại",
    ],
    [
      "inspector empty",
      "inspectorEmpty",
      "Chọn một route, file hoặc kết quả tìm kiếm",
    ],
  ] satisfies Array<
    [string, keyof ReturnType<typeof getMessages>["app"], string]
  >)("uses Vietnamese copy for %s", (_label, key, expected) => {
    const messages = getMessages("vi");

    expect(messages.app[key]).toContain(expected);
  });

  test("exposes symbol graph labels for execution, impact, reference, and inspector sections", () => {
    const messages = getMessages("en");

    expect(messages.app.symbolGraphExecution).toBe("Execution");
    expect(messages.app.symbolGraphImpact).toBe("Impact");
    expect(messages.app.symbolGraphReference).toBe("Reference");
    expect(messages.app.symbolGraphCallers).toBe("Callers");
    expect(messages.app.symbolGraphCallees).toBe("Callees");
    expect(messages.app.symbolGraphRoutes).toBe("Routes");
    expect(messages.app.symbolGraphSinks).toBe("Sinks");
  });

  test("builds symbol inspector sections for reference mode from proven reference edges only", () => {
    const sections = buildSymbolInspectorSections({
      graph: symbolGraph,
      rootSymbolId: "symbol:apps/api/src/services/user-service.ts#listUsers",
      mode: "reference",
      confidenceFilter: "proven",
      labels: {
        callers: "Callers",
        callees: "Callees",
        routes: "Routes",
        sinks: "Sinks",
      },
    });

    expect(sections).toEqual([
      expect.objectContaining({
        id: "callers",
        items: [
          expect.objectContaining({
            id: "symbol:apps/api/src/services/user-service.ts#withAudit",
          }),
        ],
      }),
      expect.objectContaining({
        id: "callees",
        items: [
          expect.objectContaining({
            id: "symbol:apps/api/src/services/user-service.ts#prisma",
          }),
        ],
      }),
      expect.objectContaining({
        id: "routes",
        items: [],
      }),
      expect.objectContaining({
        id: "sinks",
        items: [],
      }),
    ]);
  });

  test("surfaces weak-edge warnings in the inspector and exposes control actions for impact and expansion", () => {
    const sections = buildSymbolInspectorSections({
      graph: symbolGraph,
      rootSymbolId: "symbol:apps/api/src/services/user-service.ts#listUsers",
      mode: "execution",
      confidenceFilter: "all",
      weakConfidenceWarning: "Contains weak-confidence edges.",
      labels: {
        callers: "Callers",
        callees: "Callees",
        routes: "Routes",
        sinks: "Sinks",
      },
    });
    const controls = buildSymbolGraphControlsState({
      graph: createGraphEnvelope({
        ...symbolGraph,
        summary: {
          ...symbolGraph.summary,
          truncated: {
            edgeLimitReached: true,
            omittedEdgeCount: 2,
          },
        },
      }),
      mode: "execution",
      confidenceFilter: "strong",
      labels: {
        showWeakerEdges: "Show weaker edges",
        expandCallers: "Expand callers",
        expandCallees: "Expand callees",
        openImpact: "Open impact",
      },
    });

    expect(sections[0]).toEqual(
      expect.objectContaining({
        id: "callers",
        warning: "Contains weak-confidence edges.",
      }),
    );
    expect(controls.actions.map((action) => action.id)).toEqual([
      "show-weaker-edges",
      "expand-callers",
      "expand-callees",
      "open-impact",
    ]);
  });

  test("keeps compact callback investigations focused without extra expansion actions", () => {
    const controls = buildSymbolGraphControlsState({
      graph: createGraphEnvelope({
        nodes: [
          {
            id: "symbol:apps/web/src/dashboard.tsx#Dashboard",
            kind: "symbol",
            label: "Dashboard",
            path: "apps/web/src/dashboard.tsx",
          },
          {
            id: "symbol:apps/web/src/dashboard.tsx#Dashboard.loadProfile",
            kind: "symbol",
            label: "Dashboard.loadProfile",
            path: "apps/web/src/dashboard.tsx",
          },
        ],
        edges: [
          {
            id: "edge:calls:Dashboard->loadProfile",
            type: "calls",
            sourceId: "symbol:apps/web/src/dashboard.tsx#Dashboard",
            sourceKind: "symbol",
            targetId: "symbol:apps/web/src/dashboard.tsx#Dashboard.loadProfile",
            targetKind: "symbol",
            confidence: 1,
            confidenceLabel: "proven",
          },
        ],
        summary: {
          nodeCount: 2,
          edgeCount: 1,
          rootNodeIds: ["symbol:apps/web/src/dashboard.tsx#Dashboard"],
          confidence: {
            proven: 1,
          },
        },
      }),
      mode: "execution",
      confidenceFilter: "strong",
      labels: {
        showWeakerEdges: "Show weaker edges",
        expandCallers: "Expand callers",
        expandCallees: "Expand callees",
        openImpact: "Open impact",
      },
    });

    expect(controls.actions.map((action) => action.id)).toEqual([
      "open-impact",
    ]);
  });

  test("derives route insights for related packages and query hints", () => {
    const flowItems: GraphItem[] = [
      {
        id: "GET /api/impact",
        kind: "route",
        label: "GET /api/impact",
        path: "packages/server/src/index.ts",
      },
      {
        id: "file:packages/server/src/index.ts",
        kind: "file",
        label: "packages/server/src/index.ts",
        path: "packages/server/src/index.ts",
      },
      {
        id: "query:packages/indexer/src/workspace.ts#db.select().from(",
        kind: "query",
        label: "db.select().from(",
        path: "packages/indexer/src/workspace.ts",
      },
    ];

    const insights = buildRouteInsights(flowItems, packages);

    expect(insights.files.map((item) => item.path)).toEqual([
      "packages/server/src/index.ts",
    ]);
    expect(insights.queryHints.map((item) => item.id)).toEqual([
      "query:packages/indexer/src/workspace.ts#db.select().from(",
    ]);
    expect(insights.relatedPackages.map((item) => item.id)).toContain(
      "package:packages/server",
    );
  });

  test("builds actionable CLI commands for routes, files, and queries", () => {
    expect(
      buildGraphTraceCommand({
        id: "GET /api/impact",
        kind: "route",
        label: "GET /api/impact",
        path: "packages/server/src/index.ts",
      }),
    ).toBe('graphtrace flow "GET /api/impact" --depth 6');
    expect(
      buildGraphTraceCommand({
        id: "file:packages/server/src/index.ts",
        kind: "file",
        label: "packages/server/src/index.ts",
        path: "packages/server/src/index.ts",
      }),
    ).toBe(
      'graphtrace deps "packages/server/src/index.ts" --direction both --depth 2',
    );
    expect(
      buildGraphTraceCommand({
        id: "query:packages/indexer/src/workspace.ts#db.select().from(",
        kind: "query",
        label: "db.select().from(",
        path: "packages/indexer/src/workspace.ts",
      }),
    ).toBe(
      'graphtrace deps "packages/indexer/src/workspace.ts" --direction both --depth 2',
    );
  });

  test("builds workspace cards for the home screen with status-aware summaries", () => {
    const cards = buildWorkspaceCards(workspaces, "en");
    const viCards = buildWorkspaceCards(workspaces, "vi");

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "graphtrace-123abc",
          statusTone: "ready",
          metricSummary: "8 packages · 56 files · 4 routes",
        }),
        expect.objectContaining({
          id: "tawaco-987def",
          statusTone: "indexing",
          statusLabel: "Indexing",
        }),
      ]),
    );
    expect(cards[1]?.timestampLabel).toBe("Indexing workspace...");
    expect(viCards[1]?.statusLabel).toBe("Đang lập chỉ mục");
    expect(viCards[1]?.timestampLabel).toBe("Đang lập chỉ mục workspace...");
    expect(cards[0]?.subline).toContain("/tmp/GraphTrace");
  });

  test("parses and rebuilds workspace detail routes with inner filters", () => {
    const state = parseRouteState(
      "http://127.0.0.1:4310/workspaces/graphtrace-123abc?repository=packages/server&scope=all&package=package%3Apackages%2Fserver&q=runCli&kind=symbol&lang=vi",
    );

    expect(state).toEqual(
      expect.objectContaining({
        workspaceId: "graphtrace-123abc",
        repositoryId: "packages/server",
        scopeMode: "all",
        selectedPackageId: "package:packages/server",
        searchText: "runCli",
        searchKind: "symbol",
        locale: "vi",
      }),
    );
    expect(
      buildRouteHref({
        workspaceId: "graphtrace-123abc",
        repositoryId: "packages/server",
        scopeMode: "all",
        selectedPackageId: "package:packages/server",
        searchText: "runCli",
        searchKind: "symbol",
        locale: "vi",
      }),
    ).toBe(
      "/workspaces/graphtrace-123abc?repository=packages%2Fserver&scope=all&package=package%3Apackages%2Fserver&q=runCli&kind=symbol&lang=vi",
    );
    expect(
      buildRouteHref({
        workspaceId: "",
        repositoryId: ".",
        scopeMode: "primary",
        selectedPackageId: "",
        searchText: "",
        searchKind: "symbol",
        locale: "vi",
      }),
    ).toBe("/?lang=vi");
  });
});
