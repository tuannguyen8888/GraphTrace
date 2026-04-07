import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { openGraphStore } from "../src/index";

describe("storage", () => {
  test("opens a graph store and searches indexed records without sqlite fts extensions", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-storage-"));
    const store = openGraphStore(
      join(workspaceRoot, ".graphtrace", "index.db"),
    );

    try {
      store.upsertUnit({
        id: "unit:apps/api",
        rootPath: "apps/api",
        displayName: "@fixture/api",
        kind: "app",
        language: "js-ts",
        tooling: "pnpm",
        indexingMode: "full",
        confidence: 95,
        signals: ["package.json"],
        sourceRoots: ["apps/api/src"],
        pluginMatches: [],
      });

      store.upsertPackage({
        id: "package:apps/api",
        name: "@fixture/api",
        rootPath: "apps/api",
        unitId: "unit:apps/api",
      });

      store.upsertFile({
        id: "file:apps/api/src/routes/users.ts",
        path: "apps/api/src/routes/users.ts",
        packageId: "package:apps/api",
        unitId: "unit:apps/api",
        hash: "hash",
      });

      store.upsertSymbol({
        id: "symbol:apps/api/src/routes/users.ts#listUsers",
        name: "listUsers",
        kind: "function",
        fileId: "file:apps/api/src/routes/users.ts",
        filePath: "apps/api/src/routes/users.ts",
        exported: true,
      });

      expect(store.search("listUsers").items).toEqual([
        expect.objectContaining({
          id: "symbol:apps/api/src/routes/users.ts#listUsers",
          kind: "symbol",
        }),
      ]);
    } finally {
      store.close();
    }
  });

  test("read-only graph store can query while a writer holds an immediate transaction", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-storage-"));
    const dbPath = join(workspaceRoot, ".graphtrace", "index.db");
    const writer = openGraphStore(dbPath);

    try {
      writer.upsertUnit({
        id: "unit:packages/server",
        rootPath: "packages/server",
        displayName: "@graphtrace/server",
        kind: "package",
        language: "js-ts",
        tooling: "pnpm",
        indexingMode: "full",
        confidence: 100,
        signals: ["package.json"],
        sourceRoots: ["packages/server/src"],
        pluginMatches: [],
      });

      writer.db.exec("BEGIN IMMEDIATE");
      writer.upsertPackage({
        id: "package:packages/server",
        name: "@graphtrace/server",
        rootPath: "packages/server",
        unitId: "unit:packages/server",
      });

      const reader = openGraphStore(dbPath, { readOnly: true, timeout: 500 });

      try {
        expect(reader.stats().packageCount).toBe(0);
      } finally {
        reader.close();
      }
    } finally {
      writer.db.exec("ROLLBACK");
      writer.close();
    }
  });
});
