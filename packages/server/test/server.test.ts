import {
  access,
  cp,
  mkdir,
  mkdtemp,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { ensureWorkspaceInitialized } from "@graphtrace/config";
import { indexWorkspace } from "@graphtrace/indexer";
import { createGraphTraceApp } from "../src/index";

const fixtureRoot = join(process.cwd(), "fixtures", "express-prisma-workspace");
const symbolGraphFixtureRoot = join(
  process.cwd(),
  "fixtures",
  "symbol-graph-workspace",
);
const crudboosterLegacyFixtureRoot = join(
  process.cwd(),
  "fixtures",
  "crudbooster-legacy-workspace",
);
const builtWebRoot = join(process.cwd(), "apps", "web", "dist");
const selfHostRoot = process.cwd();

describe("server", () => {
  test("exposes APIs and serves the built web UI for an indexed workspace", async () => {
    await ensureWorkspaceInitialized(fixtureRoot);
    await indexWorkspace({ workspaceRoot: fixtureRoot, full: true });

    const backupRoot = await mkdtemp(join(tmpdir(), "graphtrace-web-dist-"));
    const backupDistRoot = join(backupRoot, "dist");
    let hadExistingDist = false;

    try {
      await access(builtWebRoot);
      hadExistingDist = true;
      await rename(builtWebRoot, backupDistRoot);
    } catch {
      hadExistingDist = false;
    }

    await mkdir(join(builtWebRoot, "assets"), { recursive: true });
    await writeFile(
      join(builtWebRoot, "index.html"),
      [
        "<!doctype html>",
        '<html lang="en">',
        "  <head>",
        '    <meta charset="UTF-8" />',
        '    <script type="module" src="/assets/test-entry.js"></script>',
        "  </head>",
        "  <body>",
        '    <div id="root"></div>',
        "  </body>",
        "</html>",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(builtWebRoot, "assets", "test-entry.js"),
      'console.log("GraphTrace test asset");\n',
      "utf8",
    );

    const app = createGraphTraceApp({
      workspaceRoot: fixtureRoot,
    });

    try {
      const root = await app.inject({
        method: "GET",
        url: "/",
      });
      const rootHtml = root.body;
      const assetMatch = rootHtml.match(/src="(\/assets\/[^"]+\.js)"/);

      const routes = await app.inject({
        method: "GET",
        url: "/api/routes",
      });
      const status = await app.inject({
        method: "GET",
        url: "/api/status",
      });
      const packages = await app.inject({
        method: "GET",
        url: "/api/packages",
      });
      const deps = await app.inject({
        method: "GET",
        url: `/api/deps?target=${encodeURIComponent("apps/api/src/routes/users.ts")}`,
      });
      const deepInboundDeps = await app.inject({
        method: "GET",
        url: `/api/deps?target=${encodeURIComponent("apps/api/src/services/user-service.ts")}&direction=in&depth=2`,
      });
      const impact = await app.inject({
        method: "GET",
        url: `/api/impact?target=${encodeURIComponent("apps/api/src/services/user-service.ts")}`,
      });
      const flow = await app.inject({
        method: "GET",
        url: `/api/flow?target=${encodeURIComponent("GET /users")}`,
      });

      const asset = await app.inject({
        method: "GET",
        url: assetMatch?.[1] ?? "/assets/missing.js",
      });

      const routesPayload = routes.json();
      const statusPayload = status.json();
      const packagesPayload = packages.json();
      const depsPayload = deps.json();
      const deepInboundDepsPayload = deepInboundDeps.json();
      const impactPayload = impact.json();
      const flowPayload = flow.json();

      expect(root.statusCode).toBe(200);
      expect(root.headers["content-type"]).toContain("text/html");
      expect(rootHtml).not.toContain("/src/main.tsx");
      expect(assetMatch?.[1]).toBeTruthy();
      expect(asset.statusCode).toBe(200);
      expect(asset.headers["content-type"]).toContain("javascript");
      expect(statusPayload).toEqual(
        expect.objectContaining({
          workspaceRoot: fixtureRoot,
          counts: expect.objectContaining({
            routeCount: 1,
          }),
          lastIndexRun: expect.objectContaining({
            mode: "full",
          }),
        }),
      );

      expect(routesPayload.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "GET",
            path: "/users",
          }),
        ]),
      );
      expect(
        packagesPayload.items.some(
          (item: { label: string }) => item.label === "@fixture/api",
        ),
      ).toBe(true);
      expect(
        depsPayload.items.some((item: { path?: string }) =>
          item.path?.includes("user-service.ts"),
        ),
      ).toBe(true);
      expect(
        deepInboundDepsPayload.items.some((item: { path?: string }) =>
          item.path?.includes("server.ts"),
        ),
      ).toBe(true);
      expect(
        deepInboundDepsPayload.items.some((item: { path?: string }) =>
          item.path?.includes("db/client.ts"),
        ),
      ).toBe(false);
      expect(
        impactPayload.items.some(
          (item: { kind: string; id: string }) =>
            item.kind === "route" && item.id === "GET /users",
        ),
      ).toBe(true);
      expect(
        flowPayload.items.some(
          (item: { kind: string }) => item.kind === "query",
        ),
      ).toBe(true);
    } finally {
      await app.close();
      await rm(builtWebRoot, { recursive: true, force: true });
      if (hadExistingDist) {
        await mkdir(join(builtWebRoot, ".."), { recursive: true });
        await rename(backupDistRoot, builtWebRoot);
      }
      await rm(backupRoot, { recursive: true, force: true });
    }
  });

  test("exposes repository-aware APIs for self-host workspaces", async () => {
    await ensureWorkspaceInitialized(selfHostRoot);
    await indexWorkspace({ workspaceRoot: selfHostRoot, full: true });
    const nextFixtureRepositoryId = "fixtures/next-api-workspace/apps/web";

    const app = createGraphTraceApp({
      workspaceRoot: selfHostRoot,
    });

    try {
      const repositories = await app.inject({
        method: "GET",
        url: "/api/repositories",
      });
      const primaryRoutes = await app.inject({
        method: "GET",
        url: "/api/routes?repository=.",
      });
      const fixtureRoutes = await app.inject({
        method: "GET",
        url: `/api/routes?repository=${encodeURIComponent(nextFixtureRepositoryId)}`,
      });
      const fixtureStatus = await app.inject({
        method: "GET",
        url: `/api/status?repository=${encodeURIComponent(nextFixtureRepositoryId)}`,
      });

      const repositoriesPayload = repositories.json();
      const primaryRoutesPayload = primaryRoutes.json();
      const fixtureRoutesPayload = fixtureRoutes.json();
      const fixtureStatusPayload = fixtureStatus.json();

      expect(repositories.statusCode).toBe(200);
      expect(repositoriesPayload.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: ".",
          }),
          expect.objectContaining({
            id: nextFixtureRepositoryId,
          }),
        ]),
      );
      expect(
        primaryRoutesPayload.items.some(
          (item: { id: string }) => item.id === "GET /users",
        ),
      ).toBe(false);
      expect(
        fixtureRoutesPayload.items.some(
          (item: { id: string }) => item.id === "GET /users",
        ),
      ).toBe(true);
      expect(fixtureStatusPayload.selectedRepositoryId).toBe(
        nextFixtureRepositoryId,
      );
      expect(fixtureStatusPayload.counts.routeCount).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  }, 20_000);

  test("serves symbol search on workspaces with symbol graph indexing enabled", async () => {
    await ensureWorkspaceInitialized(symbolGraphFixtureRoot);
    await indexWorkspace({ workspaceRoot: symbolGraphFixtureRoot, full: true });

    const app = createGraphTraceApp({
      workspaceRoot: symbolGraphFixtureRoot,
    });

    try {
      const search = await app.inject({
        method: "GET",
        url: "/api/symbols/search?q=audit",
      });
      const payload = search.json();

      expect(payload.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "symbol:apps/api/src/services/user-service.ts#withAudit",
          }),
        ]),
      );
    } finally {
      await app.close();
    }
  });

  test("serves php and crudbooster-derived graph APIs without shape changes", async () => {
    await ensureWorkspaceInitialized(crudboosterLegacyFixtureRoot);
    await indexWorkspace({
      workspaceRoot: crudboosterLegacyFixtureRoot,
      full: true,
    });

    const app = createGraphTraceApp({
      workspaceRoot: crudboosterLegacyFixtureRoot,
    });

    try {
      const routes = await app.inject({
        method: "GET",
        url: "/api/routes",
      });
      const flow = await app.inject({
        method: "GET",
        url: `/api/flow?target=${encodeURIComponent("GET /admin/users")}`,
      });
      const symbols = await app.inject({
        method: "GET",
        url: "/api/symbols/search?q=AdminUsersController",
      });

      const routesPayload = routes.json();
      const flowPayload = flow.json();
      const symbolsPayload = symbols.json();

      expect(routesPayload.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "GET",
            path: "/admin/users",
            framework: "laravel",
          }),
        ]),
      );
      expect(flowPayload.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "query",
            id: expect.stringContaining(
              "User::query()->where('active', 1)->get(",
            ),
          }),
        ]),
      );
      expect(symbolsPayload.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "symbol:app/Http/Controllers/AdminUsersController.php#AdminUsersController",
            frameworkRole: "crudbooster-module",
          }),
        ]),
      );
    } finally {
      await app.close();
    }
  });
});
