import type { GraphEdgeDescriptor } from "@graphtrace/shared";
import type { CrudBoosterModule } from "./extract-modules";

export function extractCrudBoosterFlow(
  modules: CrudBoosterModule[],
): GraphEdgeDescriptor[] {
  const edges = new Map<string, GraphEdgeDescriptor>();

  for (const module of modules) {
    if (!module.modelSymbolId) {
      continue;
    }

    edges.set(
      `edge:references:${module.controllerSymbolId}->${module.modelSymbolId}:crudbooster-model`,
      {
        id: `edge:references:${module.controllerSymbolId}->${module.modelSymbolId}:crudbooster-model`,
        type: "references",
        sourceId: module.controllerSymbolId,
        sourceKind: "symbol",
        targetId: module.modelSymbolId,
        targetKind: "symbol",
        confidence: 0.9,
        confidenceLabel: "inferred-strong",
        provenance: {
          kind: "crudbooster-model-binding",
          source: "framework:crudbooster",
          evidence: [module.controllerSymbolId, module.modelSymbolId],
        },
      },
    );
  }

  return [...edges.values()];
}
