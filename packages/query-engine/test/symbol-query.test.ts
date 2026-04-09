import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { ensureWorkspaceInitialized } from "@graphtrace/config";
import { indexWorkspace } from "@graphtrace/indexer";
import { openGraphStore } from "@graphtrace/storage";
import { createQueryEngine } from "../src/index";

const symbolGraphFixtureRoot = join(
  process.cwd(),
  "fixtures",
  "symbol-graph-workspace",
);

describe("symbol query engine", () => {
  test("searches symbols by name and returns a zero-hop graph envelope", async () => {
    await ensureWorkspaceInitialized(symbolGraphFixtureRoot);
    await indexWorkspace({
      workspaceRoot: symbolGraphFixtureRoot,
      full: true,
    });

    const store = openGraphStore(
      join(symbolGraphFixtureRoot, ".graphtrace", "index.db"),
    );

    try {
      const result = createQueryEngine(store).searchSymbols("report");

      expect(result.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "symbol:apps/api/src/services/user-service.ts#createReporter",
            kind: "function",
          }),
        ]),
      );
      expect(result.graph).toMatchObject({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: "symbol:apps/api/src/services/user-service.ts#createReporter",
          }),
        ]),
        summary: expect.objectContaining({
          nodeCount: expect.any(Number),
          edgeCount: 0,
        }),
      });
    } finally {
      store.close();
    }
  });

  test("resolves symbols by id, file plus name, and file plus position", async () => {
    await ensureWorkspaceInitialized(symbolGraphFixtureRoot);
    await indexWorkspace({
      workspaceRoot: symbolGraphFixtureRoot,
      full: true,
    });

    const store = openGraphStore(
      join(symbolGraphFixtureRoot, ".graphtrace", "index.db"),
    );

    try {
      const queryEngine = createQueryEngine(store);

      expect(
        queryEngine.getSymbol({
          symbolId: "symbol:apps/api/src/services/user-service.ts#createReporter",
        }).items[0],
      ).toMatchObject({
        id: "symbol:apps/api/src/services/user-service.ts#createReporter",
      });
      expect(
        queryEngine.getSymbol({
          filePath: "apps/api/src/services/user-service.ts",
          symbolName: "createReporter",
        }).items[0],
      ).toMatchObject({
        id: "symbol:apps/api/src/services/user-service.ts#createReporter",
      });
      expect(
        queryEngine.getSymbol({
          filePath: "apps/api/src/services/user-service.ts",
          line: 19,
          column: 33,
        }).items[0],
      ).toMatchObject({
        id: "symbol:apps/api/src/services/user-service.ts#createReporter",
      });
    } finally {
      store.close();
    }
  });

  test("returns symbol neighbors with a graph envelope rooted at the symbol", async () => {
    await ensureWorkspaceInitialized(symbolGraphFixtureRoot);
    await indexWorkspace({
      workspaceRoot: symbolGraphFixtureRoot,
      full: true,
    });

    const store = openGraphStore(
      join(symbolGraphFixtureRoot, ".graphtrace", "index.db"),
    );

    try {
      const result = createQueryEngine(store).getSymbolNeighbors({
        symbolId: "symbol:apps/api/src/routes/users.ts#router.post.reports",
      });

      expect(result.graph).toMatchObject({
        edges: expect.arrayContaining([
          expect.objectContaining({
            type: "calls",
            targetId: "symbol:apps/api/src/services/user-service.ts#createReporter",
          }),
        ]),
        summary: expect.objectContaining({
          rootNodeIds: [
            "symbol:apps/api/src/routes/users.ts#router.post.reports",
          ],
        }),
      });
    } finally {
      store.close();
    }
  });

  test("returns execution context, impact, and edge explanations for symbols", async () => {
    await ensureWorkspaceInitialized(symbolGraphFixtureRoot);
    await indexWorkspace({
      workspaceRoot: symbolGraphFixtureRoot,
      full: true,
    });

    const store = openGraphStore(
      join(symbolGraphFixtureRoot, ".graphtrace", "index.db"),
    );

    try {
      const queryEngine = createQueryEngine(store);
      const execution = queryEngine.executionContextFromSymbol(
        {
          symbolId: "symbol:apps/api/src/services/user-service.ts#listUsers",
        },
        { maxNodes: 10, maxEdges: 10 },
      );
      const impact = queryEngine.impactFromSymbol(
        {
          symbolId: "symbol:apps/api/src/routes/users.ts#auditedListUsers",
        },
        { maxNodes: 2, maxEdges: 1 },
      );
      const explanation = queryEngine.explainEdge(
        "edge:routes_to:GET /users->symbol:apps/api/src/routes/users.ts#auditedListUsers",
      );

      expect(execution.graph).toMatchObject({
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: "GET /users", kind: "route" }),
          expect.objectContaining({
            id: "query:apps/api/src/services/user-service.ts#prisma.user.findMany(",
            kind: "query",
          }),
        ]),
      });
      expect(impact.graph?.summary.truncated).toMatchObject({
        nodeLimitReached: true,
      });
      expect(explanation).toMatchObject({
        provenance: expect.objectContaining({
          kind: "route-handler",
        }),
      });
    } finally {
      store.close();
    }
  });
});
