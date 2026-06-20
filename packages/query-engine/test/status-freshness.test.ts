import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { ensureWorkspaceInitialized } from "@graphtrace/config";
import { indexWorkspace } from "@graphtrace/indexer";
import { openGraphStore } from "@graphtrace/storage";
import { createQueryEngine } from "../src/index";

async function createTempTypescriptWorkspace() {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-freshness-"));
  await mkdir(join(workspaceRoot, "src"), { recursive: true });
  await writeFile(
    join(workspaceRoot, "package.json"),
    JSON.stringify({ name: "freshness-fixture", type: "module" }),
  );
  await writeFile(
    join(workspaceRoot, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { target: "ES2022" } }),
  );
  await writeFile(
    join(workspaceRoot, "src", "index.ts"),
    "export function listUsers() { return []; }\n",
  );

  return workspaceRoot;
}

describe("status freshness", () => {
  test("reports fresh after indexing and stale after source changes", async () => {
    const workspaceRoot = await createTempTypescriptWorkspace();
    await ensureWorkspaceInitialized(workspaceRoot);
    const indexed = await indexWorkspace({ workspaceRoot, full: true });
    const store = openGraphStore(indexed.dbPath);

    try {
      const freshStatus = createQueryEngine(store).status(
        workspaceRoot,
        indexed.dbPath,
      );

      expect(freshStatus.freshness).toMatchObject({
        state: "fresh",
      });

      await new Promise((resolve) => setTimeout(resolve, 20));
      await writeFile(
        join(workspaceRoot, "src", "new-route.ts"),
        "export function createUser() { return true; }\n",
      );

      const staleStatus = createQueryEngine(store).status(
        workspaceRoot,
        indexed.dbPath,
      );

      expect(staleStatus.freshness).toMatchObject({
        state: "stale",
      });
      expect(staleStatus.freshness.reason).toContain("new-route.ts");
    } finally {
      store.close();
    }
  });
});
