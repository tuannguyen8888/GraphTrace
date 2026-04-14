import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";

import {
  defaultGraphTraceConfig,
  ensureWorkspaceInitialized,
} from "@graphtrace/config";
import { openGraphStore } from "@graphtrace/storage";
import { indexWorkspace, inspectWorkspace } from "../src/index";

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
const phpBasicFixtureRoot = join(
  process.cwd(),
  "fixtures",
  "php-basic-workspace",
);
const phpMixedFixtureRoot = join(
  process.cwd(),
  "fixtures",
  "php-mixed-workspace",
);
const laravelFixtureRoot = join(process.cwd(), "fixtures", "laravel-workspace");
const laravelResourceFixtureRoot = join(
  process.cwd(),
  "fixtures",
  "laravel-resource-workspace",
);
const laravelLegacyRoutesFixtureRoot = join(
  process.cwd(),
  "fixtures",
  "laravel-legacy-routes-workspace",
);
const crudboosterLegacyFixtureRoot = join(
  process.cwd(),
  "fixtures",
  "crudbooster-legacy-workspace",
);
const laravelVendorNoiseFixtureRoot = join(
  process.cwd(),
  "fixtures",
  "laravel-vendor-noise-workspace",
);
const crudboosterRouteControllerFixtureRoot = join(
  process.cwd(),
  "fixtures",
  "crudbooster-route-controller-workspace",
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

    const store = openGraphStore(
      join(nestFixtureRoot, ".graphtrace", "index.db"),
    );

    try {
      expect(store.routeById("GET /users")).toMatchObject({
        handlerSymbolId:
          "symbol:apps/api/src/users.controller.ts#UsersController.listUsers",
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
          rootPath: ".",
          language: "js-ts",
          indexingMode: "shallow",
        }),
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

  test("classifies PHP workspaces as php units and indexes them deeply", async () => {
    await ensureWorkspaceInitialized(phpBasicFixtureRoot);

    const result = await indexWorkspace({
      workspaceRoot: phpBasicFixtureRoot,
      full: true,
    });

    expect(result.units).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rootPath: ".",
          language: "php",
          indexingMode: "full",
        }),
      ]),
    );
    expect(result.summary.fileCount).toBeGreaterThanOrEqual(4);
    expect(result.summary.symbolCount).toBeGreaterThanOrEqual(6);

    const store = openGraphStore(
      join(phpBasicFixtureRoot, ".graphtrace", "index.db"),
    );

    try {
      expect(
        store.symbolById(
          "symbol:app/Http/Controllers/HealthController.php#HealthController",
        ),
      ).toMatchObject({
        kind: "class",
        language: "php",
      });
      expect(
        store.symbolById(
          "symbol:app/Http/Controllers/HealthController.php#HealthController.show",
        ),
      ).toMatchObject({
        kind: "method",
        ownerSymbolId:
          "symbol:app/Http/Controllers/HealthController.php#HealthController",
        ownerKind: "class",
        language: "php",
      });
      expect(
        store.symbolById("symbol:app/Contracts/ChecksHealth.php#ChecksHealth"),
      ).toMatchObject({
        kind: "interface",
        language: "php",
      });
      expect(
        store.symbolById("symbol:app/Support/TracksHealth.php#TracksHealth"),
      ).toMatchObject({
        kind: "trait",
        language: "php",
      });
      expect(
        store.symbolById("symbol:app/helpers.php#health_helper_message"),
      ).toMatchObject({
        kind: "function",
        language: "php",
      });
    } finally {
      store.close();
    }
  });

  test("extracts php references and query hints while keeping mixed-language units stable", async () => {
    await ensureWorkspaceInitialized(phpMixedFixtureRoot);

    const result = await indexWorkspace({
      workspaceRoot: phpMixedFixtureRoot,
      full: true,
    });

    expect(result.units).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rootPath: "backend/api",
          language: "php",
          indexingMode: "full",
        }),
        expect.objectContaining({
          rootPath: "frontend",
          language: "js-ts",
          indexingMode: "full",
        }),
      ]),
    );
    expect(result.summary.queryEdgeCount).toBeGreaterThanOrEqual(1);

    const store = openGraphStore(
      join(phpMixedFixtureRoot, ".graphtrace", "index.db"),
    );

    try {
      expect(
        store.fileDependencies(
          "backend/api/app/Services/UserService.php",
          "out",
          1,
        ).items,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "backend/api/app/Models/User.php",
          }),
          expect.objectContaining({
            path: "backend/api/app/Support/HealthReporter.php",
          }),
        ]),
      );

      expect(
        store.symbolNeighbors(
          "symbol:backend/api/app/Services/UserService.php#UserService.listActive",
        ),
      ).toMatchObject({
        edges: expect.arrayContaining([
          expect.objectContaining({
            type: "calls",
            sourceId:
              "symbol:backend/api/app/Services/UserService.php#UserService.listActive",
            targetId:
              "symbol:backend/api/app/Support/HealthReporter.php#HealthReporter.record",
          }),
          expect.objectContaining({
            type: "calls",
            sourceId:
              "symbol:backend/api/app/Services/UserService.php#UserService.listActive",
            targetId: "symbol:backend/api/app/Models/User.php#User.query",
          }),
        ]),
      });

      expect(
        store.symbolNeighbors("symbol:backend/api/app/Models/User.php#User"),
      ).toMatchObject({
        edges: expect.arrayContaining([
          expect.objectContaining({
            type: "references",
            sourceId: "symbol:backend/api/app/Models/User.php#User",
            targetId: "symbol:backend/api/app/Models/BaseModel.php#BaseModel",
          }),
        ]),
      });
    } finally {
      store.close();
    }
  });

  test("detects laravel units with strong project signals", async () => {
    await ensureWorkspaceInitialized(laravelFixtureRoot);
    await ensureWorkspaceInitialized(phpBasicFixtureRoot);
    await ensureWorkspaceInitialized(phpMixedFixtureRoot);

    const laravelResult = await indexWorkspace({
      workspaceRoot: laravelFixtureRoot,
      full: true,
    });
    const plainPhpResult = await indexWorkspace({
      workspaceRoot: phpBasicFixtureRoot,
      full: true,
    });
    const mixedResult = await indexWorkspace({
      workspaceRoot: phpMixedFixtureRoot,
      full: true,
    });

    expect(laravelResult.units).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rootPath: ".",
          language: "php",
          pluginMatches: expect.arrayContaining([
            expect.objectContaining({
              pluginId: "framework:laravel",
              kind: "framework-plugin",
            }),
          ]),
        }),
      ]),
    );
    expect(plainPhpResult.units).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          pluginMatches: expect.arrayContaining([
            expect.objectContaining({
              pluginId: "framework:laravel",
            }),
          ]),
        }),
      ]),
    );
    expect(mixedResult.units).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rootPath: "backend/api",
          language: "php",
          pluginMatches: expect.not.arrayContaining([
            expect.objectContaining({
              pluginId: "framework:laravel",
            }),
          ]),
        }),
        expect.objectContaining({
          rootPath: "frontend",
          language: "js-ts",
          indexingMode: "full",
        }),
      ]),
    );
  });

  test("extracts laravel routes including grouped prefixes and resource helpers", async () => {
    await ensureWorkspaceInitialized(laravelResourceFixtureRoot);

    const result = await indexWorkspace({
      workspaceRoot: laravelResourceFixtureRoot,
      full: true,
    });

    expect(result.summary.routeCount).toBeGreaterThanOrEqual(14);

    const store = openGraphStore(
      join(laravelResourceFixtureRoot, ".graphtrace", "index.db"),
    );

    try {
      expect(store.routeById("GET /admin/users")).toMatchObject({
        framework: "laravel",
        handlerSymbolId:
          "symbol:app/Http/Controllers/UserController.php#UserController.index",
      });
      expect(store.routeById("POST /admin/users")).toMatchObject({
        framework: "laravel",
        handlerSymbolId:
          "symbol:app/Http/Controllers/UserController.php#UserController.store",
      });
      expect(store.routeById("GET /posts")).toMatchObject({
        framework: "laravel",
        handlerSymbolId:
          "symbol:app/Http/Controllers/PostController.php#PostController.index",
      });
      expect(store.routeById("POST /posts")).toMatchObject({
        framework: "laravel",
        handlerSymbolId:
          "symbol:app/Http/Controllers/PostController.php#PostController.store",
      });
      expect(store.routeById("GET /teams/{team}")).toMatchObject({
        framework: "laravel",
        handlerSymbolId:
          "symbol:app/Http/Controllers/TeamController.php#TeamController.show",
      });
    } finally {
      store.close();
    }
  });

  test("extracts legacy laravel string controller syntax and array prefix groups", async () => {
    await ensureWorkspaceInitialized(laravelLegacyRoutesFixtureRoot);

    const result = await indexWorkspace({
      workspaceRoot: laravelLegacyRoutesFixtureRoot,
      full: true,
    });

    expect(result.summary.routeCount).toBe(4);

    const store = openGraphStore(
      join(laravelLegacyRoutesFixtureRoot, ".graphtrace", "index.db"),
    );

    try {
      expect(store.routeById("GET /zalo-login")).toMatchObject({
        framework: "laravel",
        handlerSymbolId:
          "symbol:app/Http/Controllers/ZaloController.php#ZaloController.login",
      });
      expect(store.routeById("GET /info-pawn-order-customers")).toMatchObject({
        framework: "laravel",
        handlerSymbolId:
          "symbol:app/Http/Controllers/Api/GoldPawnOrderController.php#GoldPawnOrderController.cronjobSendNoticeInterestPayment",
      });
      expect(store.routeById("GET /admin/reports")).toMatchObject({
        framework: "laravel",
        handlerSymbolId:
          "symbol:app/Http/Controllers/AdminReportController.php#AdminReportController.index",
      });
      expect(store.routeById("POST /admin/reports/export")).toMatchObject({
        framework: "laravel",
        handlerSymbolId:
          "symbol:app/Http/Controllers/AdminReportController.php#AdminReportController.export",
      });
    } finally {
      store.close();
    }
  });

  test("stitches laravel route handlers into execution context with downstream queries", async () => {
    await ensureWorkspaceInitialized(laravelFixtureRoot);

    await indexWorkspace({
      workspaceRoot: laravelFixtureRoot,
      full: true,
    });

    const store = openGraphStore(
      join(laravelFixtureRoot, ".graphtrace", "index.db"),
    );

    try {
      expect(
        store.symbolNeighbors(
          "symbol:app/Http/Controllers/UserController.php#UserController.index",
        ),
      ).toMatchObject({
        edges: expect.arrayContaining([
          expect.objectContaining({
            type: "routes_to",
            sourceId: "GET /users",
            targetId:
              "symbol:app/Http/Controllers/UserController.php#UserController.index",
          }),
          expect.objectContaining({
            type: "calls",
            sourceId:
              "symbol:app/Http/Controllers/UserController.php#UserController.index",
            targetId:
              "symbol:app/Services/UserService.php#UserService.listUsers",
          }),
        ]),
      });

      expect(
        store.executionContextFromSymbol(
          "symbol:app/Http/Controllers/UserController.php#UserController.index",
        ),
      ).toMatchObject({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: "GET /users",
            kind: "route",
          }),
          expect.objectContaining({
            id: "symbol:app/Services/UserService.php#UserService.listUsers",
            kind: "symbol",
          }),
          expect.objectContaining({
            kind: "query",
            id: expect.stringContaining(
              "User::query()->where('active', true)->get(",
            ),
          }),
        ]),
        edges: expect.arrayContaining([
          expect.objectContaining({
            type: "queries",
            sourceId:
              "symbol:app/Services/UserService.php#UserService.listUsers",
            targetId: expect.stringContaining(
              "User::query()->where('active', true)->get(",
            ),
          }),
        ]),
      });
    } finally {
      store.close();
    }
  });

  test("detects legacy crudbooster units without overmatching plain laravel fixtures", async () => {
    await ensureWorkspaceInitialized(crudboosterLegacyFixtureRoot);
    await ensureWorkspaceInitialized(laravelFixtureRoot);

    const crudboosterResult = await indexWorkspace({
      workspaceRoot: crudboosterLegacyFixtureRoot,
      full: true,
    });
    const laravelResult = await indexWorkspace({
      workspaceRoot: laravelFixtureRoot,
      full: true,
    });

    expect(crudboosterResult.units).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rootPath: ".",
          language: "php",
          pluginMatches: expect.arrayContaining([
            expect.objectContaining({
              pluginId: "framework:laravel",
            }),
            expect.objectContaining({
              pluginId: "framework:crudbooster",
            }),
          ]),
        }),
      ]),
    );
    expect(laravelResult.units).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          pluginMatches: expect.arrayContaining([
            expect.objectContaining({
              pluginId: "framework:crudbooster",
            }),
          ]),
        }),
      ]),
    );
  });

  test("prefers laravel root classification over vendor and frontend noise", async () => {
    await ensureWorkspaceInitialized(laravelVendorNoiseFixtureRoot);

    const inspection = await inspectWorkspace(
      laravelVendorNoiseFixtureRoot,
      defaultGraphTraceConfig,
    );
    const result = await indexWorkspace({
      workspaceRoot: laravelVendorNoiseFixtureRoot,
      full: true,
    });

    const rootUnit = inspection.units.find((unit) => unit.rootPath === ".");
    const rootUnitFiles = inspection.unitFiles.get("unit:root") ?? [];

    expect(rootUnit).toMatchObject({
      rootPath: ".",
      language: "php",
      tooling: "php",
      indexingMode: "full",
      sourceRoots: expect.arrayContaining(["app", "bootstrap", "routes"]),
      pluginMatches: expect.arrayContaining([
        expect.objectContaining({
          pluginId: "framework:laravel",
        }),
        expect.objectContaining({
          pluginId: "framework:crudbooster",
        }),
      ]),
    });
    expect(rootUnit?.sourceRoots).toEqual(
      expect.not.arrayContaining(["public", "vendor"]),
    );
    expect(rootUnitFiles).toEqual(
      expect.not.arrayContaining([
        expect.stringContaining("public/vendor/"),
        expect.stringContaining("vendor/"),
      ]),
    );
    expect(result.summary.routeCount).toBe(1);

    const store = openGraphStore(
      join(laravelVendorNoiseFixtureRoot, ".graphtrace", "index.db"),
    );

    try {
      expect(store.routeById("GET /users")).toMatchObject({
        framework: "laravel",
        handlerSymbolId:
          "symbol:app/Http/Controllers/UserController.php#UserController.index",
      });
      expect(
        store.symbolById(
          "symbol:vendor/crocodicstudio/crudbooster/src/CBController.php#CBController",
        ),
      ).toBeNull();
    } finally {
      store.close();
    }
  });

  test("extracts crudbooster module metadata, model bindings, and admin flows", async () => {
    await ensureWorkspaceInitialized(crudboosterLegacyFixtureRoot);

    await indexWorkspace({
      workspaceRoot: crudboosterLegacyFixtureRoot,
      full: true,
    });

    const store = openGraphStore(
      join(crudboosterLegacyFixtureRoot, ".graphtrace", "index.db"),
    );

    try {
      expect(
        store.symbolById(
          "symbol:app/Http/Controllers/AdminUsersController.php#AdminUsersController",
        ),
      ).toMatchObject({
        frameworkRole: "crudbooster-module",
      });
      expect(
        store.symbolById(
          "symbol:app/Http/Controllers/AdminUsersController.php#AdminUsersController.cbInit",
        ),
      ).toMatchObject({
        frameworkRole: "crudbooster-config",
      });
      expect(
        store.symbolById(
          "symbol:app/Http/Controllers/AdminUsersController.php#AdminUsersController.getIndex",
        ),
      ).toMatchObject({
        frameworkRole: "crudbooster-action",
      });
      expect(store.routeById("GET /admin/users")).toMatchObject({
        handlerSymbolId:
          "symbol:app/Http/Controllers/AdminUsersController.php#AdminUsersController.getIndex",
        framework: "laravel",
      });
      expect(
        store.symbolNeighbors(
          "symbol:app/Http/Controllers/AdminUsersController.php#AdminUsersController",
        ),
      ).toMatchObject({
        edges: expect.arrayContaining([
          expect.objectContaining({
            type: "references",
            sourceId:
              "symbol:app/Http/Controllers/AdminUsersController.php#AdminUsersController",
            targetId: "symbol:app/Models/User.php#User",
            provenance: expect.objectContaining({
              kind: "crudbooster-model-binding",
            }),
          }),
        ]),
      });
      expect(
        store.executionContextFromSymbol(
          "symbol:app/Http/Controllers/AdminUsersController.php#AdminUsersController.getIndex",
        ),
      ).toMatchObject({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: "GET /admin/users",
            kind: "route",
          }),
          expect.objectContaining({
            id: "symbol:app/Models/User.php#User.query",
            kind: "symbol",
          }),
          expect.objectContaining({
            kind: "query",
            id: expect.stringContaining(
              "User::query()->where('active', 1)->get(",
            ),
          }),
        ]),
      });
    } finally {
      store.close();
    }
  });

  test("extracts crudbooster routeController conventions with prefixes and namespace overrides", async () => {
    await ensureWorkspaceInitialized(crudboosterRouteControllerFixtureRoot);

    const result = await indexWorkspace({
      workspaceRoot: crudboosterRouteControllerFixtureRoot,
      full: true,
    });

    expect(result.summary.routeCount).toBe(12);

    const store = openGraphStore(
      join(crudboosterRouteControllerFixtureRoot, ".graphtrace", "index.db"),
    );

    try {
      expect(store.routeById("GET /")).toMatchObject({
        framework: "laravel",
        handlerSymbolId:
          "symbol:app/Http/Controllers/PosController.php#PosController.getIndex",
      });
      expect(
        store.routeById(
          "GET /print-order/{one?}/{two?}/{three?}/{four?}/{five?}",
        ),
      ).toMatchObject({
        framework: "laravel",
        handlerSymbolId:
          "symbol:app/Http/Controllers/PosController.php#PosController.getPrintOrder",
      });
      expect(
        store.routeById(
          "POST /submit-pos/{one?}/{two?}/{three?}/{four?}/{five?}",
        ),
      ).toMatchObject({
        framework: "laravel",
        handlerSymbolId:
          "symbol:app/Http/Controllers/PosController.php#PosController.postSubmitPos",
      });
      expect(store.routeById("GET /admin/users")).toMatchObject({
        framework: "laravel",
        handlerSymbolId:
          "symbol:app/Http/Controllers/AdminUsersController.php#AdminUsersController.getIndex",
      });
      expect(
        store.routeById(
          "GET /admin/users/add/{one?}/{two?}/{three?}/{four?}/{five?}",
        ),
      ).toMatchObject({
        framework: "laravel",
        handlerSymbolId:
          "symbol:app/Http/Controllers/AdminUsersController.php#AdminUsersController.getAdd",
      });
      expect(
        store.routeById(
          "POST /admin/users/add-save/{one?}/{two?}/{three?}/{four?}/{five?}",
        ),
      ).toMatchObject({
        framework: "laravel",
        handlerSymbolId:
          "symbol:app/Http/Controllers/AdminUsersController.php#AdminUsersController.postAddSave",
      });
      expect(store.routeById("GET /tools")).toMatchObject({
        framework: "laravel",
        handlerSymbolId:
          "symbol:app/Http/Controllers/Admin/AuditController.php#AuditController.getIndex",
      });
      expect(
        store.routeById(
          "POST /tools/rebuild-cache/{one?}/{two?}/{three?}/{four?}/{five?}",
        ),
      ).toMatchObject({
        framework: "laravel",
        handlerSymbolId:
          "symbol:app/Http/Controllers/Admin/AuditController.php#AuditController.postRebuildCache",
      });
      expect(
        store.routeById(
          "GET /admin/users/hidden/{one?}/{two?}/{three?}/{four?}/{five?}",
        ),
      ).toBeNull();
    } finally {
      store.close();
    }
  });

  test("does not match app frameworks on the self-host indexer package just because detector strings exist", async () => {
    const inspection = await inspectWorkspace(
      process.cwd(),
      defaultGraphTraceConfig,
    );

    const indexerUnit = inspection.units.find(
      (unit) => unit.rootPath === "packages/indexer",
    );

    expect(indexerUnit?.pluginMatches).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          kind: "framework-plugin",
        }),
      ]),
    );
  });

  test("delegates js-ts indexing through the language analyzer boundary", async () => {
    const analyzeJsTsWorkspace = vi.fn().mockResolvedValue([]);
    vi.resetModules();
    vi.doMock("../src/languages/js-ts/analyzer", () => ({
      analyzeJsTsWorkspace,
    }));

    try {
      const { indexWorkspace: delegatedIndexWorkspace } = await import(
        "../src/index"
      );

      await ensureWorkspaceInitialized(nextFixtureRoot);

      await delegatedIndexWorkspace({
        workspaceRoot: nextFixtureRoot,
        full: true,
      });

      expect(analyzeJsTsWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceRoot: nextFixtureRoot,
          allFiles: ["apps/web/src/app/api/users/route.ts"],
          filesToIndex: ["apps/web/src/app/api/users/route.ts"],
        }),
      );
    } finally {
      vi.doUnmock("../src/languages/js-ts/analyzer");
      vi.resetModules();
    }
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
        ownerSymbolId:
          "symbol:apps/api/src/services/user-service.ts#UsersController",
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
            targetId:
              "symbol:apps/api/src/services/user-service.ts#createReporter",
            confidenceLabel: "proven",
          }),
          expect.objectContaining({
            type: "references",
            sourceId: "symbol:apps/api/src/routes/users.ts#router.post.reports",
            targetId:
              "symbol:apps/api/src/services/user-service.ts#metrics.trackRoute",
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
        store.symbolNeighbors(
          "symbol:apps/api/src/routes/users.ts#auditedListUsers",
        ),
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
            targetId:
              "query:apps/api/src/services/user-service.ts#prisma.user.findMany(",
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
        store.symbolById(
          "symbol:apps/web/src/dashboard.tsx#Dashboard.loadProfile",
        ),
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
      expect(store.routeById("GET /reports")).toMatchObject({
        handlerSymbolId:
          "symbol:apps/api/src/routes/reports.ts#router.get.reports",
      });
      expect(
        store.symbolNeighbors(
          "symbol:apps/web/src/dashboard.tsx#Dashboard.loadProfile",
        ),
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
        store.symbolNeighbors(
          "symbol:apps/api/src/routes/reports.ts#router.get.reports",
        ),
      ).toMatchObject({
        edges: expect.arrayContaining([
          expect.objectContaining({
            type: "routes_to",
            sourceId: "GET /reports",
            targetId:
              "symbol:apps/api/src/routes/reports.ts#router.get.reports",
          }),
          expect.objectContaining({
            type: "calls",
            sourceId:
              "symbol:apps/api/src/routes/reports.ts#router.get.reports",
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
