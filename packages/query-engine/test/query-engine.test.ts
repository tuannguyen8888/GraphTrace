import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { ensureWorkspaceInitialized } from "@graphtrace/config";
import { indexWorkspace } from "@graphtrace/indexer";
import { openGraphStore } from "@graphtrace/storage";
import { createQueryEngine } from "../src/index";

const fixtureRoot = join(process.cwd(), "fixtures", "express-prisma-workspace");

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
});
