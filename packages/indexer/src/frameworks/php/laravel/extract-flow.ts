import type { GraphEdgeDescriptor, RouteItem } from "@graphtrace/shared";

export function extractLaravelFlow(routes: RouteItem[]): GraphEdgeDescriptor[] {
  return routes
    .filter((route) => Boolean(route.handlerSymbolId))
    .map((route) => ({
      id: `edge:routes_to:${route.id}->${route.handlerSymbolId}`,
      type: "routes_to" as const,
      sourceId: route.id,
      sourceKind: "route",
      targetId: route.handlerSymbolId,
      targetKind: "symbol",
      confidence: 1,
      confidenceLabel: "proven" as const,
      provenance: {
        kind: "route-handler",
        source: "framework:laravel",
        evidence: [`${route.method} ${route.path}`, route.handlerName],
      },
    }));
}
