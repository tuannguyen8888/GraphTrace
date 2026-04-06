import { join } from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { createQueryEngine } from "@graphtrace/query-engine";
import { GRAPHTRACE_DB_PATH } from "@graphtrace/shared";
import { openGraphStore } from "@graphtrace/storage";

type QueryEngine = ReturnType<typeof createQueryEngine>;

function withQueryEngine<T>(
  workspaceRoot: string,
  action: (engine: QueryEngine) => T,
): T {
  const store = openGraphStore(join(workspaceRoot, GRAPHTRACE_DB_PATH));
  const engine = createQueryEngine(store);

  try {
    return action(engine);
  } finally {
    store.close();
  }
}

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
    version: "0.1.0",
  });

  server.registerTool(
    "search_code",
    {
      description: "Search code, symbols, routes, files, and packages.",
      inputSchema: {
        query: z.string(),
      },
    },
    async ({ query }) =>
      asToolResult(
        withQueryEngine(options.workspaceRoot, (engine) =>
          engine.search(query),
        ),
      ),
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
      asToolResult(
        withQueryEngine(options.workspaceRoot, (engine) =>
          engine.getSymbolContext(query),
        ),
      ),
  );

  server.registerTool(
    "get_dependencies",
    {
      description: "Get dependencies for a file path.",
      inputSchema: {
        target: z.string(),
        direction: z.enum(["in", "out", "both"]).default("both"),
      },
    },
    async ({ target, direction }) =>
      asToolResult(
        withQueryEngine(options.workspaceRoot, (engine) =>
          engine.dependencies(target, direction),
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
      asToolResult(
        withQueryEngine(options.workspaceRoot, (engine) =>
          engine.impact(target, depth),
        ),
      ),
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
      asToolResult(
        withQueryEngine(options.workspaceRoot, (engine) =>
          engine.flow(target, depth),
        ),
      ),
  );

  server.registerTool(
    "get_routes",
    {
      description: "List routes discovered in the indexed workspace.",
      inputSchema: {},
    },
    async () =>
      asToolResult(
        withQueryEngine(options.workspaceRoot, (engine) => engine.routes()),
      ),
  );

  server.registerTool(
    "list_packages",
    {
      description: "List packages discovered in the workspace.",
      inputSchema: {},
    },
    async () =>
      asToolResult(
        withQueryEngine(options.workspaceRoot, (engine) =>
          engine.listPackages(),
        ),
      ),
  );

  server.registerTool(
    "get_package_overview",
    {
      description: "Get the package overview for the current workspace.",
      inputSchema: {},
    },
    async () =>
      asToolResult(
        withQueryEngine(options.workspaceRoot, (engine) =>
          engine.getPackageOverview(),
        ),
      ),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  return server;
}
