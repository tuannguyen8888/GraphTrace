import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { ensureWorkspaceInitialized } from "@graphtrace/config";
import { openGraphStore } from "@graphtrace/storage";
import { indexWorkspace } from "../src/index";

const fixtureRoot = join(process.cwd(), "fixtures", "express-prisma-workspace");
const nextFixtureRoot = join(process.cwd(), "fixtures", "next-api-workspace");
const nestFixtureRoot = join(
  process.cwd(),
  "fixtures",
  "nest-drizzle-workspace",
);
const fastifyFixtureRoot = join(process.cwd(), "fixtures", "fastify-workspace");
const rootSrcFixtureRoot = join(
  process.cwd(),
  "fixtures",
  "root-src-workspace",
);
const backendFrontendFixtureRoot = join(
  process.cwd(),
  "fixtures",
  "backend-frontend-workspace",
);
const mixedFixtureRoot = join(process.cwd(), "fixtures", "mixed-workspace");
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

describe("indexWorkspace", () => {
  test("indexes packages, symbols, routes, and query edges from the fixture workspace", async () => {
    await ensureWorkspaceInitialized(fixtureRoot);

    const result = await indexWorkspace({
      workspaceRoot: fixtureRoot,
      full: true,
    });

    expect(result.summary.packageCount).toBeGreaterThanOrEqual(2);
    expect(result.summary.fileCount).toBeGreaterThanOrEqual(4);
    expect(result.summary.symbolCount).toBeGreaterThanOrEqual(4);
    expect(result.summary.routeCount).toBe(1);
    expect(result.summary.queryEdgeCount).toBeGreaterThanOrEqual(1);
  });

  test("indexes next app router handlers", async () => {
    await ensureWorkspaceInitialized(nextFixtureRoot);

    const result = await indexWorkspace({
      workspaceRoot: nextFixtureRoot,
      full: true,
    });

    expect(result.summary.routeCount).toBe(1);
    expect(result.summary.queryEdgeCount).toBe(0);
  });

  test("indexes nest controllers and drizzle hints", async () => {
    await ensureWorkspaceInitialized(nestFixtureRoot);

    const result = await indexWorkspace({
      workspaceRoot: nestFixtureRoot,
      full: true,
    });

    expect(result.summary.routeCount).toBe(1);
    expect(result.summary.queryEdgeCount).toBeGreaterThanOrEqual(1);
  });

  test("maps nest routes to controller method symbols", async () => {
    await ensureWorkspaceInitialized(nestFixtureRoot);

    await indexWorkspace({
      workspaceRoot: nestFixtureRoot,
      full: true,
    });

    const store = openGraphStore(join(nestFixtureRoot, ".graphtrace", "index.db"));

    try {
      expect(store.routeById("GET /users")).toMatchObject({
        handlerSymbolId: "symbol:apps/api/src/users.controller.ts#UsersController.listUsers",
      });
    } finally {
      store.close();
    }
  });

  test("indexes fastify routes", async () => {
    await ensureWorkspaceInitialized(fastifyFixtureRoot);

    const result = await indexWorkspace({
      workspaceRoot: fastifyFixtureRoot,
      full: true,
    });

    expect(result.summary.routeCount).toBe(1);
  });

  test("indexes root src workspaces without apps or packages folders", async () => {
    await ensureWorkspaceInitialized(rootSrcFixtureRoot);

    const result = await indexWorkspace({
      workspaceRoot: rootSrcFixtureRoot,
      full: true,
    });

    expect(result.summary.fileCount).toBeGreaterThanOrEqual(1);
    expect(result.summary.routeCount).toBe(1);
    expect(result.units).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rootPath: ".",
          language: "js-ts",
          indexingMode: "full",
        }),
      ]),
    );
  });

  test("discovers sibling backend and frontend units dynamically", async () => {
    await ensureWorkspaceInitialized(backendFrontendFixtureRoot);

    const result = await indexWorkspace({
      workspaceRoot: backendFrontendFixtureRoot,
      full: true,
    });

    expect(result.summary.fileCount).toBeGreaterThanOrEqual(2);
    expect(result.summary.routeCount).toBe(1);
    expect(result.units).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rootPath: "backend",
          language: "js-ts",
          indexingMode: "full",
        }),
        expect.objectContaining({
          rootPath: "frontend",
          language: "js-ts",
          indexingMode: "full",
        }),
      ]),
    );
  });

  test("keeps non-js units as shallow metadata while indexing js-ts units deeply", async () => {
    await ensureWorkspaceInitialized(mixedFixtureRoot);

    const result = await indexWorkspace({
      workspaceRoot: mixedFixtureRoot,
      full: true,
    });

    expect(result.summary.fileCount).toBeGreaterThanOrEqual(1);
    expect(result.units).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rootPath: "services/api",
          language: "js-ts",
          indexingMode: "full",
        }),
        expect.objectContaining({
          rootPath: "workers/python",
          language: "unknown",
          indexingMode: "shallow",
        }),
      ]),
    );
  });

  test("extracts stable callable symbols for ts and js fixtures", async () => {
    await ensureWorkspaceInitialized(symbolGraphFixtureRoot);

    const result = await indexWorkspace({
      workspaceRoot: symbolGraphFixtureRoot,
      full: true,
    });

    expect(result.summary.symbolCount).toBeGreaterThanOrEqual(8);

    const store = openGraphStore(
      join(symbolGraphFixtureRoot, ".graphtrace", "index.db"),
    );

    try {
      expect(
        store.symbolById(
          "symbol:apps/api/src/services/user-service.ts#listUsers",
        ),
      ).toMatchObject({
        kind: "function",
        language: "typescript",
        span: expect.objectContaining({
          startLine: 9,
        }),
      });
      expect(
        store.symbolById(
          "symbol:apps/api/src/services/user-service.ts#UsersController.archiveUser",
        ),
      ).toMatchObject({
        kind: "method",
        ownerSymbolId: "symbol:apps/api/src/services/user-service.ts#UsersController",
        ownerKind: "class",
      });
      expect(
        store.symbolById(
          "symbol:apps/api/src/services/user-service.ts#metrics.trackRoute",
        ),
      ).toMatchObject({
        kind: "method",
        ownerSymbolId: "symbol:apps/api/src/services/user-service.ts#metrics",
        ownerKind: "object",
      });
      expect(
        store.symbolById(
          "symbol:apps/api/src/services/user-service.ts#createReporter",
        ),
      ).toMatchObject({
        kind: "function",
      });
      expect(
        store.symbolById("symbol:apps/api/src/utils/legacy.js#legacyWorker"),
      ).toMatchObject({
        kind: "function",
        language: "javascript",
      });
      expect(
        store.symbolById(
          "symbol:apps/api/src/routes/users.ts#router.post.reports",
        ),
      ).toMatchObject({
        frameworkRole: "route-handler",
        kind: "function",
      });
    } finally {
      store.close();
    }
  });

  test("stores direct call and reference edges between symbols", async () => {
    await ensureWorkspaceInitialized(symbolGraphFixtureRoot);

    await indexWorkspace({
      workspaceRoot: symbolGraphFixtureRoot,
      full: true,
    });

    const store = openGraphStore(
      join(symbolGraphFixtureRoot, ".graphtrace", "index.db"),
    );

    try {
      expect(
        store.symbolNeighbors(
          "symbol:apps/api/src/routes/users.ts#router.post.reports",
        ),
      ).toMatchObject({
        edges: expect.arrayContaining([
          expect.objectContaining({
            type: "calls",
            sourceId: "symbol:apps/api/src/routes/users.ts#router.post.reports",
            targetId: "symbol:apps/api/src/services/user-service.ts#createReporter",
            confidenceLabel: "proven",
          }),
          expect.objectContaining({
            type: "references",
            sourceId: "symbol:apps/api/src/routes/users.ts#router.post.reports",
            targetId: "symbol:apps/api/src/services/user-service.ts#metrics.trackRoute",
            confidenceLabel: "proven",
          }),
        ]),
      });
    } finally {
      store.close();
    }
  });

  test("stitches route, wrapper, service, and query sink execution flow", async () => {
    await ensureWorkspaceInitialized(symbolGraphFixtureRoot);

    await indexWorkspace({
      workspaceRoot: symbolGraphFixtureRoot,
      full: true,
    });

    const store = openGraphStore(
      join(symbolGraphFixtureRoot, ".graphtrace", "index.db"),
    );

    try {
      expect(
        store.symbolNeighbors("symbol:apps/api/src/routes/users.ts#auditedListUsers"),
      ).toMatchObject({
        edges: expect.arrayContaining([
          expect.objectContaining({
            type: "routes_to",
            sourceId: "GET /users",
            targetId: "symbol:apps/api/src/routes/users.ts#auditedListUsers",
          }),
          expect.objectContaining({
            type: "calls",
            sourceId: "symbol:apps/api/src/routes/users.ts#auditedListUsers",
            targetId: "symbol:apps/api/src/services/user-service.ts#listUsers",
          }),
        ]),
      });
      expect(
        store.symbolNeighbors(
          "symbol:apps/api/src/services/user-service.ts#listUsers",
        ),
      ).toMatchObject({
        edges: expect.arrayContaining([
          expect.objectContaining({
            type: "queries",
            sourceId: "symbol:apps/api/src/services/user-service.ts#listUsers",
            targetId: "query:apps/api/src/services/user-service.ts#prisma.user.findMany(",
          }),
        ]),
      });
    } finally {
      store.close();
    }
  });

  test("covers React callbacks, nested object ownership, and wrapped inline route handlers", async () => {
    await ensureWorkspaceInitialized(reactCallbackFixtureRoot);

    await indexWorkspace({
      workspaceRoot: reactCallbackFixtureRoot,
      full: true,
    });

    const store = openGraphStore(
      join(reactCallbackFixtureRoot, ".graphtrace", "index.db"),
    );

    try {
      expect(
        store.symbolById("symbol:apps/web/src/dashboard.tsx#Dashboard.loadProfile"),
      ).toMatchObject({
        kind: "function",
        ownerSymbolId: "symbol:apps/web/src/dashboard.tsx#Dashboard",
        ownerKind: "function",
      });
      expect(
        store.symbolById(
          "symbol:apps/web/src/dashboard.tsx#services.profile.loadProfile",
        ),
      ).toMatchObject({
        kind: "method",
        ownerSymbolId: "symbol:apps/web/src/dashboard.tsx#services.profile",
        ownerKind: "object",
      });
      expect(
        store.routeById("GET /reports"),
      ).toMatchObject({
        handlerSymbolId: "symbol:apps/api/src/routes/reports.ts#router.get.reports",
      });
      expect(
        store.symbolNeighbors("symbol:apps/web/src/dashboard.tsx#Dashboard.loadProfile"),
      ).toMatchObject({
        edges: expect.arrayContaining([
          expect.objectContaining({
            type: "calls",
            sourceId: "symbol:apps/web/src/dashboard.tsx#Dashboard.loadProfile",
            targetId:
              "symbol:apps/web/src/dashboard.tsx#services.profile.loadProfile",
            confidenceLabel: "proven",
          }),
        ]),
      });
      expect(
        store.symbolNeighbors("symbol:apps/api/src/routes/reports.ts#router.get.reports"),
      ).toMatchObject({
        edges: expect.arrayContaining([
          expect.objectContaining({
            type: "routes_to",
            sourceId: "GET /reports",
            targetId: "symbol:apps/api/src/routes/reports.ts#router.get.reports",
          }),
          expect.objectContaining({
            type: "calls",
            sourceId: "symbol:apps/api/src/routes/reports.ts#router.get.reports",
            targetId:
              "symbol:apps/api/src/services/report-service.ts#reportService.listReports",
            confidenceLabel: "proven",
          }),
        ]),
      });
    } finally {
      store.close();
    }
  });
});
