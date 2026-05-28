import { join } from "node:path";

import { indexWorkspace } from "@graphtrace/indexer";
import type {
  CoverageSummary,
  DependencyDirection,
  GraphItem,
  QueryResult,
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
      return {
        workspaceRoot,
        dbPath,
        counts: store.stats(),
        units: store.units(),
        lastIndexRun: store.lastIndexRun(),
      };
    },
    statusByRepository(
      workspaceRoot: string,
      dbPath: string,
      repositoryId: string,
    ) {
      return {
        workspaceRoot,
        dbPath,
        counts: store.statsByRepository(repositoryId),
        units: store.units(),
        repositories: store.repositories(),
        selectedRepositoryId: repositoryId,
        lastIndexRun: store.lastIndexRun(),
      };
    },
  };
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
