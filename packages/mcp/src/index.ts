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
import {
  type CoverageSummary,
  GRAPHTRACE_DB_PATH,
  type GraphTraceStatus,
  type IndexFreshnessInfo,
  type QueryResult,
  type RouteItem,
  type SearchItem,
  type SearchKind,
  type SymbolLocator,
} from "@graphtrace/shared";
import type { WorkspaceRecord } from "@graphtrace/storage";
import { createMcpTelemetry } from "./telemetry";

const TRIAGE_CANDIDATE_LIMIT = 5;
const TRIAGE_FOCUSED_QUERY_LIMIT = 6;

const TRIAGE_STOP_WORDS = new Set([
  "about",
  "and",
  "code",
  "context",
  "controller",
  "find",
  "for",
  "handler",
  "into",
  "please",
  "relevant",
  "route",
  "routes",
  "the",
  "this",
  "with",
]);

const DEFAULT_COMPACT_ITEM_LIMIT = 25;
const SEARCH_COMPACT_ITEM_LIMIT = 10;

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

function compactQueryResult<T>(
  result: QueryResult<T>,
  limit = DEFAULT_COMPACT_ITEM_LIMIT,
): QueryResult<T> & {
  summary: {
    compact: true;
    totalItems: number;
    returnedItems: number;
    truncated: boolean;
    nextAction?: string;
  };
} {
  const totalItems = result.items.length;
  const returnedItems = Math.min(totalItems, limit);
  const truncated = totalItems > limit;

  return {
    ...result,
    items: result.items.slice(0, limit),
    summary: {
      compact: true,
      totalItems,
      returnedItems,
      truncated,
      nextAction: truncated
        ? "Call this tool with verbose: true to return the full item list."
        : undefined,
    },
  };
}

function compactStatus(status: GraphTraceStatus): Omit<
  GraphTraceStatus,
  "units" | "repositories"
> & {
  summary: {
    compact: true;
    unitCount: number;
    repositoryCount: number;
    nextAction: string;
  };
} {
  const { units, repositories, ...rest } = status;

  return {
    ...rest,
    summary: {
      compact: true,
      unitCount: units.length,
      repositoryCount: repositories?.length ?? 0,
      nextAction:
        "Call get_status with verbose: true to include units and repositories.",
    },
  };
}

function withFreshnessWarning<T>(
  result: QueryResult<T>,
  freshness: IndexFreshnessInfo,
): QueryResult<T> {
  if (freshness.state === "fresh") {
    return result;
  }

  const coverage = appendFreshnessCoverageWarning(result.coverage, freshness);

  return {
    ...result,
    freshness,
    coverage,
    graph: result.graph
      ? {
          ...result.graph,
          coverage: appendFreshnessCoverageWarning(
            result.graph.coverage,
            freshness,
          ),
        }
      : result.graph,
  };
}

function appendFreshnessCoverageWarning(
  coverage: CoverageSummary | undefined,
  freshness: IndexFreshnessInfo,
): CoverageSummary {
  return {
    warnings: [
      ...(coverage?.warnings ?? []),
      {
        code: `index-${freshness.state}`,
        message:
          freshness.reason ??
          `Index freshness is ${freshness.state}; search results may be incomplete.`,
        unitIds: [],
      },
    ],
  };
}

function contextFreshness(
  context: ResolvedWorkspaceContext,
): IndexFreshnessInfo {
  return (context.status() as GraphTraceStatus).freshness;
}

type TriageSearch = {
  query: string;
  kind: SearchKind;
  hitCount: number;
};

type TriageConfidenceLabel = "high" | "medium" | "low";
type AgentConfidenceLabel = "high" | "medium" | "low";

type ConfidenceSummary = {
  label: AgentConfidenceLabel;
  signals: string[];
  confidence?: Partial<
    Record<"proven" | "inferred-strong" | "inferred-weak", number>
  >;
  recommendedVerification?: string[];
};

type ConfidenceSummaryMode =
  | "search"
  | "routes"
  | "flow"
  | "execution"
  | "impact";

function withConfidenceSummary<TItem>(
  result: QueryResult<TItem>,
  mode: ConfidenceSummaryMode,
): QueryResult<TItem> & { confidenceSummary: ConfidenceSummary } {
  return {
    ...result,
    confidenceSummary: buildConfidenceSummary(result, mode),
  };
}

