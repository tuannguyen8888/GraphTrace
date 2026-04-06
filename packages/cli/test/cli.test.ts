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
});
