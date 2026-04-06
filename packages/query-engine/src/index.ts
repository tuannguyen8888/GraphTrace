import type { DependencyDirection } from "@graphtrace/shared";
import type { GraphStore } from "@graphtrace/storage";

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
  };
}