function buildConfidenceSummary<TItem>(
  result: QueryResult<TItem>,
  mode: ConfidenceSummaryMode,
): ConfidenceSummary {
  const signals: string[] = [];
  const recommendedVerification: string[] = [];
  const confidence = result.graph?.summary.confidence ?? {};
  const warnings =
    result.coverage?.warnings ?? result.graph?.coverage?.warnings ?? [];
  const freshnessState = result.freshness?.state;
  const firstItem = result.items[0] as { confidence?: number } | undefined;
  const topItemConfidence =
    typeof firstItem?.confidence === "number"
      ? firstItem.confidence
      : undefined;

  if ((confidence.proven ?? 0) > 0) {
    signals.push("proven");
  }
  if ((confidence["inferred-strong"] ?? 0) > 0) {
    signals.push("inferred-strong");
  }
  if ((confidence["inferred-weak"] ?? 0) > 0) {
    signals.push("inferred-weak");
  }
  if (warnings.some((warning) => warning.code === "partial-indexing")) {
    signals.push("partial", "shallow");
    recommendedVerification.push(
      "Verify source files manually because some workspace units were indexed as shallow metadata only.",
    );
  }
  if (freshnessState && freshnessState !== "fresh") {
    signals.push(freshnessState);
    recommendedVerification.push(
      "Run run_index before relying on this result because the workspace index is not fresh.",
    );
  }
  if (
    result.graph?.summary.truncated?.nodeLimitReached ||
    result.graph?.summary.truncated?.edgeLimitReached
  ) {
    signals.push("bounded");
  }
  if (mode === "search" && signals.length === 0) {
    signals.push("lead-only");
  }
  if (mode === "routes" && topItemConfidence && topItemConfidence >= 0.9) {
    signals.push("route-match");
  }
  if (
    signals.includes("inferred-strong") ||
    signals.includes("inferred-weak")
  ) {
    recommendedVerification.push(
      "Use graphtrace_explain_edge on inferred edges before treating them as ground truth.",
    );
  }

  const dedupedSignals = uniqueStrings(signals);
  const dedupedVerification = uniqueStrings(recommendedVerification);
  const label = scoreConfidenceLabel(mode, dedupedSignals, topItemConfidence);

  return {
    label,
    signals: dedupedSignals,
    confidence: Object.keys(confidence).length > 0 ? confidence : undefined,
    recommendedVerification:
      label === "low" && dedupedVerification.length > 0
        ? dedupedVerification
        : undefined,
  };
}

function scoreConfidenceLabel(
  mode: ConfidenceSummaryMode,
  signals: string[],
  topItemConfidence?: number,
): AgentConfidenceLabel {
  if (
    signals.includes("stale") ||
    signals.includes("missing") ||
    signals.includes("unknown") ||
    signals.includes("partial") ||
    signals.includes("shallow")
  ) {
    return "low";
  }

  if (signals.includes("inferred-weak")) {
    return "medium";
  }

  if (signals.includes("inferred-strong") || signals.includes("bounded")) {
    return "medium";
  }

  if (mode === "search") {
    return "medium";
  }

  if (mode === "routes" && typeof topItemConfidence === "number") {
    return topItemConfidence >= 0.9 ? "high" : "medium";
  }

  return signals.includes("proven") ? "high" : "medium";
}

function buildRelevantContextTriage(
  engine: ReturnType<typeof createQueryEngine>,
  status: GraphTraceStatus,
  query: string,
  maxItems = TRIAGE_CANDIDATE_LIMIT,
) {
  const focusedQueries = decomposeTriageQuery(query);
  const searches: TriageSearch[] = [];
  const symbols = collectTriageSearchItems(
    engine,
    focusedQueries,
    "symbol",
    searches,
    maxItems,
  );
  const files = collectTriageSearchItems(
    engine,
    focusedQueries,
    "file",
    searches,
    maxItems,
  );
  const routeSearchItems = collectTriageSearchItems(
    engine,
    focusedQueries,
    "route",
    searches,
    maxItems,
  );
  const routes = collectTriageRoutes(
    engine.routes().items,
    focusedQueries,
    routeSearchItems,
    maxItems,
  );
  const confidence = scoreTriageConfidence({
    freshness: status.freshness,
    fileCount: files.length,
    routeCount: routes.length,
    symbolCount: symbols.length,
  });

  return {
    query,
    workspaceRoot: status.workspaceRoot,
    freshness: status.freshness,
    searches,
    candidates: {
      routes,
      symbols,
      files,
    },
    confidence,
    nextActions: buildTriageNextActions({
      freshness: status.freshness,
      hasFiles: files.length > 0,
      hasRoutes: routes.length > 0,
      hasSymbols: symbols.length > 0,
    }),
  };
}

