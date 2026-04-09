import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { ensureWorkspaceInitialized } from "@graphtrace/config";
import { indexWorkspace } from "@graphtrace/indexer";
import type {
  GraphEnvelope,
  QueryResult,
  SearchItem,
} from "@graphtrace/shared";
import { openGraphStore } from "@graphtrace/storage";
import { createQueryEngine } from "../src/index";

const fixtureRoot = join(process.cwd(), "fixtures", "express-prisma-workspace");
const nextFixtureRoot = join(process.cwd(), "fixtures", "next-api-workspace");
const nestFixtureRoot = join(
  process.cwd(),
  "fixtures",
  "nest-drizzle-workspace",
);
const fastifyFixtureRoot = join(process.cwd(), "fixtures", "fastify-workspace");
const selfHostRoot = process.cwd();

describe("query engine", () => {
  test("query results can include a symbol graph envelope alongside items", () => {
    const result: QueryResult<SearchItem> = {
      items: [
        {
          id: "symbol:apps/api/src/routes/users.ts#listUsers",
          kind: "symbol",
          label: "listUsers function apps/api/src/routes/users.ts",
          path: "apps/api/src/routes/users.ts",
          score: 100,
        },
      ],
      graph: {
        nodes: [
          {
            id: "symbol:apps/api/src/routes/users.ts#listUsers",
            kind: "symbol",
            label: "listUsers",
            path: "apps/api/src/routes/users.ts",
            symbol: {
              id: "symbol:apps/api/src/routes/users.ts#listUsers",
              name: "listUsers",
              displayName: "listUsers",
              kind: "function",
              language: "typescript",
              fileId: "file:apps/api/src/routes/users.ts",
              filePath: "apps/api/src/routes/users.ts",
              exported: true,
              span: {
                startLine: 4,
                startColumn: 1,
                endLine: 12,
                endColumn: 2,
              },
            },
          },
        ],
        edges: [
          {
            id: "edge:symbol:listUsers->query",
            type: "queries",
            sourceId: "symbol:apps/api/src/routes/users.ts#listUsers",
            sourceKind: "symbol",
            targetId: "query:apps/api/src/routes/users.ts#0",
            targetKind: "query",
            confidence: 1,
            confidenceLabel: "proven",
            provenance: {
              kind: "static-call",
              source: "typescript-checker",
              evidence: ["CallExpression"],
            },
          },
        ],
        summary: {
          nodeCount: 1,
          edgeCount: 1,
          rootNodeIds: ["symbol:apps/api/src/routes/users.ts#listUsers"],
          confidence: {
            proven: 1,
          },
        },
      } satisfies GraphEnvelope,
    };

    expect(result.graph?.summary.nodeCount).toBe(1);
    expect(result.graph?.edges[0]).toMatchObject({
      confidenceLabel: "proven",
    });
  });

  test("search results expose a graph envelope key for symbol-first consumers", async () => {
    await ensureWorkspaceInitialized(fixtureRoot);
    await indexWorkspace({ workspaceRoot: fixtureRoot, full: true });

    const store = openGraphStore(join(fixtureRoot, ".graphtrace", "index.db"));

    try {
      const result = createQueryEngine(store).search("listUsers");

      expect(result).toHaveProperty("graph");
      expect(result.graph).toMatchObject({
        nodes: expect.any(Array),
        edges: expect.any(Array),
        summary: expect.objectContaining({
          nodeCount: expect.any(Number),
          edgeCount: expect.any(Number),
        }),
      });
    } finally {
      store.close();
    }
  });

  test("search, routes, deps, impact, and flow work on the express fixture", async () => {
    await ensureWorkspaceInitialized(fixtureRoot);
    await indexWorkspace({ workspaceRoot: fixtureRoot, full: true });

    const store = openGraphStore(join(fixtureRoot, ".graphtrace", "index.db"));
    const queryEngine = createQueryEngine(store);

    const search = queryEngine.search("listUsers");
    const routes = queryEngine.routes();
    const deps = queryEngine.dependencies("apps/api/src/routes/users.ts");
    const impact = queryEngine.impact("apps/api/src/services/user-service.ts");
    const flow = queryEngine.flow("GET /users");

    expect(search.items.some((item) => item.id.includes("listUsers"))).toBe(
      true,
    );
    expect(routes.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/users",
          method: "GET",
        }),
      ]),
    );
    expect(
      deps.items.some((item) => item.path?.includes("user-service.ts")),
    ).toBe(true);
    expect(
      impact.items.some(
        (item) => item.kind === "route" && item.id === "GET /users",
      ),
    ).toBe(true);
    expect(flow.items.some((item) => item.kind === "query")).toBe(true);
  });

  test("exposes framework metadata for next, nest, and fastify routes", async () => {
    await ensureWorkspaceInitialized(nextFixtureRoot);
    await ensureWorkspaceInitialized(nestFixtureRoot);
    await ensureWorkspaceInitialized(fastifyFixtureRoot);
    await indexWorkspace({ workspaceRoot: nextFixtureRoot, full: true });
    await indexWorkspace({ workspaceRoot: nestFixtureRoot, full: true });
    await indexWorkspace({ workspaceRoot: fastifyFixtureRoot, full: true });

    const nextStore = openGraphStore(
      join(nextFixtureRoot, ".graphtrace", "index.db"),
    );
    const nestStore = openGraphStore(
      join(nestFixtureRoot, ".graphtrace", "index.db"),
    );
    const fastifyStore = openGraphStore(
      join(fastifyFixtureRoot, ".graphtrace", "index.db"),
    );

    try {
      const nextRoutes = createQueryEngine(nextStore).routes();
      const nestRoutes = createQueryEngine(nestStore).routes();
      const nestFlow = createQueryEngine(nestStore).flow("GET /users");
      const fastifyRoutes = createQueryEngine(fastifyStore).routes();

      expect(nextRoutes.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            framework: "next",
            path: "/users",
          }),
        ]),
      );
      expect(nestRoutes.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            framework: "nest",
            path: "/users",
          }),
        ]),
      );
      expect(nestFlow.items.some((item) => item.kind === "query")).toBe(true);
      expect(fastifyRoutes.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            framework: "fastify",
            path: "/users",
          }),
        ]),
      );
    } finally {
      nextStore.close();
      nestStore.close();
      fastifyStore.close();
    }
  });

  test("resolves workspace package imports on the self-host repo", async () => {
    await ensureWorkspaceInitialized(selfHostRoot);
    await indexWorkspace({ workspaceRoot: selfHostRoot, full: true });

    const store = openGraphStore(join(selfHostRoot, ".graphtrace", "index.db"));

    try {
      const deps = createQueryEngine(store).dependencies(
        "packages/server/src/index.ts",
        "out",
        2,
      );

      expect(
        deps.items.some((item) =>
          item.path?.includes("packages/query-engine/src/index.ts"),
        ),
      ).toBe(true);
      expect(
        deps.items.some((item) => item.path?.includes("packages/storage/src")),
      ).toBe(true);
    } finally {
      store.close();
    }
  });
});
