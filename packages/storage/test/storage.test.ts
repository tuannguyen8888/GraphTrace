import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  GRAPH_CONFIDENCE_LABELS,
  GRAPH_EDGE_TYPES,
  GRAPH_NODE_KINDS,
} from "@graphtrace/shared";
import type {
  GraphEdgeDescriptor,
  SymbolDescriptor,
} from "@graphtrace/shared";
import { openGraphStore } from "../src/index";

describe("storage", () => {
  test("shared symbol graph descriptors carry owner, span, and evidence metadata", () => {
    const symbol: SymbolDescriptor = {
      id: "symbol:apps/api/src/routes/users.ts#listUsers",
      name: "listUsers",
      displayName: "listUsers",
      kind: "function",
      language: "typescript",
      fileId: "file:apps/api/src/routes/users.ts",
      filePath: "apps/api/src/routes/users.ts",
      exported: true,
      ownerSymbolId: "symbol:apps/api/src/routes/users.ts#usersController",
      ownerKind: "class",
      signatureText: "(request, response) => Promise<void>",
      frameworkRole: "route-handler",
      span: {
        startLine: 4,
        startColumn: 1,
        endLine: 12,
        endColumn: 2,
      },
    };

    const edge: GraphEdgeDescriptor = {
      id: "edge:symbol:listUsers->query",
      type: "queries",
      sourceId: symbol.id,
      sourceKind: "symbol",
      targetId: "query:apps/api/src/routes/users.ts#0",
      targetKind: "query",
      confidence: 1,
      confidenceLabel: "proven",
      provenance: {
        kind: "static-call",
        source: "typescript-checker",
        evidence: ["CallExpression", "ResolvedSignature"],
      },
    };

    expect(symbol).toMatchObject({
      ownerSymbolId: "symbol:apps/api/src/routes/users.ts#usersController",
      frameworkRole: "route-handler",
      span: {
        startLine: 4,
        endColumn: 2,
      },
    });
    expect(edge).toMatchObject({
      confidenceLabel: "proven",
      provenance: expect.objectContaining({
        source: "typescript-checker",
      }),
    });
    expect(GRAPH_NODE_KINDS).toEqual(
      expect.arrayContaining(["symbol", "query", "route"]),
    );
    expect(GRAPH_EDGE_TYPES).toEqual(
      expect.arrayContaining(["calls", "references", "routes_to", "queries"]),
    );
    expect(GRAPH_CONFIDENCE_LABELS).toEqual(
      expect.arrayContaining(["proven", "inferred-strong", "inferred-weak"]),
    );
  });

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
