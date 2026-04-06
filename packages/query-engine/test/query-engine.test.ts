import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { ensureWorkspaceInitialized } from "@graphtrace/config";
import { indexWorkspace } from "@graphtrace/indexer";
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

describe("query engine", () => {
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
});
