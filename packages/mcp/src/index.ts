import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  type createQueryEngine,
  runWorkspaceIndex,
  withWorkspaceQueryEngine,
} from "@graphtrace/query-engine";
import { createGraphTraceDaemon } from "@graphtrace/server";
import { GRAPHTRACE_DB_PATH, type SymbolLocator } from "@graphtrace/shared";
import type { WorkspaceRecord } from "@graphtrace/storage";

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

interface GraphTraceMcpServerOptions {
  homeDir?: string;
  workspaceRoot?: string;
}

interface WorkspaceResolutionHint {
  workspaceId?: string;
  target?: string;
  filePath?: string;
  symbolId?: string;
}

interface ResolvedWorkspaceContext {
  workspaceId?: string;
  workspaceRoot: string;
  withQueryEngine<T>(
    action: (engine: ReturnType<typeof createQueryEngine>) => T,
  ): T;
  status(): unknown;
  runIndex(mode: "full" | "incremental"): Promise<unknown>;
}

export async function createGraphTraceMcpServer(
  options: GraphTraceMcpServerOptions = {},
) {
  const homeDir = options.homeDir ?? homedir();
  const daemon = createGraphTraceDaemon({ homeDir });
  const server = new McpServer({
    name: "graphtrace",
    version: "1.0.0",
  });

  const withResolvedWorkspace = <T>(
    hint: WorkspaceResolutionHint,
    action: (context: ResolvedWorkspaceContext) => T,
  ) => action(resolveWorkspaceContext(hint));

  server.registerTool(
    "list_workspaces",
    {
      description: "List GraphTrace workspaces available from the shared home.",
      inputSchema: {},
    },
    async () =>
      asToolResult({
        items: daemon.listWorkspaceSummaries(),
      }),
  );

  server.registerTool(
    "add_workspace",
    {
      description: "Register and index a new workspace in the shared home.",
      inputSchema: {
        rootPath: z.string(),
        label: z.string().optional(),
      },
    },
    async ({ rootPath, label }) => {
      const workspace = await daemon.addWorkspace(resolve(rootPath), { label });
      return asToolResult({
        workspace,
        status: daemon.status(workspace.id),
      });
    },
  );

  server.registerTool(
    "reindex_workspace",
    {
      description: "Reindex an existing shared GraphTrace workspace.",
      inputSchema: {
        workspaceId: z.string(),
      },
    },
    async ({ workspaceId }) => {
      const workspace = await daemon.reindexWorkspace(workspaceId);
      return asToolResult({
        workspace,
        status: daemon.status(workspace.id),
      });
    },
  );

  server.registerTool(
    "remove_workspace",
    {
      description: "Remove a workspace from the shared GraphTrace home.",
      inputSchema: {
        workspaceId: z.string(),
      },
    },
    async ({ workspaceId }) => {
      const workspace = daemon.getWorkspace(workspaceId);
      if (!workspace) {
        throw new Error(`Unknown workspace: ${workspaceId}`);
      }

      daemon.removeWorkspace(workspaceId);
      return asToolResult({
        removed: true,
        workspaceId,
        label: workspace.label,
      });
    },
  );

  server.registerTool(
    "graphtrace_search_symbols",
    {
      description:
        "Search symbol definitions by name and return a zero-hop graph envelope.",
      inputSchema: {
        query: z.string(),
        workspaceId: z.string().optional(),
      },
    },
    async ({ query, workspaceId }) =>
      asToolResult(
        withResolvedWorkspace({ workspaceId }, (context) =>
          context.withQueryEngine((engine) => engine.searchSymbols(query)),
        ),
      ),
  );

  server.registerTool(
    "graphtrace_get_symbol",
    {
      description:
        "Resolve a symbol by id, file plus name, or file plus position.",
      inputSchema: {
        workspaceId: z.string().optional(),
        symbolId: z.string().optional(),
        filePath: z.string().optional(),
        symbolName: z.string().optional(),
        line: z.number().int().positive().optional(),
        column: z.number().int().positive().optional(),
      },
    },
    async ({ workspaceId, ...locator }) =>
      asToolResult(
        withResolvedWorkspace(
          {
            workspaceId,
            filePath: locator.filePath,
            symbolId: locator.symbolId,
          },
          (context) =>
            context.withQueryEngine((engine) =>
              engine.getSymbol(toSymbolLocator(locator)),
            ),
        ),
      ),
  );

  server.registerTool(
    "graphtrace_get_execution_context",
    {
      description:
        "Get upstream callers, downstream callees, and sinks for a symbol.",
      inputSchema: {
        workspaceId: z.string().optional(),
        symbolId: z.string().optional(),
        filePath: z.string().optional(),
        symbolName: z.string().optional(),
        line: z.number().int().positive().optional(),
        column: z.number().int().positive().optional(),
        maxNodes: z.number().int().positive().optional(),
        maxEdges: z.number().int().positive().optional(),
      },
    },
    async ({ workspaceId, maxNodes, maxEdges, ...locator }) =>
      asToolResult(
        withResolvedWorkspace(
          {
            workspaceId,
            filePath: locator.filePath,
            symbolId: locator.symbolId,
          },
          (context) =>
            context.withQueryEngine((engine) =>
              engine.executionContextFromSymbol(toSymbolLocator(locator), {
                maxNodes,
                maxEdges,
              }),
            ),
        ),
      ),
  );

  server.registerTool(
    "graphtrace_get_symbol_impact",
    {
      description:
        "Get an impact-oriented symbol graph with truncation metadata.",
      inputSchema: {
        workspaceId: z.string().optional(),
        symbolId: z.string().optional(),
        filePath: z.string().optional(),
        symbolName: z.string().optional(),
        line: z.number().int().positive().optional(),
        column: z.number().int().positive().optional(),
        maxNodes: z.number().int().positive().optional(),
        maxEdges: z.number().int().positive().optional(),
      },
    },
    async ({ workspaceId, maxNodes, maxEdges, ...locator }) =>
      asToolResult(
        withResolvedWorkspace(
          {
            workspaceId,
            filePath: locator.filePath,
            symbolId: locator.symbolId,
          },
          (context) =>
            context.withQueryEngine((engine) =>
              engine.impactFromSymbol(toSymbolLocator(locator), {
                maxNodes,
                maxEdges,
              }),
            ),
        ),
      ),
  );

  server.registerTool(
    "graphtrace_explain_edge",
    {
      description: "Explain provenance and confidence for a symbol graph edge.",
      inputSchema: {
        workspaceId: z.string().optional(),
        edgeId: z.string(),
      },
    },
    async ({ workspaceId, edgeId }) =>
      asToolResult(
        withResolvedWorkspace({ workspaceId }, (context) =>
          context.withQueryEngine((engine) => engine.explainEdge(edgeId)),
        ),
      ),
  );

  server.registerTool(
    "search_code",
    {
      description: "Search code, symbols, routes, files, and packages.",
      inputSchema: {
        query: z.string(),
        workspaceId: z.string().optional(),
      },
    },
    async ({ query, workspaceId }) =>
      asToolResult(
        withResolvedWorkspace({ workspaceId }, (context) =>
          context.withQueryEngine((engine) => engine.search(query)),
        ),
      ),
  );

  server.registerTool(
    "get_symbol_context",
    {
      description: "Get symbol-oriented context using GraphTrace search.",
      inputSchema: {
        query: z.string(),
        workspaceId: z.string().optional(),
      },
    },
    async ({ query, workspaceId }) =>
      asToolResult(
        withResolvedWorkspace({ workspaceId }, (context) =>
          context.withQueryEngine((engine) => engine.getSymbolContext(query)),
        ),
      ),
  );

  server.registerTool(
    "get_dependencies",
    {
      description: "Get dependencies for a file path.",
      inputSchema: {
        workspaceId: z.string().optional(),
        target: z.string(),
        direction: z.enum(["in", "out", "both"]).default("both"),
        depth: z.number().int().positive().default(1),
      },
    },
    async ({ workspaceId, target, direction, depth }) =>
      asToolResult(
        withResolvedWorkspace({ workspaceId, target }, (context) =>
          context.withQueryEngine((engine) =>
            engine.dependencies(target, direction, depth),
          ),
        ),
      ),
  );

  server.registerTool(
    "get_impact_analysis",
    {
      description: "Get static impact analysis for a file path.",
      inputSchema: {
        workspaceId: z.string().optional(),
        target: z.string(),
        depth: z.number().int().positive().default(6),
      },
    },
    async ({ workspaceId, target, depth }) =>
      asToolResult(
        withResolvedWorkspace({ workspaceId, target }, (context) =>
          context.withQueryEngine((engine) => engine.impact(target, depth)),
        ),
      ),
  );

  server.registerTool(
    "get_data_flow",
    {
      description: "Get route-to-query flow using GraphTrace heuristics.",
      inputSchema: {
        workspaceId: z.string().optional(),
        target: z.string(),
        depth: z.number().int().positive().default(6),
      },
    },
    async ({ workspaceId, target, depth }) =>
      asToolResult(
        withResolvedWorkspace({ workspaceId, target }, (context) =>
          context.withQueryEngine((engine) => engine.flow(target, depth)),
        ),
      ),
  );

  server.registerTool(
    "get_routes",
    {
      description: "List routes discovered in the selected workspace.",
      inputSchema: {
        workspaceId: z.string().optional(),
      },
    },
    async ({ workspaceId }) =>
      asToolResult(
        withResolvedWorkspace({ workspaceId }, (context) =>
          context.withQueryEngine((engine) => engine.routes()),
        ),
      ),
  );

  server.registerTool(
    "get_status",
    {
      description: "Get workspace, database, and last index run status.",
      inputSchema: {
        workspaceId: z.string().optional(),
      },
    },
    async ({ workspaceId }) =>
      asToolResult(
        withResolvedWorkspace({ workspaceId }, (context) => context.status()),
      ),
  );

  server.registerTool(
    "run_index",
    {
      description: "Run GraphTrace indexing for the selected workspace.",
      inputSchema: {
        workspaceId: z.string().optional(),
        mode: z.enum(["full", "incremental"]).default("incremental"),
      },
    },
    async ({ workspaceId, mode }) =>
      asToolResult(
        await withResolvedWorkspace({ workspaceId }, (context) =>
          context.runIndex(mode),
        ),
      ),
  );

  server.registerTool(
    "list_packages",
    {
      description: "List packages discovered in the selected workspace.",
      inputSchema: {
        workspaceId: z.string().optional(),
      },
    },
    async ({ workspaceId }) =>
      asToolResult(
        withResolvedWorkspace({ workspaceId }, (context) =>
          context.withQueryEngine((engine) => engine.listPackages()),
        ),
      ),
  );

  server.registerTool(
    "get_package_overview",
    {
      description: "Get the package overview for the selected workspace.",
      inputSchema: {
        workspaceId: z.string().optional(),
      },
    },
    async ({ workspaceId }) =>
      asToolResult(
        withResolvedWorkspace({ workspaceId }, (context) =>
          context.withQueryEngine((engine) => engine.getPackageOverview()),
        ),
      ),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  return server;

  function createRegisteredContext(
    workspace: WorkspaceRecord,
  ): ResolvedWorkspaceContext {
    return {
      workspaceId: workspace.id,
      workspaceRoot: workspace.canonicalRootPath,
      withQueryEngine: (action) =>
        daemon.withWorkspaceQueryEngine(workspace.id, action),
      status: () => daemon.status(workspace.id),
      runIndex: (mode) =>
        runWorkspaceIndex({
          workspaceRoot: workspace.canonicalRootPath,
          mode,
          dbPath: workspace.dbPath,
          persistWorkspaceArtifacts: false,
        }),
    };
  }

  function resolveWorkspaceContext(
    hint: WorkspaceResolutionHint,
  ): ResolvedWorkspaceContext {
    if (hint.workspaceId) {
      const workspace = daemon.getWorkspace(hint.workspaceId);
      if (!workspace) {
        throw new Error(`Unknown workspace: ${hint.workspaceId}`);
      }
      return createRegisteredContext(workspace);
    }

    const registeredWorkspaces = daemon
      .listWorkspaces()
      .filter((workspace) => workspace.status !== "missing");

    if (registeredWorkspaces.length === 1) {
      return createRegisteredContext(registeredWorkspaces[0]);
    }

    if (registeredWorkspaces.length > 1) {
      const pathHint = deriveWorkspacePathHint(hint);
      if (pathHint) {
        const matchingWorkspaces = registeredWorkspaces.filter((workspace) =>
          workspaceContainsPath(workspace, pathHint),
        );

        if (matchingWorkspaces.length === 1) {
          return createRegisteredContext(matchingWorkspaces[0]);
        }

        if (matchingWorkspaces.length > 1) {
          throw ambiguousWorkspaceError(matchingWorkspaces);
        }
      }

      throw ambiguousWorkspaceError(registeredWorkspaces);
    }

    const legacyWorkspaceRoot = resolveLegacyWorkspaceRoot(
      options.workspaceRoot,
    );
    if (legacyWorkspaceRoot) {
      return createLegacyContext(legacyWorkspaceRoot);
    }

    throw new Error(
      [
        `No GraphTrace workspaces are registered in ${homeDir}.`,
        "Use `add_workspace` or `graphtrace workspace add <path>` first.",
      ].join(" "),
    );
  }
}

function createLegacyContext(workspaceRoot: string): ResolvedWorkspaceContext {
  return {
    workspaceRoot,
    withQueryEngine: (action) =>
      withWorkspaceQueryEngine(workspaceRoot, (engine) => action(engine)),
    status: () =>
      withWorkspaceQueryEngine(workspaceRoot, (engine, dbPath) =>
        engine.status(workspaceRoot, dbPath),
      ),
    runIndex: (mode) =>
      runWorkspaceIndex({
        workspaceRoot,
        mode,
      }),
  };
}

function resolveLegacyWorkspaceRoot(
  workspaceRoot: string | undefined,
): string | null {
  if (!workspaceRoot) {
    return null;
  }

  return existsSync(join(workspaceRoot, GRAPHTRACE_DB_PATH))
    ? workspaceRoot
    : null;
}

function deriveWorkspacePathHint(
  hint: WorkspaceResolutionHint,
): string | undefined {
  if (hint.filePath) {
    return hint.filePath;
  }

  if (hint.target && looksLikeWorkspacePath(hint.target)) {
    return hint.target;
  }

  if (hint.symbolId?.startsWith("symbol:")) {
    const encodedPath = hint.symbolId.slice("symbol:".length).split("#")[0];
    return encodedPath || undefined;
  }

  return undefined;
}

function looksLikeWorkspacePath(target: string): boolean {
  if (/^[A-Z]+ \//.test(target)) {
    return false;
  }

  return (
    target.startsWith(".") ||
    target.includes("/") ||
    /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|json)$/.test(target)
  );
}

function workspaceContainsPath(
  workspace: WorkspaceRecord,
  pathHint: string,
): boolean {
  return existsSync(resolve(workspace.canonicalRootPath, pathHint));
}

function ambiguousWorkspaceError(workspaces: WorkspaceRecord[]): Error {
  const candidates = workspaces
    .map((workspace) => `${workspace.id} (${workspace.label})`)
    .join(", ");

  return new Error(
    `GraphTrace MCP could not resolve a workspace automatically. Pass workspaceId. Candidates: ${candidates}`,
  );
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
