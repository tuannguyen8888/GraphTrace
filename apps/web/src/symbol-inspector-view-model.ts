import type {
  GraphEdgeDescriptor,
  GraphEnvelope,
  GraphItem,
} from "@graphtrace/shared";

import type {
  SymbolGraphInspectorSection,
  SymbolInspectorRow,
} from "./symbol-graph-types";

export function collectSymbolInspectorSection(input: {
  graph: GraphEnvelope;
  predicate: (edge: GraphEnvelope["edges"][number]) => boolean;
  getNodeId: (edge: GraphEnvelope["edges"][number]) => string;
  relationshipKind: SymbolInspectorRow["relationshipKind"];
}): {
  items: GraphItem[];
  rows: SymbolInspectorRow[];
  hasWeakEdges: boolean;
} {
  const nodeById = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const seenIds = new Set<string>();
  const items: GraphItem[] = [];
  const rows: SymbolInspectorRow[] = [];
  let hasWeakEdges = false;

  for (const edge of input.graph.edges) {
    if (!input.predicate(edge)) {
      continue;
    }

    if (edge.confidenceLabel === "inferred-weak") {
      hasWeakEdges = true;
    }

    const node = nodeById.get(input.getNodeId(edge));
    if (!node || seenIds.has(node.id)) {
      continue;
    }

    seenIds.add(node.id);
    items.push(node);
    rows.push(buildInspectorRow(node, edge, input.relationshipKind));
  }

  return {
    items,
    rows,
    hasWeakEdges,
  };
}

export function buildSymbolInspectorSection(input: {
  id: SymbolGraphInspectorSection["id"];
  title: string;
  weakConfidenceWarning?: string;
  section: ReturnType<typeof collectSymbolInspectorSection>;
}): SymbolGraphInspectorSection {
  return {
    id: input.id,
    title: input.title,
    items: input.section.items,
    rows: input.section.rows,
    warning: input.section.hasWeakEdges
      ? input.weakConfidenceWarning
      : undefined,
  };
}

export function emptyInspectorSectionResult() {
  return {
    items: [],
    rows: [],
    hasWeakEdges: false,
  };
}

function buildInspectorRow(
  item: GraphItem,
  edge: GraphEdgeDescriptor,
  relationshipKind: SymbolInspectorRow["relationshipKind"],
): SymbolInspectorRow {
  return {
    item,
    confidenceLabel: edge.confidenceLabel,
    relationshipKind,
    evidenceSummary: buildEvidenceSummary(edge),
    evidenceLines: edge.provenance?.evidence ?? [],
  };
}

function buildEvidenceSummary(edge: GraphEdgeDescriptor) {
  if (edge.provenance?.kind && edge.provenance?.source) {
    return `${edge.provenance.kind} via ${edge.provenance.source}`;
  }

  if (edge.provenance?.kind) {
    return edge.provenance.kind;
  }

  return edge.confidenceLabel ?? "unclassified";
}
