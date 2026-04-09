import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  type createQueryEngine,
  runWorkspaceIndex,
  withWorkspaceQueryEngine,
} from "@graphtrace/query-engine";
import type { SymbolLocator } from "@graphtrace/shared";

function asToolResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload as Record<string, unknown>,
  };
}

export async function createGraphTraceMcpServer(options: {
  workspaceRoot: string;
}) {
  const server = new McpServer({
    name: "graphtrace",
    version: "1.0.0",
  });
  const withQueryEngine = <T>(
    action: (engine: ReturnType<typeof createQueryEngine>) => T,
  ) =>
    withWorkspaceQueryEngine(options.workspaceRoot, (engine) => action(engine));

  server.registerTool(
    "graphtrace_search_symbols",
    {
      description:
        "Search symbol definitions by name and return a zero-hop graph envelope.",
      inputSchema: {
        query: z.string(),
      },
    },
    async ({ query }) =>
      asToolResult(withQueryEngine((engine) => engine.searchSymbols(query))),
  );

  server.registerTool(
    "graphtrace_get_symbol",
    {
      description:
        "Resolve a symbol by id, file plus name, or file plus position.",
      inputSchema: {
        symbolId: z.string().optional(),
        filePath: z.string().optional(),
        symbolName: z.string().optional(),
        line: z.number().int().positive().optional(),
        column: z.number().int().positive().optional(),
      },
    },
    async (locator) =>
      asToolResult(
        withQueryEngine((engine) => engine.getSymbol(toSymbolLocator(locator))),
      ),
  );

  server.registerTool(
    "graphtrace_get_execution_context",
    {
      description:
        "Get upstream callers, downstream callees, and sinks for a symbol.",
      inputSchema: {
        symbolId: z.string().optional(),
        filePath: z.string().optional(),
        symbolName: z.string().optional(),
        line: z.number().int().positive().optional(),
        column: z.number().int().positive().optional(),
        maxNodes: z.number().int().positive().optional(),
        maxEdges: z.number().int().positive().optional(),
      },
    },
    async ({ maxNodes, maxEdges, ...locator }) =>
      asToolResult(
        withQueryEngine((engine) =>
          engine.executionContextFromSymbol(toSymbolLocator(locator), {
            maxNodes,
            maxEdges,
          }),
        ),
      ),
  );

  server.registerTool(
    "graphtrace_get_symbol_impact",
    {
      description:
        "Get an impact-oriented symbol graph with truncation metadata.",
      inputSchema: {
        symbolId: z.string().optional(),
        filePath: z.string().optional(),
        symbolName: z.string().optional(),
        line: z.number().int().positive().optional(),
        column: z.number().int().positive().optional(),
        maxNodes: z.number().int().positive().optional(),
        maxEdges: z.number().int().positive().optional(),
      },
    },
    async ({ maxNodes, maxEdges, ...locator }) =>
      asToolResult(
        withQueryEngine((engine) =>
          engine.impactFromSymbol(toSymbolLocator(locator), {
            maxNodes,
            maxEdges,
          }),
        ),
      ),
  );

  server.registerTool(
    "graphtrace_explain_edge",
    {
      description: "Explain provenance and confidence for a symbol graph edge.",
      inputSchema: {
        edgeId: z.string(),
      },
    },
    async ({ edgeId }) =>
      asToolResult(withQueryEngine((engine) => engine.explainEdge(edgeId))),
  );

  server.registerTool(
    "search_code",
    {
      description: "Search code, symbols, routes, files, and packages.",
      inputSchema: {
        query: z.string(),
      },
    },
    async ({ query }) =>
      asToolResult(withQueryEngine((engine) => engine.search(query))),
  );

  server.registerTool(
    "get_symbol_context",
    {
      description: "Get symbol-oriented context using GraphTrace search.",
      inputSchema: {
        query: z.string(),
      },
    },
    async ({ query }) =>
      asToolResult(withQueryEngine((engine) => engine.getSymbolContext(query))),
  );

  server.registerTool(
    "get_dependencies",
    {
      description: "Get dependencies for a file path.",
      inputSchema: {
        target: z.string(),
        direction: z.enum(["in", "out", "both"]).default("both"),
        depth: z.number().int().positive().default(1),
      },
    },
    async ({ target, direction, depth }) =>
      asToolResult(
        withQueryEngine((engine) =>
          engine.dependencies(target, direction, depth),
        ),
      ),
  );

  server.registerTool(
    "get_impact_analysis",
    {
      description: "Get static impact analysis for a file path.",
      inputSchema: {
        target: z.string(),
        depth: z.number().int().positive().default(6),
      },
    },
    async ({ target, depth }) =>
      asToolResult(withQueryEngine((engine) => engine.impact(target, depth))),
  );

  server.registerTool(
    "get_data_flow",
    {
      description: "Get route-to-query flow using GraphTrace heuristics.",
      inputSchema: {
        target: z.string(),
        depth: z.number().int().positive().default(6),
      },
    },
    async ({ target, depth }) =>
      asToolResult(withQueryEngine((engine) => engine.flow(target, depth))),
  );

  server.registerTool(
    "get_routes",
    {
      description: "List routes discovered in the indexed workspace.",
      inputSchema: {},
    },
    async () => asToolResult(withQueryEngine((engine) => engine.routes())),
  );

  server.registerTool(
    "get_status",
    {
      description: "Get workspace, database, and last index run status.",
      inputSchema: {},
    },
    async () =>
      asToolResult(
        withWorkspaceQueryEngine(options.workspaceRoot, (engine, dbPath) =>
          engine.status(options.workspaceRoot, dbPath),
        ),
      ),
  );

  server.registerTool(
    "run_index",
    {
      description: "Run GraphTrace indexing for the current workspace.",
      inputSchema: {
        mode: z.enum(["full", "incremental"]).default("incremental"),
      },
    },
    async ({ mode }) =>
      asToolResult(
        await runWorkspaceIndex({
          workspaceRoot: options.workspaceRoot,
          mode,
        }),
      ),
  );

  server.registerTool(
    "list_packages",
    {
      description: "List packages discovered in the workspace.",
      inputSchema: {},
    },
    async () =>
      asToolResult(withQueryEngine((engine) => engine.listPackages())),
  );

  server.registerTool(
    "get_package_overview",
    {
      description: "Get the package overview for the current workspace.",
      inputSchema: {},
    },
    async () =>
      asToolResult(withQueryEngine((engine) => engine.getPackageOverview())),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  return server;
}

function toSymbolLocator(input: {
  symbolId?: string;
  filePath?: string;
  symbolName?: string;
  line?: number;
  column?: number;
}): SymbolLocator {
  if (input.symbolId) {
    return { symbolId: input.symbolId };
  }

  if (input.filePath && input.symbolName) {
    return {
      filePath: input.filePath,
      symbolName: input.symbolName,
    };
  }

  if (
    input.filePath &&
    typeof input.line === "number" &&
    typeof input.column === "number"
  ) {
    return {
      filePath: input.filePath,
      line: input.line,
      column: input.column,
    };
  }

  throw new Error(
    "Expected symbolId, filePath + symbolName, or filePath + line + column.",
  );
}
