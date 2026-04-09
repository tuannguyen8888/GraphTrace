import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { ensureWorkspaceInitialized } from "@graphtrace/config";
import { indexWorkspace } from "@graphtrace/indexer";
import { createGraphTraceApp } from "../src/index";

const symbolGraphFixtureRoot = join(
  process.cwd(),
  "fixtures",
  "symbol-graph-workspace",
);
const reactCallbackFixtureRoot = join(
  process.cwd(),
  "fixtures",
  "react-callback-workspace",
);

describe("symbol graph server", () => {
  test("serves symbol graph search, lookup, execution, impact, and edge explanation endpoints", async () => {
    await ensureWorkspaceInitialized(symbolGraphFixtureRoot);
    await indexWorkspace({
      workspaceRoot: symbolGraphFixtureRoot,
      full: true,
    });

    const app = createGraphTraceApp({
      workspaceRoot: symbolGraphFixtureRoot,
    });

    try {
      const search = await app.inject({
        method: "GET",
        url: "/api/symbols/search?q=report",
      });
      const getSymbol = await app.inject({
        method: "GET",
        url: `/api/symbols/get?filePath=${encodeURIComponent("apps/api/src/services/user-service.ts")}&symbolName=createReporter`,
      });
      const execution = await app.inject({
        method: "GET",
        url: `/api/symbols/execution?symbolId=${encodeURIComponent("symbol:apps/api/src/services/user-service.ts#listUsers")}&maxNodes=10&maxEdges=10`,
      });
      const impact = await app.inject({
        method: "GET",
        url: `/api/symbols/impact?symbolId=${encodeURIComponent("symbol:apps/api/src/routes/users.ts#auditedListUsers")}&maxNodes=2&maxEdges=1`,
      });
      const edge = await app.inject({
        method: "GET",
        url: `/api/symbols/edge?edgeId=${encodeURIComponent("edge:routes_to:GET /users->symbol:apps/api/src/routes/users.ts#auditedListUsers")}`,
      });

      const searchPayload = search.json();
      const getSymbolPayload = getSymbol.json();
      const executionPayload = execution.json();
      const impactPayload = impact.json();
      const edgePayload = edge.json();

      expect(searchPayload.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "symbol:apps/api/src/services/user-service.ts#createReporter",
          }),
        ]),
      );
      expect(getSymbolPayload.graph.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "symbol:apps/api/src/services/user-service.ts#createReporter",
          }),
        ]),
      );
      expect(executionPayload.graph.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "GET /users",
            kind: "route",
          }),
        ]),
      );
      expect(impactPayload.graph.summary.truncated).toMatchObject({
        nodeLimitReached: true,
      });
      expect(edgePayload).toMatchObject({
        id: "edge:routes_to:GET /users->symbol:apps/api/src/routes/users.ts#auditedListUsers",
        provenance: {
          kind: "route-handler",
        },
      });
    } finally {
      await app.close();
    }
  });

  test("keeps workspace callback investigations bounded and free of external library noise", async () => {
    await ensureWorkspaceInitialized(reactCallbackFixtureRoot);
    await indexWorkspace({
      workspaceRoot: reactCallbackFixtureRoot,
      full: true,
    });

    const app = createGraphTraceApp({
      workspaceRoot: reactCallbackFixtureRoot,
    });

    try {
      const execution = await app.inject({
        method: "GET",
        url: `/api/symbols/execution?filePath=${encodeURIComponent("apps/web/src/dashboard.tsx")}&symbolName=Dashboard&maxNodes=6&maxEdges=6`,
      });
      const payload = execution.json();

      expect(payload.graph.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "symbol:apps/web/src/dashboard.tsx#Dashboard.loadProfile",
          }),
        ]),
      );
      expect(payload.graph.summary.nodeCount).toBeLessThanOrEqual(6);
      expect(payload.graph.summary.edgeCount).toBeLessThanOrEqual(6);
      expect(
        payload.graph.nodes.every(
          (node: { id: string }) => !node.id.includes("node_modules/"),
        ),
      ).toBe(true);
    } finally {
      await app.close();
    }
  });
});
