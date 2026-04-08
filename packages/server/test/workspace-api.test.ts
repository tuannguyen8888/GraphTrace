import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { createGraphTraceDaemon } from "../src/daemon";
import { createGraphTraceApp } from "../src/index";

const fixtureRoot = join(process.cwd(), "fixtures", "express-prisma-workspace");
const selfHostRoot = process.cwd();

describe("workspace api", () => {
  test("loads two workspaces through one daemon and keeps query results isolated", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-daemon-"));
    const daemon = createGraphTraceDaemon({ homeDir });

    try {
      const graphtrace = await daemon.addWorkspace(selfHostRoot, {
        label: "GraphTrace",
      });
      const fixture = await daemon.addWorkspace(fixtureRoot, {
        label: "fixture",
      });

      const graphtraceStatus = daemon.status(graphtrace.id);
      const fixtureStatus = daemon.status(fixture.id);
      const graphtracePackages = daemon.withWorkspaceQueryEngine(
        graphtrace.id,
        (engine) => engine.search("@graphtrace/server", "package"),
      );
      const fixturePackages = daemon.withWorkspaceQueryEngine(
        fixture.id,
        (engine) => engine.search("@graphtrace/server", "package"),
      );

      expect(graphtraceStatus.workspaceRoot).toBe(selfHostRoot);
      expect(fixtureStatus.workspaceRoot).toBe(fixtureRoot);
      expect(graphtraceStatus.workspaceRoot).not.toBe(
        fixtureStatus.workspaceRoot,
      );
      expect(
        graphtracePackages.items.some((item) => item.id.includes("server")),
      ).toBe(true);
      expect(fixturePackages.items).toEqual([]);
    } finally {
      daemon.close();
    }
  });

  test("requires workspace-scoped routes for status and search", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-daemon-"));
    const daemon = createGraphTraceDaemon({ homeDir });
    const workspace = await daemon.addWorkspace(fixtureRoot, {
      label: "fixture",
    });
    const app = createGraphTraceApp({ daemon });

    try {
      const workspaces = await app.inject({
        method: "GET",
        url: "/api/workspaces",
      });
      const status = await app.inject({
        method: "GET",
        url: `/api/workspaces/${workspace.id}/status`,
      });
      const search = await app.inject({
        method: "GET",
        url: `/api/workspaces/${workspace.id}/search?q=listUsers`,
      });

      expect(workspaces.statusCode).toBe(200);
      expect(workspaces.json().items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: workspace.id, label: "fixture" }),
        ]),
      );
      expect(status.statusCode).toBe(200);
      expect(status.json().workspaceRoot).toContain("express-prisma-workspace");
      expect(search.statusCode).toBe(200);
      expect(
        search
          .json()
          .items.some((item: { id: string }) => item.id.includes("listUsers")),
      ).toBe(true);
    } finally {
      await app.close();
      daemon.close();
    }
  });

  test("adds a workspace through the API and returns it on the home list", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-daemon-"));
    const daemon = createGraphTraceDaemon({ homeDir });
    const app = createGraphTraceApp({ daemon });

    try {
      const added = await app.inject({
        method: "POST",
        url: "/api/workspaces",
        payload: {
          rootPath: fixtureRoot,
          label: "fixture",
        },
      });
      const workspaces = await app.inject({
        method: "GET",
        url: "/api/workspaces",
      });

      expect(added.statusCode).toBe(201);
      expect(added.json()).toEqual(
        expect.objectContaining({
          label: "fixture",
        }),
      );
      expect(workspaces.statusCode).toBe(200);
      expect(workspaces.json().items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: "fixture",
          }),
        ]),
      );
    } finally {
      await app.close();
      daemon.close();
    }
  });

  test("marks missing workspaces and removes them through the API", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-daemon-"));
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-missing-"));
    const daemon = createGraphTraceDaemon({ homeDir });
    const workspace = await daemon.addWorkspace(workspaceRoot, {
      label: "temp-workspace",
    });
    await rm(workspaceRoot, { recursive: true, force: true });
    const app = createGraphTraceApp({ daemon });

    try {
      const workspaces = await app.inject({
        method: "GET",
        url: "/api/workspaces",
      });
      const removed = await app.inject({
        method: "DELETE",
        url: `/api/workspaces/${workspace.id}`,
      });
      const afterRemoval = await app.inject({
        method: "GET",
        url: "/api/workspaces",
      });

      expect(workspaces.statusCode).toBe(200);
      expect(workspaces.json().items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: workspace.id,
            status: "missing",
          }),
        ]),
      );
      expect(removed.statusCode).toBe(200);
      expect(afterRemoval.json().items).toEqual([]);
    } finally {
      await app.close();
      daemon.close();
    }
  });
});