function decomposeTriageQuery(query: string): string[] {
  const trimmedQuery = query.trim();
  const tokens = trimmedQuery
    .split(/[^A-Za-z0-9_\\]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !TRIAGE_STOP_WORDS.has(token.toLowerCase()));

  return uniqueStrings([trimmedQuery, ...tokens]).slice(
    0,
    TRIAGE_FOCUSED_QUERY_LIMIT,
  );
}

function collectTriageSearchItems(
  engine: ReturnType<typeof createQueryEngine>,
  queries: string[],
  kind: SearchKind,
  searches: TriageSearch[],
  maxItems: number,
): SearchItem[] {
  const candidates = new Map<string, SearchItem>();

  for (const focusedQuery of queries) {
    const result = engine.search(focusedQuery, kind);
    searches.push({
      query: focusedQuery,
      kind,
      hitCount: result.items.length,
    });

    for (const item of result.items) {
      if (!candidates.has(item.id)) {
        candidates.set(item.id, item);
      }
    }
  }

  return [...candidates.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, maxItems);
}

function collectTriageRoutes(
  routes: RouteItem[],
  focusedQueries: string[],
  routeSearchItems: SearchItem[],
  maxItems: number,
): RouteItem[] {
  const routeSearchIds = new Set(routeSearchItems.map((item) => item.id));
  const terms = focusedQueries.map((value) => value.toLowerCase());

  return routes
    .map((route) => ({
      route,
      score: scoreRouteMatch(route, terms, routeSearchIds),
    }))
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.route.confidence - left.route.confidence,
    )
    .map((entry) => entry.route)
    .slice(0, maxItems);
}

function scoreRouteMatch(
  route: RouteItem,
  terms: string[],
  routeSearchIds: Set<string>,
): number {
  const haystack = [
    route.id,
    route.method,
    route.path,
    route.handlerName,
    route.handlerSymbolId,
    route.filePath,
    route.framework,
  ]
    .join(" ")
    .toLowerCase();
  const termScore = terms.filter((term) => haystack.includes(term)).length;
  const searchScore = routeSearchIds.has(route.id) ? 2 : 0;

  return termScore + searchScore;
}

function scoreTriageConfidence(input: {
  freshness: IndexFreshnessInfo;
  fileCount: number;
  routeCount: number;
  symbolCount: number;
}): { label: TriageConfidenceLabel; score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;

  if (input.freshness.state === "fresh") {
    score += 0.2;
    signals.push("fresh-index");
  } else {
    signals.push(`index-${input.freshness.state}`);
  }

  if (input.routeCount > 0) {
    score += 0.3;
    signals.push("route-match");
  }

  if (input.symbolCount > 0) {
    score += 0.3;
    signals.push("symbol-match");
  }

  if (input.fileCount > 0) {
    score += 0.2;
    signals.push("file-match");
  }

  const roundedScore = Math.min(1, Number(score.toFixed(2)));
  const label: TriageConfidenceLabel =
    roundedScore >= 0.75 ? "high" : roundedScore >= 0.4 ? "medium" : "low";

  return {
    label,
    score: roundedScore,
    signals,
  };
}

function buildTriageNextActions(input: {
  freshness: IndexFreshnessInfo;
  hasFiles: boolean;
  hasRoutes: boolean;
  hasSymbols: boolean;
}): string[] {
  const actions: string[] = [];

  if (input.freshness.state !== "fresh") {
    actions.push("Run run_index before relying on stale or unknown results.");
  }

  if (input.hasSymbols) {
    actions.push(
      "Use graphtrace_get_symbol with a candidate symbol id for exact definition context.",
    );
  }

  if (input.hasRoutes) {
    actions.push(
      "Use get_data_flow with a candidate route id to inspect route-to-query flow.",
    );
  }

  if (input.hasFiles) {
    actions.push(
      "Use get_dependencies or get_impact_analysis with a candidate file path.",
    );
  }

  actions.push(
    "Use search_code with one focused query if candidates are too broad.",
  );

  return actions;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalizedValue = value.trim();
    const key = normalizedValue.toLowerCase();
    if (!normalizedValue || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalizedValue);
  }

  return result;
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

