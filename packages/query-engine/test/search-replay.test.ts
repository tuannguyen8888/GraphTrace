import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { ensureWorkspaceInitialized } from "@graphtrace/config";
import { indexWorkspace } from "@graphtrace/indexer";
import { openGraphStore } from "@graphtrace/storage";
import { createQueryEngine, evaluateSearchReplay } from "../src/index";
import { historicalSearchReplayCases } from "./fixtures/search-replay";

const fixtureRoot = join(process.cwd(), "fixtures", "express-prisma-workspace");

describe("historical search replay benchmark", () => {
  test("reports deterministic hit-rate and per-query misses", async () => {
    await ensureWorkspaceInitialized(fixtureRoot);
    await indexWorkspace({ workspaceRoot: fixtureRoot, full: true });

    const store = openGraphStore(join(fixtureRoot, ".graphtrace", "index.db"));

    try {
      const report = evaluateSearchReplay(
        createQueryEngine(store),
        historicalSearchReplayCases,
      );

      expect(report).toMatchObject({
        total: historicalSearchReplayCases.length,
        hits: expect.any(Number),
        misses: expect.any(Number),
        hitRate: expect.any(Number),
      });
      expect(report.total).toBe(report.hits + report.misses);
      expect(report.hitRate).toBeGreaterThanOrEqual(0);
      expect(report.hitRate).toBeLessThanOrEqual(1);
      expect(report.results).toHaveLength(historicalSearchReplayCases.length);
      expect(report.results[0]).toMatchObject({
        id: "express-user-route-intent",
        query: "users route listUsers user service prisma",
        hit: expect.any(Boolean),
        topItems: expect.any(Array),
      });
      expect(report.missedCaseIds).toEqual(
        report.results
          .filter((result) => !result.hit)
          .map((result) => result.id),
      );
    } finally {
      store.close();
    }
  });
});
