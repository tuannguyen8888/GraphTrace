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
const builtWebRoot = join(process.cwd(), "apps", "web", "dist");

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
});
