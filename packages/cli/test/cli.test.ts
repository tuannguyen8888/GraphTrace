import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { ensureWorkspaceInitialized } from "@graphtrace/config";
import { indexWorkspace } from "@graphtrace/indexer";

import { runCli } from "../src/index";

describe("cli", () => {
  const fixtureRoot = join(
    process.cwd(),
    "fixtures",
    "express-prisma-workspace",
  );

  test("init creates the .graphtrace workspace", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-cli-"));

    const result = await runCli(["init"], { cwd: workspaceRoot });

    const configStat = await stat(
      join(workspaceRoot, ".graphtrace", "config.json"),
    );
    expect(result.exitCode).toBe(0);
    expect(configStat.isFile()).toBe(true);
  });

  test("doctor reports local environment details", async () => {
    const result = await runCli(["doctor"], { cwd: process.cwd() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("node:");
    expect(result.stdout).toContain("pnpm:");
  });

  test("index supports --json and status reports workspace/index metadata", async () => {
    await ensureWorkspaceInitialized(fixtureRoot);

    const indexed = await runCli(["index", "--full", "--json"], {
      cwd: fixtureRoot,
    });
    const status = await runCli(["status", "--json"], {
      cwd: fixtureRoot,
    });

    const indexedPayload = JSON.parse(indexed.stdout) as {
      dbPath: string;
      summary: {
        packageCount: number;
      };
    };
    const statusPayload = JSON.parse(status.stdout) as {
      workspaceRoot: string;
      dbPath: string;
      counts: {
        packageCount: number;
        fileCount: number;
        symbolCount: number;
        routeCount: number;
        queryEdgeCount: number;
      };
      lastIndexRun: {
        mode: string;
        completedAt: string | null;
      } | null;
    };

    expect(indexed.exitCode).toBe(0);
    expect(indexedPayload.summary.packageCount).toBeGreaterThanOrEqual(2);

    expect(status.exitCode).toBe(0);
    expect(statusPayload.workspaceRoot).toBe(fixtureRoot);
    expect(statusPayload.dbPath).toBe(indexedPayload.dbPath);
    expect(statusPayload.counts.packageCount).toBeGreaterThanOrEqual(2);
    expect(statusPayload.counts.fileCount).toBeGreaterThan(0);
    expect(statusPayload.lastIndexRun?.mode).toBe("full");
    expect(statusPayload.lastIndexRun?.completedAt).toBeTruthy();
  });

  test("routes filters by package when --package is provided", async () => {
    await ensureWorkspaceInitialized(fixtureRoot);
    await indexWorkspace({ workspaceRoot: fixtureRoot, full: true });

    const matching = await runCli(["routes", "--package", "@fixture/api"], {
      cwd: fixtureRoot,
    });
    const missing = await runCli(["routes", "--package", "@fixture/missing"], {
      cwd: fixtureRoot,
    });

    expect(JSON.parse(matching.stdout).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/users",
        }),
      ]),
    );
    expect(JSON.parse(missing.stdout).items).toEqual([]);
  });

  test("search filters by kind when --kind is provided", async () => {
    await ensureWorkspaceInitialized(fixtureRoot);
    await indexWorkspace({ workspaceRoot: fixtureRoot, full: true });

    const routeOnly = await runCli(["search", "users", "--kind", "route"], {
      cwd: fixtureRoot,
    });
    const packageOnly = await runCli(
      ["search", "fixture", "--kind", "package"],
      {
        cwd: fixtureRoot,
      },
    );

    expect(JSON.parse(routeOnly.stdout).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "route",
          id: "GET /users",
        }),
      ]),
    );
    expect(
      JSON.parse(routeOnly.stdout).items.every(
        (item: { kind: string }) => item.kind === "route",
      ),
    ).toBe(true);
    expect(
      JSON.parse(packageOnly.stdout).items.every(
        (item: { kind: string }) => item.kind === "package",
      ),
    ).toBe(true);
  });

  test("deps honors --direction and --depth", async () => {
    await ensureWorkspaceInitialized(fixtureRoot);
    await indexWorkspace({ workspaceRoot: fixtureRoot, full: true });

    const inbound = await runCli(
      [
        "deps",
        "apps/api/src/services/user-service.ts",
        "--direction",
        "in",
        "--depth",
        "2",
      ],
      { cwd: fixtureRoot },
    );
    const outbound = await runCli(
      [
        "deps",
        "apps/api/src/routes/users.ts",
        "--direction",
        "out",
        "--depth",
        "2",
      ],
      { cwd: fixtureRoot },
    );

    const inboundItems = JSON.parse(inbound.stdout).items as Array<{
      path?: string;
    }>;
    const outboundItems = JSON.parse(outbound.stdout).items as Array<{
      path?: string;
    }>;

    expect(
      inboundItems.some((item) => item.path?.includes("routes/users.ts")),
    ).toBe(true);
    expect(inboundItems.some((item) => item.path?.includes("server.ts"))).toBe(
      true,
    );
    expect(
      inboundItems.some((item) => item.path?.includes("db/client.ts")),
    ).toBe(false);

    expect(
      outboundItems.some((item) => item.path?.includes("user-service.ts")),
    ).toBe(true);
    expect(
      outboundItems.some((item) => item.path?.includes("db/client.ts")),
    ).toBe(true);
    expect(outboundItems.some((item) => item.path?.includes("server.ts"))).toBe(
      false,
    );
  });

  test("impact honors --depth", async () => {
    await ensureWorkspaceInitialized(fixtureRoot);
    await indexWorkspace({ workspaceRoot: fixtureRoot, full: true });

    const shallow = await runCli(
      ["impact", "apps/api/src/services/user-service.ts", "--depth", "1"],
      { cwd: fixtureRoot },
    );
    const deep = await runCli(
      ["impact", "apps/api/src/services/user-service.ts", "--depth", "6"],
      { cwd: fixtureRoot },
    );

    const shallowItems = JSON.parse(shallow.stdout).items as Array<{
      path?: string;
      id: string;
    }>;
    const deepItems = JSON.parse(deep.stdout).items as Array<{
      path?: string;
      id: string;
    }>;

    expect(shallowItems.some((item) => item.id === "GET /users")).toBe(true);
    expect(shallowItems.some((item) => item.path?.includes("server.ts"))).toBe(
      false,
    );
    expect(deepItems.some((item) => item.path?.includes("server.ts"))).toBe(
      true,
    );
  });
});
