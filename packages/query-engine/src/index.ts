import { join } from "node:path";

import { indexWorkspace } from "@graphtrace/indexer";
import type { DependencyDirection } from "@graphtrace/shared";
import { GRAPHTRACE_DB_PATH } from "@graphtrace/shared";
import type { GraphStore } from "@graphtrace/storage";
import { openGraphStore } from "@graphtrace/storage";

export function createQueryEngine(store: GraphStore) {
  return {
    search(query: string, kind?: string) {
      return store.search(query, kind);
    },
    routes(packageName?: string) {
      return store.routes(packageName);
    },
    dependencies(
      target: string,
      direction: DependencyDirection = "both",
      depth = 1,
    ) {
      return store.fileDependencies(target, direction, depth);
    },
    impact(target: string, depth = 6) {
      return store.impactFromPath(target, depth);
    },
    flow(target: string, depth = 6) {
      return store.flowFromRoute(target, depth);
    },
    listPackages() {
      return store.packageOverview();
    },
    getPackageOverview() {
      return store.packageOverview();
    },
    getSymbolContext(query: string) {
      return store.search(query);
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
  };
}

export async function runWorkspaceIndex(options: {
  workspaceRoot: string;
  mode?: "full" | "incremental";
  changedFiles?: string[];
  removedFiles?: string[];
}) {
  return indexWorkspace({
    workspaceRoot: options.workspaceRoot,
    full: options.mode === "full",
    changedFiles: options.changedFiles,
    removedFiles: options.removedFiles,
  });
}

export function withWorkspaceQueryEngine<T>(
  workspaceRoot: string,
  action: (engine: ReturnType<typeof createQueryEngine>, dbPath: string) => T,
): T {
  const dbPath = join(workspaceRoot, GRAPHTRACE_DB_PATH);
  const store = openGraphStore(dbPath);
  const engine = createQueryEngine(store);

  try {
    return action(engine, dbPath);
  } finally {
    store.close();
  }
}
