import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { indexWorkspace } from "@graphtrace/indexer";
import type {
  CoverageSummary,
  DependencyDirection,
  DiscoveredUnit,
  GraphItem,
  IndexFreshnessInfo,
  IndexRunInfo,
  QueryResult,
  SearchItem,
  SymbolDescriptor,
  SymbolLocator,
} from "@graphtrace/shared";
import { GRAPHTRACE_DB_PATH, createGraphEnvelope } from "@graphtrace/shared";
import type { GraphStore } from "@graphtrace/storage";
import { openGraphStore } from "@graphtrace/storage";

export function createQueryEngine(store: GraphStore) {
  const coverage = (): CoverageSummary | undefined => {
    const partialUnits = store
      .units()
      .filter(
        (unit) => unit.indexingMode !== "full" || unit.language === "unknown",
      );

    if (partialUnits.length === 0) {
      return undefined;
    }

    return {
      warnings: [
        {
          code: "partial-indexing",
          message:
            "Some workspace units were indexed as shallow metadata only; results may omit symbols, routes, or edges from those units.",
          unitIds: partialUnits.map((unit) => unit.id),
        },
      ],
    };
  };

  const withCoverage = <T>(result: QueryResult<T>): QueryResult<T> => {
    const coverageSummary = coverage();
    if (!coverageSummary) {
      return result;
    }

    return {
      ...result,
      coverage: coverageSummary,
      graph: result.graph
        ? {
            ...result.graph,
            coverage: coverageSummary,
          }
        : result.graph,
    };
  };

  const resolveSymbol = (locator: SymbolLocator): SymbolDescriptor | null => {
    if ("symbolId" in locator) {
      return store.symbolById(locator.symbolId);
    }

    if ("symbolName" in locator) {
      return store.symbolByFileAndName(locator.filePath, locator.symbolName);
    }

    return store.symbolByFilePosition(
      locator.filePath,
      locator.line,
      locator.column,
    );
  };

  const zeroHopSymbolResult = (
    symbols: SymbolDescriptor[],
  ): QueryResult<SymbolDescriptor> =>
    withCoverage({
      items: symbols,
      graph: createGraphEnvelope({
        nodes: symbols.map(toSymbolGraphItem),
        summary: {
          nodeCount: symbols.length,
          edgeCount: 0,
          rootNodeIds: symbols.map((symbol) => symbol.id),
          confidence: {},
        },
      }),
    });

  return {
    search(query: string, kind?: string) {
      return withCoverage(store.search(query, kind));
    },
    searchByRepository(repositoryId: string, query: string, kind?: string) {
      return withCoverage(store.searchByRepository(repositoryId, query, kind));
    },
    routes(packageName?: string) {
      return withCoverage(store.routes(packageName));
    },
    routesByRepository(repositoryId: string, packageName?: string) {
      return withCoverage(store.routesByRepository(repositoryId, packageName));
    },
    dependencies(
      target: string,
      direction: DependencyDirection = "both",
      depth = 1,
    ) {
      return withCoverage(store.fileDependencies(target, direction, depth));
    },
    dependenciesByRepository(
      repositoryId: string,
      target: string,
      direction: DependencyDirection = "both",
      depth = 1,
    ) {
      return withCoverage(
        store.fileDependenciesByRepository(
          repositoryId,
          target,
          direction,
          depth,
        ),
      );
    },
    impact(target: string, depth = 6) {
      return withCoverage(store.impactFromPath(target, depth));
    },
    impactByRepository(repositoryId: string, target: string, depth = 6) {
      return withCoverage(
        store.impactFromPathByRepository(repositoryId, target, depth),
      );
    },
    flow(target: string, depth = 6) {
      return withCoverage(store.flowFromRoute(target, depth));
    },
    flowByRepository(repositoryId: string, target: string, depth = 6) {
      return withCoverage(
        store.flowFromRouteByRepository(repositoryId, target, depth),
      );
    },
    listPackages() {
      return store.packageOverview();
    },
    listPackagesByRepository(repositoryId: string) {
      return store.packageOverviewByRepository(repositoryId);
    },
    getPackageOverview() {
      return store.packageOverview();
    },
    repositories() {
      return {
        items: store.repositories(),
      };
    },
    getSymbolContext(query: string) {
      return withCoverage(store.search(query));
    },
    searchSymbols(query: string) {
      return zeroHopSymbolResult(
        store
          .search(query, "symbol")
          .items.map((item) => store.symbolById(item.id))
          .filter((item): item is SymbolDescriptor => item !== null),
      );
    },
    getSymbol(locator: SymbolLocator) {
      const symbol = resolveSymbol(locator);
      return zeroHopSymbolResult(symbol ? [symbol] : []);
    },
    getSymbolNeighbors(locator: SymbolLocator): QueryResult<GraphItem> {
      const symbol = resolveSymbol(locator);

      if (!symbol) {
        return withCoverage({
          items: [],
          graph: createGraphEnvelope(),
        });
      }

      const graph = store.symbolNeighbors(symbol.id);
      return withCoverage({
        items: graph.nodes,
        graph,
      });
    },
    executionContextFromSymbol(
      locator: SymbolLocator,
      options?: { maxNodes?: number; maxEdges?: number },
    ): QueryResult<GraphItem> {
      const symbol = resolveSymbol(locator);

      if (!symbol) {
        return withCoverage({
          items: [],
          graph: createGraphEnvelope(),
        });
      }

      const graph = store.executionContextFromSymbol(symbol.id, options);
      return withCoverage({
        items: graph.nodes,
        graph,
      });
    },
    impactFromSymbol(
      locator: SymbolLocator,
      options?: { maxNodes?: number; maxEdges?: number },
    ): QueryResult<GraphItem> {
      const symbol = resolveSymbol(locator);

      if (!symbol) {
        return withCoverage({
          items: [],
          graph: createGraphEnvelope(),
        });
      }

      const graph = store.impactFromSymbol(symbol.id, options);
      return withCoverage({
        items: graph.nodes,
        graph,
      });
    },
    explainEdge(edgeId: string) {
      return store.explainEdge(edgeId);
    },
    status(workspaceRoot: string, dbPath: string) {
      const units = store.units();
      const lastIndexRun = store.lastIndexRun();

      return {
        workspaceRoot,
        dbPath,
        counts: store.stats(),
        units,
        lastIndexRun,
        freshness: evaluateIndexFreshness(workspaceRoot, units, lastIndexRun),
      };
    },
    statusByRepository(
      workspaceRoot: string,
      dbPath: string,
      repositoryId: string,
    ) {
      const units = store.units();
      const lastIndexRun = store.lastIndexRun();

      return {
        workspaceRoot,
        dbPath,
        counts: store.statsByRepository(repositoryId),
        units,
        repositories: store.repositories(),
        selectedRepositoryId: repositoryId,
        lastIndexRun,
        freshness: evaluateIndexFreshness(workspaceRoot, units, lastIndexRun),
      };
    },
  };
}

