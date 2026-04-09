import type {
  GraphEdgeDescriptor,
  GraphEnvelope,
  GraphEnvelopeSummary,
  GraphItem,
} from "@graphtrace/shared";

import type {
  ArchitectureGraphEdge,
  ArchitectureGraphModel,
  ArchitectureGraphNode,
} from "./architecture-graph";
import type {
  SymbolGraphConfidenceFilter,
  SymbolGraphConfidenceOption,
  SymbolGraphData,
  SymbolGraphInspectorSection,
  SymbolGraphMode,
} from "./symbol-graph-types";

export function buildSymbolGraphModel(
  input: SymbolGraphData,
): ArchitectureGraphModel {
  const filteredGraph = filterSymbolGraph(input);
  const nodes = filteredGraph.nodes.map((node) =>
    toArchitectureNode(node, input.rootSymbolId),
  );
  const edges = filteredGraph.edges.map((edge) =>
    toArchitectureEdge(
      edge.type,
      edge.id,
      edge.sourceId,
      edge.targetId,
      input.mode,
    ),
  );

  return {
    nodes,
    edges,
    focusId: input.rootSymbolId,
  };
}

export function buildSymbolInspectorSections(input: {
  graph?: GraphEnvelope;
  rootSymbolId: string;
  mode: SymbolGraphMode;
  confidenceFilter: SymbolGraphConfidenceFilter;
  labels: Record<SymbolGraphInspectorSection["id"], string>;
}): SymbolGraphInspectorSection[] {
  const graph = filterSymbolGraph({
    graph: input.graph,
    rootSymbolId: input.rootSymbolId,
    mode: input.mode,
    confidenceFilter: input.confidenceFilter,
  });

  if (!graph) {
    return [];
  }

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const callers = collectNodes(
    graph,
    (edge) =>
      edge.targetId === input.rootSymbolId &&
      edge.type === edgeTypeForIncomingSection(input.mode),
    (edge) => edge.sourceId,
    nodeById,
  );
  const callees = collectNodes(
    graph,
    (edge) =>
      edge.sourceId === input.rootSymbolId &&
      edge.type === edgeTypeForOutgoingSection(input.mode),
    (edge) => edge.targetId,
    nodeById,
  );
  const routes =
    input.mode === "reference"
      ? []
      : collectNodes(
          graph,
          (edge) =>
            edge.targetId === input.rootSymbolId && edge.type === "routes_to",
          (edge) => edge.sourceId,
          nodeById,
        );
  const sinks =
    input.mode === "reference"
      ? []
      : collectNodes(
          graph,
          (edge) =>
            edge.sourceId === input.rootSymbolId && edge.type === "queries",
          (edge) => edge.targetId,
          nodeById,
        );

  return [
    {
      id: "callers",
      title: input.labels.callers,
      items: callers,
    },
    {
      id: "callees",
      title: input.labels.callees,
      items: callees,
    },
    {
      id: "routes",
      title: input.labels.routes,
      items: routes,
    },
    {
      id: "sinks",
      title: input.labels.sinks,
      items: sinks,
    },
  ];
}

export function buildSymbolConfidenceOptions(input: {
  summary?: GraphEnvelopeSummary;
  labels: Record<SymbolGraphConfidenceFilter, string>;
}): SymbolGraphConfidenceOption[] {
  const confidence = input.summary?.confidence ?? {};
  const provenCount = confidence.proven ?? 0;
  const inferredStrongCount = confidence["inferred-strong"] ?? 0;
  const inferredWeakCount = confidence["inferred-weak"] ?? 0;

  return [
    {
      id: "strong",
      label: input.labels.strong,
      count: provenCount + inferredStrongCount,
    },
    {
      id: "proven",
      label: input.labels.proven,
      count: provenCount,
    },
    {
      id: "all",
      label: input.labels.all,
      count: provenCount + inferredStrongCount + inferredWeakCount,
    },
  ];
}

function collectNodes(
  graph: GraphEnvelope,
  predicate: (edge: GraphEnvelope["edges"][number]) => boolean,
  getNodeId: (edge: GraphEnvelope["edges"][number]) => string,
  nodeById: Map<string, GraphItem>,
): GraphItem[] {
  const seenIds = new Set<string>();

  return graph.edges
    .filter(predicate)
    .map((edge) => nodeById.get(getNodeId(edge)))
    .filter((node): node is GraphItem => {
      if (!node || seenIds.has(node.id)) {
        return false;
      }

      seenIds.add(node.id);
      return true;
    });
}

function toArchitectureNode(
  node: GraphItem,
  rootSymbolId: string,
): ArchitectureGraphNode {
  return {
    id: node.id,
    kind: node.kind,
    label: node.label,
    path: node.path,
    cluster:
      node.id === rootSymbolId
        ? "focus"
        : node.kind === "route"
          ? "routes"
          : node.kind === "query"
            ? "queries"
            : node.kind === "package"
              ? "packages"
              : node.kind === "file"
                ? "files"
                : "dependencies",
  };
}

function toArchitectureEdge(
  edgeType: string,
  id: string,
  sourceId: string,
  targetId: string,
  mode: SymbolGraphMode,
): ArchitectureGraphEdge {
  return {
    id,
    sourceId,
    targetId,
    kind:
      edgeType === "references"
        ? "depends"
        : mode === "impact"
          ? "impacts"
          : "flow",
  };
}

function filterSymbolGraph(
  input: Pick<
    SymbolGraphData,
    "graph" | "mode" | "rootSymbolId" | "confidenceFilter"
  >,
): GraphEnvelope | undefined {
  if (!input.graph) {
    return undefined;
  }

  const allowedEdgeTypes = allowedEdgeTypesForMode(input.mode);
  const edges = input.graph.edges.filter(
    (edge) =>
      allowedEdgeTypes.has(edge.type) &&
      matchesConfidenceFilter(edge, input.confidenceFilter),
  );
  const nodeIds = new Set<string>([input.rootSymbolId]);

  for (const edge of edges) {
    nodeIds.add(edge.sourceId);
    nodeIds.add(edge.targetId);
  }

  return {
    ...input.graph,
    nodes: input.graph.nodes.filter((node) => nodeIds.has(node.id)),
    edges,
  };
}

function allowedEdgeTypesForMode(mode: SymbolGraphMode) {
  if (mode === "reference") {
    return new Set<GraphEdgeDescriptor["type"]>(["references"]);
  }

  return new Set<GraphEdgeDescriptor["type"]>([
    "calls",
    "routes_to",
    "queries",
  ]);
}

function matchesConfidenceFilter(
  edge: GraphEdgeDescriptor,
  filter: SymbolGraphConfidenceFilter,
) {
  switch (filter) {
    case "all":
      return true;
    case "proven":
      return edge.confidenceLabel === "proven";
    case "strong":
      return edge.confidenceLabel !== "inferred-weak";
  }
}

function edgeTypeForIncomingSection(mode: SymbolGraphMode) {
  return mode === "reference" ? "references" : "calls";
}

function edgeTypeForOutgoingSection(mode: SymbolGraphMode) {
  return mode === "reference" ? "references" : "calls";
}