type CwdRelationship = "exact" | "ancestor" | "descendant" | "unrelated";

interface WorkspaceRoutingWarning {
  code: "workspace-root-mismatch";
  message: string;
  currentWorkspaceRoot: string;
  requestedWorkspaceId: string;
  requestedWorkspaceRoot: string;
}

interface ResolvedWorkspaceContext {
  workspaceId?: string;
  workspaceRoot: string;
  routingWarning?: WorkspaceRoutingWarning;
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
      const resolvedContext = context;
      const result = action(resolvedContext);
      if (isPromiseLike(result)) {
        return result
          .then((value) => {
            recordWorkspaceTelemetry(
              toolName,
              startedAt,
              true,
              resolvedContext,
            );
            return appendWorkspaceRoutingWarning(value, resolvedContext);
          })
          .catch((error: unknown) => {
            recordWorkspaceTelemetry(
              toolName,
              startedAt,
              false,
              resolvedContext,
              error,
            );
            throw error;
          }) as T;
      }

      recordWorkspaceTelemetry(toolName, startedAt, true, resolvedContext);
      return appendWorkspaceRoutingWarning(result, resolvedContext);
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
          items: rankWorkspaceSummariesByCwd(
            daemon.listWorkspaceSummaries(),
            options.workspaceRoot,
          ),
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
    "find_relevant_context",
    {
      description:
        "One-shot agent triage: freshness, focused searches, top routes/symbols/files, confidence, and follow-up tools.",
      inputSchema: {
        query: z.string(),
        workspaceId: z.string().optional(),
        workspaceRoot: z.string().optional(),
        maxItems: z.number().int().positive().max(10).optional(),
      },
    },
    async ({ query, workspaceId, workspaceRoot, maxItems }) =>
      asToolResult(
        withResolvedWorkspace(
          "find_relevant_context",
          { workspaceId, workspaceRoot },
          (context) => {
            const status = context.status() as GraphTraceStatus;
            return context.withQueryEngine((engine) =>
              buildRelevantContextTriage(engine, status, query, maxItems),
            );
          },
        ),
      ),
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
            context.withQueryEngine((engine) =>
              withFreshnessWarning(
                engine.searchSymbols(query),
                contextFreshness(context),
              ),
            ),
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
              if (isSymbolResolutionRequired(resolvedLocator)) {
                return resolvedLocator;
              }

              return withConfidenceSummary(
                withFreshnessWarning(
                  engine.executionContextFromSymbol(resolvedLocator, {
                    maxNodes,
                    maxEdges,
                  }),
                  contextFreshness(context),
                ),
                "execution",
              );
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
              if (isSymbolResolutionRequired(resolvedLocator)) {
                return resolvedLocator;
              }

