import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { ensureWorkspaceInitialized } from "@graphtrace/config";
import { indexWorkspace } from "../src/index";

const fixtureRoot = join(process.cwd(), "fixtures", "express-prisma-workspace");
const nextFixtureRoot = join(process.cwd(), "fixtures", "next-api-workspace");
const nestFixtureRoot = join(
  process.cwd(),
  "fixtures",
  "nest-drizzle-workspace",
);
const fastifyFixtureRoot = join(process.cwd(), "fixtures", "fastify-workspace");

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

  test("indexes fastify routes", async () => {
    await ensureWorkspaceInitialized(fastifyFixtureRoot);

    const result = await indexWorkspace({
      workspaceRoot: fastifyFixtureRoot,
      full: true,
    });

    expect(result.summary.routeCount).toBe(1);
  });
});
