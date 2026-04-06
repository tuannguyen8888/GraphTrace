import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { ensureWorkspaceInitialized } from "@graphtrace/config";
import { indexWorkspace } from "@graphtrace/indexer";
import { startGraphTraceServer } from "../src/index";

const fixtureRoot = join(process.cwd(), "fixtures", "express-prisma-workspace");

describe("server", () => {
  test("exposes route, package, dependency, impact, and flow APIs for an indexed workspace", async () => {
    await ensureWorkspaceInitialized(fixtureRoot);
    await indexWorkspace({ workspaceRoot: fixtureRoot, full: true });

    const server = await startGraphTraceServer({
      workspaceRoot: fixtureRoot,
      port: 4311,
    });

    try {
      const routes = await fetch(`${server.address}/api/routes`).then(
        (response) => response.json(),
      );
      const packages = await fetch(`${server.address}/api/packages`).then(
        (response) => response.json(),
      );
      const deps = await fetch(
        `${server.address}/api/deps?target=${encodeURIComponent("apps/api/src/routes/users.ts")}`,
      ).then((response) => response.json());
      const deepInboundDeps = await fetch(
        `${server.address}/api/deps?target=${encodeURIComponent("apps/api/src/services/user-service.ts")}&direction=in&depth=2`,
      ).then((response) => response.json());
      const impact = await fetch(
        `${server.address}/api/impact?target=${encodeURIComponent("apps/api/src/services/user-service.ts")}`,
      ).then((response) => response.json());
      const flow = await fetch(
        `${server.address}/api/flow?target=${encodeURIComponent("GET /users")}`,
      ).then((response) => response.json());

      expect(routes.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "GET",
            path: "/users",
          }),
        ]),
      );
      expect(
        packages.items.some(
          (item: { label: string }) => item.label === "@fixture/api",
        ),
      ).toBe(true);
      expect(
        deps.items.some((item: { path?: string }) =>
          item.path?.includes("user-service.ts"),
        ),
      ).toBe(true);
      expect(
        deepInboundDeps.items.some((item: { path?: string }) =>
          item.path?.includes("server.ts"),
        ),
      ).toBe(true);
      expect(
        deepInboundDeps.items.some((item: { path?: string }) =>
          item.path?.includes("db/client.ts"),
        ),
      ).toBe(false);
      expect(
        impact.items.some(
          (item: { kind: string; id: string }) =>
            item.kind === "route" && item.id === "GET /users",
        ),
      ).toBe(true);
      expect(
        flow.items.some((item: { kind: string }) => item.kind === "query"),
      ).toBe(true);
    } finally {
      await server.close();
    }
  });
});