              return withConfidenceSummary(
                withFreshnessWarning(
                  engine.impactFromSymbol(resolvedLocator, {
                    maxNodes,
                    maxEdges,
                  }),
                  contextFreshness(context),
                ),
                "impact",
              );
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
        verbose: z.boolean().optional(),
      },
    },
    async ({ query, workspaceId, workspaceRoot, verbose }) =>
      asToolResult(
        withResolvedWorkspace(
          "search_code",
          { workspaceId, workspaceRoot },
          (context) =>
            context.withQueryEngine((engine) => {
              const result = withConfidenceSummary(
                withFreshnessWarning(
                  engine.search(query),
                  contextFreshness(context),
                ),
                "search",
              );
              return verbose
                ? result
                : compactQueryResult(result, SEARCH_COMPACT_ITEM_LIMIT);
            }),
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
            context.withQueryEngine((engine) =>
              withConfidenceSummary(
                withFreshnessWarning(
                  engine.getSymbolContext(query),
                  contextFreshness(context),
                ),
                "search",
              ),
            ),
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
            context.withQueryEngine((engine) =>
              withConfidenceSummary(
                withFreshnessWarning(
                  engine.impact(target, depth),
                  contextFreshness(context),
                ),
                "impact",
              ),
            ),
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
            context.withQueryEngine((engine) =>
              withConfidenceSummary(
                withFreshnessWarning(
                  engine.flow(target, depth),
                  contextFreshness(context),
                ),
                "flow",
              ),
            ),
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
        verbose: z.boolean().optional(),
      },
    },
    async ({ workspaceId, workspaceRoot, verbose }) =>
      asToolResult(
        withResolvedWorkspace(
          "get_routes",
          { workspaceId, workspaceRoot },
          (context) =>
            context.withQueryEngine((engine) => {
              const result = withConfidenceSummary(
                withFreshnessWarning(
                  engine.routes(),
                  contextFreshness(context),
                ),
                "routes",
              );
              return verbose ? result : compactQueryResult(result);
            }),
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
        verbose: z.boolean().optional(),
      },
    },
    async ({ workspaceId, workspaceRoot, verbose }) =>
      asToolResult(
        withResolvedWorkspace(
          "get_status",
          { workspaceId, workspaceRoot },
          (context) => {
            const status = context.status() as GraphTraceStatus;
            return verbose ? status : compactStatus(status);
          },
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
    routingWarning?: WorkspaceRoutingWarning,
  ): ResolvedWorkspaceContext {
    return {
      workspaceId: workspace.id,
      workspaceRoot: workspace.canonicalRootPath,
      routingWarning,
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
      return createRegisteredContext(
        workspace,
        buildWorkspaceRoutingWarning(workspace, options.workspaceRoot),
      );
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

function appendWorkspaceRoutingWarning<T>(
  payload: T,
  context: ResolvedWorkspaceContext,
): T {
  if (
    !context.routingWarning ||
    typeof payload !== "object" ||
    payload === null
  ) {
    return payload;
  }

  return {
    ...(payload as Record<string, unknown>),
    routingWarning: context.routingWarning,
  } as T;
}

function rankWorkspaceSummariesByCwd<T extends { canonicalRootPath: string }>(
  summaries: T[],
  currentWorkspaceRoot: string | undefined,
): Array<T & { cwdRelationship: CwdRelationship; currentCwdRank: number }> {
  if (!currentWorkspaceRoot) {
    return summaries.map((summary) => ({
      ...summary,
      cwdRelationship: "unrelated",
      currentCwdRank: cwdRelationshipRank("unrelated"),
    }));
  }

  return summaries
    .map((summary) => {
      const cwdRelationship = describeCwdRelationship(
        summary.canonicalRootPath,
        currentWorkspaceRoot,
      );
      return {
        ...summary,
        cwdRelationship,
        currentCwdRank: cwdRelationshipRank(cwdRelationship),
      };
    })
    .sort((left, right) => {
      if (left.currentCwdRank !== right.currentCwdRank) {
        return left.currentCwdRank - right.currentCwdRank;
      }
      return left.canonicalRootPath.localeCompare(right.canonicalRootPath);
    });
}

function describeCwdRelationship(
  workspaceRoot: string,
  currentWorkspaceRoot: string,
): CwdRelationship {
  const resolvedWorkspaceRoot = resolve(workspaceRoot);
  const resolvedCurrentRoot = resolve(currentWorkspaceRoot);

  if (resolvedWorkspaceRoot === resolvedCurrentRoot) {
    return "exact";
  }

  if (pathContains(resolvedWorkspaceRoot, resolvedCurrentRoot)) {
    return "ancestor";
  }

  if (pathContains(resolvedCurrentRoot, resolvedWorkspaceRoot)) {
    return "descendant";
  }

  return "unrelated";
}

function cwdRelationshipRank(relationship: CwdRelationship): number {
  switch (relationship) {
    case "exact":
      return 0;
    case "ancestor":
      return 1;
    case "descendant":
      return 2;
    default:
      return 3;
  }
}

function buildWorkspaceRoutingWarning(
  workspace: WorkspaceRecord,
  currentWorkspaceRoot: string | undefined,
): WorkspaceRoutingWarning | undefined {
  if (!currentWorkspaceRoot) {
    return undefined;
  }

  const resolvedCurrentRoot = resolve(currentWorkspaceRoot);
  const resolvedWorkspaceRoot = resolve(workspace.canonicalRootPath);

  if (resolvedCurrentRoot === resolvedWorkspaceRoot) {
    return undefined;
  }

  return {
    code: "workspace-root-mismatch",
    message:
      `Requested workspace ${workspace.id} points at ${workspace.canonicalRootPath}, ` +
      `but the current MCP cwd resolves to ${resolvedCurrentRoot}.`,
    currentWorkspaceRoot: resolvedCurrentRoot,
    requestedWorkspaceId: workspace.id,
    requestedWorkspaceRoot: workspace.canonicalRootPath,
  };
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
