import type { DependencyDirection } from "@graphtrace/shared";
import type { GraphStore } from "@graphtrace/storage";

export function createQueryEngine(store: GraphStore) {
  return {
    search(query: string) {
      return store.search(query);
    },
    routes() {
      return store.routes();
    },
    dependencies(target: string, direction: DependencyDirection = "both") {
      return store.fileDependencies(target, direction);
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
