import { describe, expect, test } from "vitest";

import {
  buildArchitectureGraph,
  type GraphEdgeFilters,
} from "../../../apps/web/src/architecture-graph";
import type {
  GraphItem,
  PackageSummary,
  RouteSummary,
  SearchResult,
} from "../../../apps/web/src/view-model";

const packages: PackageSummary[] = [
  {
    id: "package:packages/server",
    label: "@graphtrace/server",
    path: "packages/server",
  },
  {
    id: "package:packages/query-engine",
    label: "@graphtrace/query-engine",
    path: "packages/query-engine",
  },
  {
    id: "package:fixtures/express-prisma-workspace/apps/api",
    label: "@fixture/api",
    path: "fixtures/express-prisma-workspace/apps/api",
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
    id: "GET /users",
    method: "GET",
    path: "/users",
    filePath: "fixtures/express-prisma-workspace/apps/api/src/routes/users.ts",
    framework: "express",
    confidence: 0.9,
  },
];

const routeFlow: GraphItem[] = [
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
    id: "file:packages/query-engine/src/index.ts",
    kind: "file",
    label: "packages/query-engine/src/index.ts",
    path: "packages/query-engine/src/index.ts",
  },
  {
    id: "query:packages/indexer/src/workspace.ts#db.select().from(",
    kind: "query",
    label: "db.select().from(",
    path: "packages/indexer/src/workspace.ts",
  },
];

const dependencyItems: GraphItem[] = [
  {
    id: "file:packages/query-engine/src/index.ts",
    kind: "file",
    label: "packages/query-engine/src/index.ts",
    path: "packages/query-engine/src/index.ts",
  },
  {
    id: "file:fixtures/express-prisma-workspace/apps/api/src/routes/users.ts",
    kind: "file",
    label: "fixtures/express-prisma-workspace/apps/api/src/routes/users.ts",
    path: "fixtures/express-prisma-workspace/apps/api/src/routes/users.ts",
  },
];

const impactItems: GraphItem[] = [
  {
    id: "GET /api/impact",
    kind: "route",
    label: "GET /api/impact",
    path: "packages/server/src/index.ts",
  },
  {
    id: "file:packages/server/src/bin.ts",
    kind: "file",
    label: "packages/server/src/bin.ts",
    path: "packages/server/src/bin.ts",
  },
];

const allEdges: GraphEdgeFilters = {
  flow: true,
  depends: true,
  impacts: true,
  contains: true,
};

describe("architecture graph", () => {
  test("builds a bounded route-centered graph with route, files, packages, and query hints", () => {
    const graph = buildArchitectureGraph({
      inspector: {
        type: "route",
        route: routes[0]!,
      },
      packages,
      routes,
      routeFlow,
      dependencyItems,
      impactItems,
      scopeMode: "primary",
      selectedPackageId: "",
      edgeFilters: allEdges,
    });

    expect(graph.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        "GET /api/impact",
        "file:packages/server/src/index.ts",
        "file:packages/query-engine/src/index.ts",
        "package:packages/server",
        "package:packages/query-engine",
        "query:packages/indexer/src/workspace.ts#db.select().from(",
      ]),
    );
    expect(graph.edges.map((edge) => edge.kind)).toEqual(
      expect.arrayContaining(["flow", "contains"]),
    );
    expect(graph.focusId).toBe("GET /api/impact");
  });

  test("builds a file-centered graph with dependency and impact edges", () => {
    const selectedFile: SearchResult = {
      id: "file:packages/server/src/index.ts",
      kind: "file",
      label: "packages/server/src/index.ts",
      path: "packages/server/src/index.ts",
    };

    const graph = buildArchitectureGraph({
      inspector: {
        type: "search",
        item: selectedFile,
      },
      packages,
      routes,
      routeFlow,
      dependencyItems,
      impactItems,
      scopeMode: "primary",
      selectedPackageId: "",
      edgeFilters: allEdges,
    });

    expect(graph.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        "file:packages/server/src/index.ts",
        "file:packages/query-engine/src/index.ts",
        "GET /api/impact",
        "package:packages/server",
      ]),
    );
    expect(graph.edges.map((edge) => edge.kind)).toEqual(
      expect.arrayContaining(["depends", "impacts", "contains"]),
    );
  });

  test("keeps the graph scoped and removes fixture neighbors in primary mode", () => {
    const selectedFile: SearchResult = {
      id: "file:packages/server/src/index.ts",
      kind: "file",
      label: "packages/server/src/index.ts",
      path: "packages/server/src/index.ts",
    };

    const graph = buildArchitectureGraph({
      inspector: {
        type: "search",
        item: selectedFile,
      },
      packages,
      routes,
      routeFlow,
      dependencyItems,
      impactItems,
      scopeMode: "primary",
      selectedPackageId: "",
      edgeFilters: allEdges,
    });

    expect(
      graph.nodes.some((node) => node.id.includes("fixtures/express-prisma")),
    ).toBe(false);
  });

  test("supports package-centered neighborhoods and edge toggles", () => {
    const selectedPackage: SearchResult = {
      id: "package:packages/server",
      kind: "package",
      label: "@graphtrace/server",
      path: "packages/server",
    };

    const graph = buildArchitectureGraph({
      inspector: {
        type: "search",
        item: selectedPackage,
      },
      packages,
      routes,
      routeFlow,
      dependencyItems,
      impactItems,
      scopeMode: "all",
      selectedPackageId: "package:packages/server",
      edgeFilters: {
        flow: true,
        depends: false,
        impacts: false,
        contains: true,
      },
    });

    expect(graph.focusId).toBe("package:packages/server");
    expect(graph.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        "package:packages/server",
        "GET /api/impact",
      ]),
    );
    expect(graph.edges.every((edge) => edge.kind !== "depends")).toBe(true);
    expect(graph.edges.every((edge) => edge.kind !== "impacts")).toBe(true);
  });
});