const FRESHNESS_SCAN_LIMIT = 10_000;
const FRESHNESS_IGNORED_DIRECTORIES = new Set([
  ".git",
  ".graphtrace",
  ".pnpm-store",
  ".worktrees",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);

function evaluateIndexFreshness(
  workspaceRoot: string,
  units: DiscoveredUnit[],
  lastIndexRun: IndexRunInfo | null,
): IndexFreshnessInfo {
  const checkedAt = new Date().toISOString();

  if (!existsSync(workspaceRoot)) {
    return {
      state: "missing",
      checkedAt,
      reason: `Workspace root does not exist: ${workspaceRoot}`,
    };
  }

  if (!lastIndexRun?.completedAt) {
    return {
      state: "unknown",
      checkedAt,
      reason: "No completed index run found.",
    };
  }

  const indexedAt = Date.parse(lastIndexRun.completedAt);
  if (Number.isNaN(indexedAt)) {
    return {
      state: "unknown",
      checkedAt,
      reason: `Invalid completedAt timestamp: ${lastIndexRun.completedAt}`,
    };
  }

  const sourceRoots = uniqueSourceRoots(workspaceRoot, units);
  const newestSource = findNewestSourceFile(workspaceRoot, sourceRoots);

  if (newestSource.truncated) {
    return {
      state: "unknown",
      checkedAt,
      reason: `Freshness scan exceeded ${FRESHNESS_SCAN_LIMIT} files before completion.`,
    };
  }

  if (!newestSource.path) {
    return {
      state: "unknown",
      checkedAt,
      reason: "No source files found for freshness scan.",
    };
  }

  if (newestSource.mtimeMs > indexedAt) {
    return {
      state: "stale",
      checkedAt,
      reason: `${newestSource.path} changed after the last completed index run.`,
      newestSourcePath: newestSource.path,
      newestSourceMtime: new Date(newestSource.mtimeMs).toISOString(),
    };
  }

  return {
    state: "fresh",
    checkedAt,
    newestSourcePath: newestSource.path,
    newestSourceMtime: new Date(newestSource.mtimeMs).toISOString(),
  };
}

function uniqueSourceRoots(
  workspaceRoot: string,
  units: DiscoveredUnit[],
): string[] {
  const roots = new Set<string>();

  for (const unit of units) {
    for (const sourceRoot of unit.sourceRoots) {
      const absoluteRoot = join(workspaceRoot, sourceRoot);
      if (existsSync(absoluteRoot)) {
        roots.add(absoluteRoot);
      }
    }
  }

  if (roots.size === 0) {
    roots.add(workspaceRoot);
  }

  return [...roots];
}

function findNewestSourceFile(
  workspaceRoot: string,
  sourceRoots: string[],
): { path?: string; mtimeMs: number; truncated: boolean } {
  let scannedFiles = 0;
  let newestPath: string | undefined;
  let newestMtimeMs = 0;
  const seenDirectories = new Set<string>();

  const scanDirectory = (directory: string): boolean => {
    if (seenDirectories.has(directory)) {
      return true;
    }
    seenDirectories.add(directory);

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);

      if (entry.isDirectory()) {
        if (!FRESHNESS_IGNORED_DIRECTORIES.has(entry.name)) {
          const completed = scanDirectory(absolutePath);
          if (!completed) {
            return false;
          }
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      scannedFiles += 1;
      if (scannedFiles > FRESHNESS_SCAN_LIMIT) {
        return false;
      }

      const mtimeMs = statSync(absolutePath).mtimeMs;
      if (mtimeMs > newestMtimeMs) {
        newestMtimeMs = mtimeMs;
        newestPath = relative(workspaceRoot, absolutePath).replaceAll(
          "\\",
          "/",
        );
      }
    }

    return true;
  };

  for (const sourceRoot of sourceRoots) {
    const completed = scanDirectory(sourceRoot);
    if (!completed) {
      return { mtimeMs: newestMtimeMs, path: newestPath, truncated: true };
    }
  }

  return { mtimeMs: newestMtimeMs, path: newestPath, truncated: false };
}

export interface SearchReplayExpectation {
  idIncludes?: string;
  pathIncludes?: string;
  labelIncludes?: string;
  kind?: string;
}

export interface SearchReplayCase {
  id: string;
  query: string;
  kind?: string;
  expected: SearchReplayExpectation[];
}

export interface SearchReplayCaseResult {
  id: string;
  query: string;
  hit: boolean;
  matchedExpectations: number;
  topItems: SearchItem[];
}

export interface SearchReplayReport {
  total: number;
  hits: number;
  misses: number;
  hitRate: number;
  missedCaseIds: string[];
  results: SearchReplayCaseResult[];
}

interface SearchReplayEngine {
  search(query: string, kind?: string): QueryResult<SearchItem>;
}

export function evaluateSearchReplay(
  engine: SearchReplayEngine,
  cases: SearchReplayCase[],
  options: { topK?: number } = {},
): SearchReplayReport {
  const topK = options.topK ?? 5;
  const results = cases.map((replayCase) => {
    const topItems = engine
      .search(replayCase.query, replayCase.kind)
      .items.slice(0, topK);
    const matchedExpectations = replayCase.expected.filter((expectation) =>
      topItems.some((item) => searchItemMatchesExpectation(item, expectation)),
    ).length;
    const hit =
      replayCase.expected.length === 0 ||
      matchedExpectations === replayCase.expected.length;

    return {
      id: replayCase.id,
      query: replayCase.query,
      hit,
      matchedExpectations,
      topItems,
    };
  });
  const hits = results.filter((result) => result.hit).length;
  const total = results.length;

  return {
    total,
    hits,
    misses: total - hits,
    hitRate: total === 0 ? 0 : hits / total,
    missedCaseIds: results
      .filter((result) => !result.hit)
      .map((result) => result.id),
    results,
  };
}

function searchItemMatchesExpectation(
  item: SearchItem,
  expectation: SearchReplayExpectation,
): boolean {
  if (expectation.kind && item.kind !== expectation.kind) {
    return false;
  }
  if (expectation.idIncludes && !item.id.includes(expectation.idIncludes)) {
    return false;
  }
  if (
    expectation.pathIncludes &&
    !item.path?.includes(expectation.pathIncludes)
  ) {
    return false;
  }
  if (
    expectation.labelIncludes &&
    !item.label.includes(expectation.labelIncludes)
  ) {
    return false;
  }

  return true;
}

export async function runWorkspaceIndex(options: {
  workspaceRoot: string;
  mode?: "full" | "incremental";
  changedFiles?: string[];
  removedFiles?: string[];
  dbPath?: string;
  persistWorkspaceArtifacts?: boolean;
}) {
  return indexWorkspace({
    workspaceRoot: options.workspaceRoot,
    full: options.mode === "full",
    changedFiles: options.changedFiles,
    removedFiles: options.removedFiles,
    dbPath: options.dbPath,
    persistWorkspaceArtifacts: options.persistWorkspaceArtifacts,
  });
}

export function withWorkspaceQueryEngine<T>(
  workspaceRoot: string,
  action: (engine: ReturnType<typeof createQueryEngine>, dbPath: string) => T,
): T {
  const dbPath = join(workspaceRoot, GRAPHTRACE_DB_PATH);
  return withWorkspaceQueryEngineForDbPath(dbPath, action);
}

export function withWorkspaceQueryEngineForDbPath<T>(
  dbPath: string,
  action: (engine: ReturnType<typeof createQueryEngine>, dbPath: string) => T,
): T {
  const store = openGraphStore(dbPath, {
    readOnly: true,
    timeout: 2_000,
  });
  const engine = createQueryEngine(store);

  try {
    return action(engine, dbPath);
  } finally {
    store.close();
  }
}

function toSymbolGraphItem(symbol: SymbolDescriptor): GraphItem {
  return {
    id: symbol.id,
    kind: "symbol",
    label: symbol.displayName,
    path: symbol.filePath,
    symbol,
  };
}
