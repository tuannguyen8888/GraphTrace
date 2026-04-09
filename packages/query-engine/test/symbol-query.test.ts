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
          line: 5,
          column: 31,
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
});
