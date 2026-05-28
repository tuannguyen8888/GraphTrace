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
import { createMcpTelemetry } from "./telemetry";

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
  workspaceRoot?: string;
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

type SymbolLocatorInput = {
  symbolId?: string;
  filePath?: string;
  symbolName?: string;
  line?: number;
  column?: number;
};

interface SymbolResolutionRequired {
  candidates: unknown[];
  hint: string;
  resolutionRequired: true;
}

export async function createGraphTraceMcpServer(
  options: GraphTraceMcpServerOptions = {},
) {
  const homeDir = options.homeDir ?? homedir();
  const daemon = createGraphTraceDaemon({ homeDir });
  const telemetry = createMcpTelemetry({ homeDir });
  const server = new McpServer({
    name: "graphtrace",
    version: "1.0.0",
  });

  const withResolvedWorkspace = <T>(
    toolName: string,
    hint: WorkspaceResolutionHint,
    action: (context: ResolvedWorkspaceContext) => T,
  ): T => {
    const startedAt = Date.now();
    let context: ResolvedWorkspaceContext | undefined;

    try {
      context = resolveWorkspaceContext(hint);
      const result = action(context);
      if (isPromiseLike(result)) {
        return result
          .then((value) => {
            recordWorkspaceTelemetry(toolName, startedAt, true, context);
            return value;
          })
          .catch((error: unknown) => {
            recordWorkspaceTelemetry(
              toolName,
              startedAt,
              false,
              context,
              error,
            );
            throw error;
          }) as T;
      }

      recordWorkspaceTelemetry(toolName, startedAt, true, context);
      return result;
    } catch (error) {
      recordWorkspaceTelemetry(toolName, startedAt, false, context, error);
      throw error;
    }
  };

  const recordWorkspaceTelemetry = (
    toolName: string,
    startedAt: number,
    ok: boolean,
    context?: ResolvedWorkspaceContext,
    error?: unknown,
  ) => {
    telemetry.record({
      toolName,
      ok,
      durationMs: Date.now() - startedAt,
      workspaceId: context?.workspaceId,
      workspaceRoot: context?.workspaceRoot,
      error: error ? errorToMessage(error) : undefined,
    });
  };

  const withToolTelemetry = <T>(toolName: string, action: () => T): T => {
    const startedAt = Date.now();

    try {
      const result = action();
      if (isPromiseLike(result)) {
        return result
          .then((value) => {
            telemetry.record({
              toolName,
              ok: true,
              durationMs: Date.now() - startedAt,
            });
            return value;
          })
          .catch((error: unknown) => {
            telemetry.record({
              toolName,
              ok: false,
              durationMs: Date.now() - startedAt,
              error: errorToMessage(error),
            });
            throw error;
          }) as T;
      }

      telemetry.record({
        toolName,
        ok: true,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      telemetry.record({
        toolName,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: errorToMessage(error),
      });
      throw error;
    }
  };

  server.registerTool(
    "list_workspaces",
    {
      description: "List GraphTrace workspaces available from the shared home.",
      inputSchema: {},
    },
    async () =>
      withToolTelemetry("list_workspaces", () =>
        asToolResult({
          items: daemon.listWorkspaceSummaries(),
        }),
      ),
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
    async ({ rootPath, label }) =>
      withToolTelemetry("add_workspace", async () => {
        const workspace = await daemon.addWorkspace(resolve(rootPath), {
          label,
        });
        return asToolResult({
          workspace,
          status: daemon.status(workspace.id),
        });
      }),
  );

  server.registerTool(
    "reindex_workspace",
    {
      description: "Reindex an existing shared GraphTrace workspace.",
      inputSchema: {
        workspaceId: z.string(),
      },
    },
    async ({ workspaceId }) =>
      withToolTelemetry("reindex_workspace", async () => {
        const workspace = await daemon.reindexWorkspace(workspaceId);
        return asToolResult({
          workspace,
          status: daemon.status(workspace.id),
        });
      }),
  );

  server.registerTool(
    "remove_workspace",
    {
      description: "Remove a workspace from the shared GraphTrace home.",
      inputSchema: {
        workspaceId: z.string(),
      },
    },
    async ({ workspaceId }) =>
      withToolTelemetry("remove_workspace", () => {
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
      }),
  );

  server.registerTool(
    "graphtrace_search_symbols",
    {
      description:
        "Search symbol definitions by name and return a zero-hop graph envelope.",
      inputSchema: {
        query: z.string(),
        workspaceId: z.string().optional(),
        workspaceRoot: z.string().optional(),
      },
    },
    async ({ query, workspaceId, workspaceRoot }) =>
      asToolResult(
        withResolvedWorkspace(
          "graphtrace_search_symbols",
          { workspaceId, workspaceRoot },
          (context) =>
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
        workspaceRoot: z.string().optional(),
        symbolId: z.string().optional(),
        filePath: z.string().optional(),
        symbolName: z.string().optional(),
        line: z.number().int().positive().optional(),
        column: z.number().int().positive().optional(),
      },
    },
    async ({ workspaceId, workspaceRoot, ...locator }) =>
      asToolResult(
        withResolvedWorkspace(
          "graphtrace_get_symbol",
          {
            workspaceId,
            workspaceRoot,
            filePath: locator.filePath,
            symbolId: locator.symbolId,
          },
          (context) =>
            context.withQueryEngine((engine) => {
              const resolvedLocator = resolveSymbolLocator(engine, locator);
              return isSymbolResolutionRequired(resolvedLocator)
                ? resolvedLocator
                : engine.getSymbol(resolvedLocator);
            }),
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
        workspaceRoot: z.string().optional(),
        symbolId: z.string().optional(),
        filePath: z.string().optional(),
        symbolName: z.string().optional(),
        line: z.number().int().positive().optional(),
        column: z.number().int().positive().optional(),
        maxNodes: z.number().int().positive().optional(),
        maxEdges: z.number().int().positive().optional(),
      },
    },
    async ({ workspaceId, workspaceRoot, maxNodes, maxEdges, ...locator }) =>
      asToolResult(
        withResolvedWorkspace(
          "graphtrace_get_execution_context",
          {
            workspaceId,
            workspaceRoot,
            filePath: locator.filePath,
            symbolId: locator.symbolId,
          },
          (context) =>
            context.withQueryEngine((engine) => {
              const resolvedLocator = resolveSymbolLocator(engine, locator);
              return isSymbolResolutionRequired(resolvedLocator)
                ? resolvedLocator
                : engine.executionContextFromSymbol(resolvedLocator, {
                    maxNodes,
                    maxEdges,
                  });
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
        workspaceId: z.string().optional(),
        workspaceRoot: z.string().optional(),
        symbolId: z.string().optional(),
        filePath: z.string().optional(),
        symbolName: z.string().optional(),
        line: z.number().int().positive().optional(),
        column: z.number().int().positive().optional(),
        maxNodes: z.number().int().positive().optional(),
        maxEdges: z.number().int().positive().optional(),
      },
    },
    async ({ workspaceId, workspaceRoot, maxNodes, maxEdges, ...locator }) =>
      asToolResult(
        withResolvedWorkspace(
          "graphtrace_get_symbol_impact",
          {
            workspaceId,
            workspaceRoot,
            filePath: locator.filePath,
            symbolId: locator.symbolId,
          },
          (context) =>
            context.withQueryEngine((engine) => {
              const resolvedLocator = resolveSymbolLocator(engine, locator);
              return isSymbolResolutionRequired(resolvedLocator)
                ? resolvedLocator
                : engine.impactFromSymbol(resolvedLocator, {
                    maxNodes,
                    maxEdges,
                  });
            }),
        ),
      ),
  );

  server.registerTool(
    "graphtrace_explain_edge",
    {
      description: "Explain provenance and confidence for a symbol graph edge.",
      inputSchema: {
        workspaceId: z.string().optional(),
        workspaceRoot: z.string().optional(),
        edgeId: z.string(),
      },
    },
    async ({ workspaceId, workspaceRoot, edgeId }) =>
      asToolResult(
        withResolvedWorkspace(
          "graphtrace_explain_edge",
          { workspaceId, workspaceRoot },
          (context) =>
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
        workspaceRoot: z.string().optional(),
      },
    },
    async ({ query, workspaceId, workspaceRoot }) =>
      asToolResult(
        withResolvedWorkspace(
          "search_code",
          { workspaceId, workspaceRoot },
          (context) =>
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
        workspaceRoot: z.string().optional(),
      },
    },
    async ({ query, workspaceId, workspaceRoot }) =>
      asToolResult(
        withResolvedWorkspace(
          "get_symbol_context",
          { workspaceId, workspaceRoot },
          (context) =>
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
        workspaceRoot: z.string().optional(),
        target: z.string(),
        direction: z.enum(["in", "out", "both"]).default("both"),
        depth: z.number().int().positive().default(1),
      },
    },
    async ({ workspaceId, workspaceRoot, target, direction, depth }) =>
      asToolResult(
        withResolvedWorkspace(
          "get_dependencies",
          { workspaceId, workspaceRoot, target },
          (context) =>
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
        workspaceRoot: z.string().optional(),
        target: z.string(),
        depth: z.number().int().positive().default(6),
      },
    },
    async ({ workspaceId, workspaceRoot, target, depth }) =>
      asToolResult(
        withResolvedWorkspace(
          "get_impact_analysis",
          { workspaceId, workspaceRoot, target },
          (context) =>
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
        workspaceRoot: z.string().optional(),
        target: z.string(),
        depth: z.number().int().positive().default(6),
      },
    },
    async ({ workspaceId, workspaceRoot, target, depth }) =>
      asToolResult(
        withResolvedWorkspace(
          "get_data_flow",
          { workspaceId, workspaceRoot, target },
          (context) =>
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
        workspaceRoot: z.string().optional(),
      },
    },
    async ({ workspaceId, workspaceRoot }) =>
      asToolResult(
        withResolvedWorkspace(
          "get_routes",
          { workspaceId, workspaceRoot },
          (context) => context.withQueryEngine((engine) => engine.routes()),
        ),
      ),
  );

  server.registerTool(
    "get_status",
    {
      description: "Get workspace, database, and last index run status.",
      inputSchema: {
        workspaceId: z.string().optional(),
        workspaceRoot: z.string().optional(),
      },
    },
    async ({ workspaceId, workspaceRoot }) =>
      asToolResult(
        withResolvedWorkspace(
          "get_status",
          { workspaceId, workspaceRoot },
          (context) => context.status(),
        ),
      ),
  );

  server.registerTool(
    "run_index",
    {
      description: "Run GraphTrace indexing for the selected workspace.",
      inputSchema: {
        workspaceId: z.string().optional(),
        workspaceRoot: z.string().optional(),
        mode: z.enum(["full", "incremental"]).default("incremental"),
      },
    },
    async ({ workspaceId, workspaceRoot, mode }) =>
      asToolResult(
        await withResolvedWorkspace(
          "run_index",
          { workspaceId, workspaceRoot },
          (context) => context.runIndex(mode),
        ),
      ),
  );

  server.registerTool(
    "list_packages",
    {
      description: "List packages discovered in the selected workspace.",
      inputSchema: {
        workspaceId: z.string().optional(),
        workspaceRoot: z.string().optional(),
      },
    },
    async ({ workspaceId, workspaceRoot }) =>
      asToolResult(
        withResolvedWorkspace(
          "list_packages",
          { workspaceId, workspaceRoot },
          (context) =>
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
        workspaceRoot: z.string().optional(),
      },
    },
    async ({ workspaceId, workspaceRoot }) =>
      asToolResult(
        withResolvedWorkspace(
          "get_package_overview",
          { workspaceId, workspaceRoot },
          (context) =>
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

    if (hint.workspaceRoot) {
      const matchingWorkspace = selectWorkspaceByRoot(
        registeredWorkspaces,
        hint.workspaceRoot,
      );
      if (matchingWorkspace) {
        return createRegisteredContext(matchingWorkspace);
      }
    }

    const startupWorkspace = selectWorkspaceByRoot(
      registeredWorkspaces,
      options.workspaceRoot,
    );
    if (startupWorkspace) {
      return createRegisteredContext(startupWorkspace);
    }

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

function selectWorkspaceByRoot(
  workspaces: WorkspaceRecord[],
  workspaceRoot: string | undefined,
): WorkspaceRecord | null {
  if (!workspaceRoot || workspaceRoot === "/") {
    return null;
  }

  const resolvedRoot = resolve(workspaceRoot);
  const matches = workspaces
    .filter((workspace) =>
      pathContains(workspace.canonicalRootPath, resolvedRoot),
    )
    .sort(
      (left, right) =>
        right.canonicalRootPath.length - left.canonicalRootPath.length,
    );

  return matches[0] ?? null;
}

function pathContains(parentPath: string, childPath: string): boolean {
  const resolvedParent = resolve(parentPath);
  const resolvedChild = resolve(childPath);
  return (
    resolvedChild === resolvedParent ||
    resolvedChild.startsWith(`${resolvedParent}/`)
  );
}

function ambiguousWorkspaceError(workspaces: WorkspaceRecord[]): Error {
  const candidates = workspaces
    .map(
      (workspace) =>
        `- ${workspace.id} (${workspace.label}) at ${workspace.canonicalRootPath}`,
    )
    .join("\n");

  return new Error(
    [
      "GraphTrace MCP could not resolve a workspace automatically.",
      "Pass workspaceId or workspaceRoot explicitly.",
      "Registered workspaces:",
      candidates,
      "Hint: call list_workspaces, then retry with the selected workspaceId.",
    ].join("\n"),
  );
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return (
    value !== null &&
    typeof value === "object" &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveSymbolLocator(
  engine: ReturnType<typeof createQueryEngine>,
  input: SymbolLocatorInput,
): SymbolLocator | SymbolResolutionRequired {
  if (
    !input.symbolId &&
    !input.filePath &&
    input.symbolName &&
    typeof input.line !== "number" &&
    typeof input.column !== "number"
  ) {
    const searchResult = engine.searchSymbols(input.symbolName) as {
      items?: Array<{ id?: string; label?: string; name?: string }>;
    };
    const items = searchResult.items ?? [];
    const exactMatches = items.filter(
      (item) =>
        item.name === input.symbolName ||
        item.label === input.symbolName ||
        item.id?.endsWith(`#${input.symbolName}`),
    );
    const candidates = exactMatches.length > 0 ? exactMatches : items;

    if (candidates.length === 1 && candidates[0].id) {
      return { symbolId: candidates[0].id };
    }

    return {
      candidates: candidates.slice(0, 10),
      hint:
        candidates.length === 0
          ? `No symbol matched ${input.symbolName}. Try graphtrace_search_symbols or search_code first.`
          : "Pass symbolId or filePath + symbolName to disambiguate.",
      resolutionRequired: true,
    };
  }

  return toSymbolLocator(input);
}

function isSymbolResolutionRequired(
  result: SymbolLocator | SymbolResolutionRequired,
): result is SymbolResolutionRequired {
  return "resolutionRequired" in result;
}

function toSymbolLocator(input: SymbolLocatorInput): SymbolLocator {
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
