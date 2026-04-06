import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { ensureWorkspaceInitialized } from "@graphtrace/config";
import { indexWorkspace } from "../src/index";

const fixtureRoot = join(process.cwd(), "fixtures", "express-prisma-workspace");

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
});
