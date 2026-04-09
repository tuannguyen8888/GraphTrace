import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  GRAPH_CONFIDENCE_LABELS,
  GRAPH_EDGE_TYPES,
  GRAPH_NODE_KINDS,
} from "@graphtrace/shared";
import type { GraphEdgeDescriptor, SymbolDescriptor } from "@graphtrace/shared";
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

  test("persists rich symbol metadata and round-trips symbol edges", async () => {
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
        id: "symbol:apps/api/src/routes/users.ts#usersController",
        name: "UsersController",
        displayName: "UsersController",
        kind: "class",
        language: "typescript",
        fileId: "file:apps/api/src/routes/users.ts",
        filePath: "apps/api/src/routes/users.ts",
        exported: true,
      });
      store.upsertSymbol({
        id: "symbol:apps/api/src/routes/users.ts#listUsers",
        name: "listUsers",
        displayName: "listUsers",
        kind: "method",
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
          startColumn: 3,
          endLine: 12,
          endColumn: 4,
        },
      });

      store.upsertSymbolEdge({
        id: "edge:symbol:listUsers->query",
        type: "queries",
        sourceId: "symbol:apps/api/src/routes/users.ts#listUsers",
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
      });

      expect(
        store.symbolById("symbol:apps/api/src/routes/users.ts#listUsers"),
      ).toMatchObject({
        ownerSymbolId: "symbol:apps/api/src/routes/users.ts#usersController",
        ownerKind: "class",
        signatureText: "(request, response) => Promise<void>",
        frameworkRole: "route-handler",
        span: {
          startLine: 4,
          endColumn: 4,
        },
      });

      expect(
        store.symbolNeighbors("symbol:apps/api/src/routes/users.ts#listUsers"),
      ).toMatchObject({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: "symbol:apps/api/src/routes/users.ts#listUsers",
            symbol: expect.objectContaining({
              ownerSymbolId:
                "symbol:apps/api/src/routes/users.ts#usersController",
            }),
          }),
          expect.objectContaining({
            id: "query:apps/api/src/routes/users.ts#0",
            kind: "query",
          }),
        ]),
        edges: [
          expect.objectContaining({
            id: "edge:symbol:listUsers->query",
            confidenceLabel: "proven",
            provenance: expect.objectContaining({
              source: "typescript-checker",
              evidence: ["CallExpression", "ResolvedSignature"],
            }),
          }),
        ],
        summary: expect.objectContaining({
          nodeCount: 2,
          edgeCount: 1,
          confidence: expect.objectContaining({
            proven: 1,
          }),
        }),
      });
    } finally {
      store.close();
    }
  });

  test("symbol neighbor graphs include direct call and reference edge types", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-storage-"));
    const store = openGraphStore(
      join(workspaceRoot, ".graphtrace", "index.db"),
    );

    try {
      store.upsertSymbol({
        id: "symbol:source",
        name: "source",
        displayName: "source",
        kind: "function",
        language: "typescript",
        fileId: "file:source.ts",
        filePath: "source.ts",
        exported: true,
      });
      store.upsertSymbol({
        id: "symbol:target",
        name: "target",
        displayName: "target",
        kind: "function",
        language: "typescript",
        fileId: "file:target.ts",
        filePath: "target.ts",
        exported: true,
      });

      store.upsertSymbolEdge({
        id: "edge:calls:source->target",
        type: "calls",
        sourceId: "symbol:source",
        sourceKind: "symbol",
        targetId: "symbol:target",
        targetKind: "symbol",
        confidence: 1,
        confidenceLabel: "proven",
        provenance: {
          kind: "direct-call",
          source: "typescript-checker",
          evidence: ["source.ts:4:2"],
        },
      });
      store.upsertSymbolEdge({
        id: "edge:references:source->target",
        type: "references",
        sourceId: "symbol:source",
        sourceKind: "symbol",
        targetId: "symbol:target",
        targetKind: "symbol",
        confidence: 1,
        confidenceLabel: "proven",
        provenance: {
          kind: "identifier-reference",
          source: "typescript-checker",
          evidence: ["source.ts:5:2"],
        },
      });

      expect(store.symbolNeighbors("symbol:source")).toMatchObject({
        edges: expect.arrayContaining([
          expect.objectContaining({
            type: "calls",
            targetId: "symbol:target",
          }),
          expect.objectContaining({
            type: "references",
            targetId: "symbol:target",
          }),
        ]),
      });
    } finally {
      store.close();
    }
  });

  test("builds execution-context and impact graphs with truncation and edge explanations", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-storage-"));
    const store = openGraphStore(
      join(workspaceRoot, ".graphtrace", "index.db"),
    );

    try {
      for (const symbolId of ["symbol:a", "symbol:b", "symbol:c"]) {
        store.upsertSymbol({
          id: symbolId,
          name: symbolId.split(":")[1],
          displayName: symbolId.split(":")[1],
          kind: "function",
          language: "typescript",
          fileId: `file:${symbolId}.ts`,
          filePath: `${symbolId}.ts`,
          exported: true,
        });
      }

      store.upsertSymbolEdge({
        id: "edge:routes_to:GET /users->symbol:a",
        type: "routes_to",
        sourceId: "GET /users",
        sourceKind: "route",
        targetId: "symbol:a",
        targetKind: "symbol",
        confidence: 1,
        confidenceLabel: "proven",
        provenance: {
          kind: "route-handler",
          source: "framework:express",
          evidence: ["GET /users"],
        },
      });
      store.upsertSymbolEdge({
        id: "edge:calls:symbol:a->symbol:b",
        type: "calls",
        sourceId: "symbol:a",
        sourceKind: "symbol",
        targetId: "symbol:b",
        targetKind: "symbol",
        confidence: 1,
        confidenceLabel: "proven",
        provenance: {
          kind: "direct-call",
          source: "typescript-checker",
          evidence: ["a.ts:4:2"],
        },
      });
      store.upsertSymbolEdge({
        id: "edge:calls:symbol:b->symbol:c",
        type: "calls",
        sourceId: "symbol:b",
        sourceKind: "symbol",
        targetId: "symbol:c",
        targetKind: "symbol",
        confidence: 1,
        confidenceLabel: "proven",
        provenance: {
          kind: "direct-call",
          source: "typescript-checker",
          evidence: ["b.ts:8:2"],
        },
      });
      store.upsertSymbolEdge({
        id: "edge:queries:symbol:c->query:c#findMany",
        type: "queries",
        sourceId: "symbol:c",
        sourceKind: "symbol",
        targetId: "query:c#findMany",
        targetKind: "query",
        confidence: 1,
        confidenceLabel: "proven",
        provenance: {
          kind: "query-sink",
          source: "source-pattern",
          evidence: ["prisma.user.findMany("],
        },
      });

      expect(
        store.executionContextFromSymbol("symbol:b", {
          maxNodes: 10,
          maxEdges: 10,
        }),
      ).toMatchObject({
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: "GET /users", kind: "route" }),
          expect.objectContaining({ id: "query:c#findMany", kind: "query" }),
        ]),
        edges: expect.arrayContaining([
          expect.objectContaining({
            id: "edge:calls:symbol:a->symbol:b",
          }),
          expect.objectContaining({
            id: "edge:calls:symbol:b->symbol:c",
          }),
        ]),
      });

      expect(
        store.impactFromSymbol("symbol:a", {
          maxNodes: 2,
          maxEdges: 1,
        }).summary.truncated,
      ).toMatchObject({
        nodeLimitReached: true,
      });
      expect(store.explainEdge("edge:calls:symbol:b->symbol:c")).toMatchObject({
        provenance: expect.objectContaining({
          source: "typescript-checker",
        }),
      });
    } finally {
      store.close();
    }
  });
});
