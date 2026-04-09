import { join } from "node:path";

import { indexWorkspace } from "@graphtrace/indexer";
import type {
  DependencyDirection,
  GraphItem,
  QueryResult,
  SymbolDescriptor,
  SymbolLocator,
} from "@graphtrace/shared";
import { createGraphEnvelope, GRAPHTRACE_DB_PATH } from "@graphtrace/shared";
import type { GraphStore } from "@graphtrace/storage";
import { openGraphStore } from "@graphtrace/storage";

export function createQueryEngine(store: GraphStore) {
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
  ): QueryResult<SymbolDescriptor> => ({
    items: symbols,
    graph: createGraphEnvelope({
      nodes: symbols.map(toSymbolGraphItem),
      summary: {
        rootNodeIds: symbols.map((symbol) => symbol.id),
        confidence: {},
      },
    }),
  });

  return {
    search(query: string, kind?: string) {
      return store.search(query, kind);
    },
    searchByRepository(repositoryId: string, query: string, kind?: string) {
      return store.searchByRepository(repositoryId, query, kind);
    },
    routes(packageName?: string) {
      return store.routes(packageName);
    },
    routesByRepository(repositoryId: string, packageName?: string) {
      return store.routesByRepository(repositoryId, packageName);
    },
    dependencies(
      target: string,
      direction: DependencyDirection = "both",
      depth = 1,
    ) {
      return store.fileDependencies(target, direction, depth);
    },
    dependenciesByRepository(
      repositoryId: string,
      target: string,
      direction: DependencyDirection = "both",
      depth = 1,
    ) {
      return store.fileDependenciesByRepository(
        repositoryId,
        target,
        direction,
        depth,
      );
    },
    impact(target: string, depth = 6) {
      return store.impactFromPath(target, depth);
    },
    impactByRepository(repositoryId: string, target: string, depth = 6) {
      return store.impactFromPathByRepository(repositoryId, target, depth);
    },
    flow(target: string, depth = 6) {
      return store.flowFromRoute(target, depth);
    },
    flowByRepository(repositoryId: string, target: string, depth = 6) {
      return store.flowFromRouteByRepository(repositoryId, target, depth);
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
      return store.search(query);
    },
    searchSymbols(query: string) {
      return zeroHopSymbolResult(
        store.search(query, "symbol").items
          .map((item) => store.symbolById(item.id))
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
        return {
          items: [],
          graph: createGraphEnvelope(),
        };
      }

      const graph = store.symbolNeighbors(symbol.id);
      return {
        items: graph.nodes,
        graph,
      };
    },
    executionContextFromSymbol(
      locator: SymbolLocator,
      options?: { maxNodes?: number; maxEdges?: number },
    ): QueryResult<GraphItem> {
      const symbol = resolveSymbol(locator);

      if (!symbol) {
        return {
          items: [],
          graph: createGraphEnvelope(),
        };
      }

      const graph = store.executionContextFromSymbol(symbol.id, options);
      return {
        items: graph.nodes,
        graph,
      };
    },
    impactFromSymbol(
      locator: SymbolLocator,
      options?: { maxNodes?: number; maxEdges?: number },
    ): QueryResult<GraphItem> {
      const symbol = resolveSymbol(locator);

      if (!symbol) {
        return {
          items: [],
          graph: createGraphEnvelope(),
        };
      }

      const graph = store.impactFromSymbol(symbol.id, options);
      return {
        items: graph.nodes,
        graph,
      };
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
