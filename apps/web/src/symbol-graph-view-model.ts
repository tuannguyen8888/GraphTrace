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
  SymbolGraphControlAction,
  SymbolGraphData,
  SymbolGraphInspectorSection,
  SymbolGraphMode,
} from "./symbol-graph-types";
import {
  buildSymbolInspectorSection,
  collectSymbolInspectorSection,
  emptyInspectorSectionResult,
} from "./symbol-inspector-view-model";

export function buildSymbolGraphModel(
  input: SymbolGraphData,
): ArchitectureGraphModel {
  const filteredGraph = filterSymbolGraph(input);
  if (!filteredGraph) {
    return {
      nodes: [],
      edges: [],
      focusId: input.rootSymbolId,
    };
  }

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
      edge.confidenceLabel,
    ),
  );
  const placeholders = buildExpansionPlaceholders(input, filteredGraph.summary);

  return {
    nodes: [...nodes, ...placeholders.nodes],
    edges: [...edges, ...placeholders.edges],
    focusId: input.rootSymbolId,
  };
}

export function buildSymbolInspectorSections(input: {
  graph?: GraphEnvelope;
  rootSymbolId: string;
  mode: SymbolGraphMode;
  confidenceFilter: SymbolGraphConfidenceFilter;
  labels: Record<SymbolGraphInspectorSection["id"], string>;
  weakConfidenceWarning?: string;
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

  const callers = collectSymbolInspectorSection({
    graph,
    predicate: (edge) =>
      edge.targetId === input.rootSymbolId &&
      edge.type === edgeTypeForIncomingSection(input.mode),
    getNodeId: (edge) => edge.sourceId,
    relationshipKind: "caller",
  });
  const callees = collectSymbolInspectorSection({
    graph,
    predicate: (edge) =>
      edge.sourceId === input.rootSymbolId &&
      edge.type === edgeTypeForOutgoingSection(input.mode),
    getNodeId: (edge) => edge.targetId,
    relationshipKind: "callee",
  });
  const routes =
    input.mode === "reference"
      ? emptyInspectorSectionResult()
      : collectSymbolInspectorSection({
          graph,
          predicate: (edge) =>
            edge.targetId === input.rootSymbolId && edge.type === "routes_to",
          getNodeId: (edge) => edge.sourceId,
          relationshipKind: "route",
        });
  const sinks =
    input.mode === "reference"
      ? emptyInspectorSectionResult()
      : collectSymbolInspectorSection({
          graph,
          predicate: (edge) =>
            edge.sourceId === input.rootSymbolId && edge.type === "queries",
          getNodeId: (edge) => edge.targetId,
          relationshipKind: "sink",
        });

  return [
    buildSymbolInspectorSection({
      id: "callers",
      title: input.labels.callers,
      section: callers,
      weakConfidenceWarning: input.weakConfidenceWarning,
    }),
    buildSymbolInspectorSection({
      id: "callees",
      title: input.labels.callees,
      section: callees,
      weakConfidenceWarning: input.weakConfidenceWarning,
    }),
    buildSymbolInspectorSection({
      id: "routes",
      title: input.labels.routes,
      section: routes,
      weakConfidenceWarning: input.weakConfidenceWarning,
    }),
    buildSymbolInspectorSection({
      id: "sinks",
      title: input.labels.sinks,
      section: sinks,
      weakConfidenceWarning: input.weakConfidenceWarning,
    }),
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

export function buildSymbolGraphControlsState(input: {
  graph?: GraphEnvelope;
  mode: SymbolGraphMode;
  confidenceFilter: SymbolGraphConfidenceFilter;
  labels: {
    showWeakerEdges: string;
    expandCallers: string;
    expandCallees: string;
    openImpact: string;
  };
}): {
  actions: SymbolGraphControlAction[];
} {
  const actions: SymbolGraphControlAction[] = [];
  const weakEdgeCount = input.graph?.summary.confidence["inferred-weak"] ?? 0;

  if (input.confidenceFilter !== "all" && weakEdgeCount > 0) {
    actions.push({
      id: "show-weaker-edges",
      label: input.labels.showWeakerEdges,
    });
  }

  if (hasTruncation(input.graph?.summary)) {
    actions.push({
      id: "expand-callers",
      label: input.labels.expandCallers,
    });
    actions.push({
      id: "expand-callees",
      label: input.labels.expandCallees,
    });
  }

  if (input.mode !== "impact") {
    actions.push({
      id: "open-impact",
      label: input.labels.openImpact,
    });
  }

  return {
    actions,
  };
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
  confidenceLabel?: string,
): ArchitectureGraphEdge {
  return {
    id,
    sourceId,
    targetId,
    confidenceLabel,
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

function buildExpansionPlaceholders(
  input: SymbolGraphData,
  summary?: GraphEnvelopeSummary,
): {
  nodes: ArchitectureGraphNode[];
  edges: ArchitectureGraphEdge[];
} {
  if (!hasTruncation(summary)) {
    return {
      nodes: [],
      edges: [],
    };
  }

  const edgeKind =
    input.mode === "reference"
      ? "depends"
      : input.mode === "impact"
        ? "impacts"
        : "flow";
  const nodes: ArchitectureGraphNode[] = [
    {
      id: "action:expand-callers",
      kind: "placeholder",
      label: input.labels?.expandCallers ?? "Expand callers",
      cluster: "dependencies",
      actionId: "expand-callers",
    },
    {
      id: "action:expand-callees",
      kind: "placeholder",
      label: input.labels?.expandCallees ?? "Expand callees",
      cluster: "impacts",
      actionId: "expand-callees",
    },
  ];

  return {
    nodes,
    edges: [
      {
        id: `action:expand-callers:${input.rootSymbolId}`,
        sourceId: "action:expand-callers",
        targetId: input.rootSymbolId,
        kind: edgeKind,
      },
      {
        id: `action:expand-callees:${input.rootSymbolId}`,
        sourceId: input.rootSymbolId,
        targetId: "action:expand-callees",
        kind: edgeKind,
      },
    ],
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

function hasTruncation(summary?: GraphEnvelopeSummary) {
  return Boolean(
    summary?.truncated?.nodeLimitReached ||
      summary?.truncated?.edgeLimitReached,
  );
}
