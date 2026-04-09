import dagre from "dagre";

import {
  type GraphItem,
  type PackageSummary,
  type RouteSummary,
  type ScopeMode,
  type SearchResult,
  filterRoutesForDisplay,
  findOwningPackage,
  matchesScope,
} from "./view-model";

export interface GraphEdgeFilters {
  flow: boolean;
  depends: boolean;
  impacts: boolean;
  contains: boolean;
}

export interface ArchitectureGraphNode {
  id: string;
  kind: string;
  label: string;
  path?: string;
  actionId?: string;
  cluster:
    | "focus"
    | "packages"
    | "dependencies"
    | "impacts"
    | "routes"
    | "files"
    | "queries";
}

export interface ArchitectureGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  kind: keyof GraphEdgeFilters;
  confidenceLabel?: string;
}

export interface PositionedArchitectureGraphNode extends ArchitectureGraphNode {
  x: number;
  y: number;
}

export interface ArchitectureGraphModel {
  edges: ArchitectureGraphEdge[];
  focusId: string;
  nodes: ArchitectureGraphNode[];
}

export interface ArchitectureGraphSearchMatch extends ArchitectureGraphNode {
  score: number;
}

export interface BuildArchitectureGraphOptions {
  dependencyItems: GraphItem[];
  edgeFilters: GraphEdgeFilters;
  impactItems: GraphItem[];
  inspector:
    | { type: "idle" }
    | { type: "route"; route: RouteSummary }
    | { type: "search"; item: SearchResult };
  packages: PackageSummary[];
  routeFlow: GraphItem[];
  routes: RouteSummary[];
  scopeMode: ScopeMode;
  selectedPackageId: string;
}

export function buildArchitectureGraph(
  options: BuildArchitectureGraphOptions,
): ArchitectureGraphModel {
  const nodes = new Map<string, ArchitectureGraphNode>();
  const edges = new Map<string, ArchitectureGraphEdge>();

  const addNode = (node: ArchitectureGraphNode) => {
    nodes.set(node.id, node);
  };

  const addEdge = (edge: ArchitectureGraphEdge) => {
    if (!options.edgeFilters[edge.kind]) {
      return;
    }
    edges.set(edge.id, edge);
  };

  if (options.inspector.type === "idle") {
    return {
      focusId: "",
      nodes: [],
      edges: [],
    };
  }

  if (options.inspector.type === "route") {
    const focusRoute = options.inspector.route;
    addNode({
      id: focusRoute.id,
      kind: "route",
      label: focusRoute.id,
      path: focusRoute.filePath,
      cluster: "focus",
    });

    const visibleFlow = options.routeFlow
      .filter((item) => matchesScope(item.path, options.scopeMode))
      .slice(0, 12);

    for (const item of visibleFlow) {
      if (item.id === focusRoute.id) {
        continue;
      }

      const cluster =
        item.kind === "query"
          ? "queries"
          : item.kind === "file"
            ? "files"
            : item.kind === "package"
              ? "packages"
              : "routes";
      addNode({
        ...item,
        cluster,
      });
      addEdge({
        id: `${focusRoute.id}:${item.id}:flow`,
        sourceId: focusRoute.id,
        targetId: item.id,
        kind: "flow",
      });

      if (item.kind === "file") {
        const owningPackage = findOwningPackage(item.path, options.packages);
        if (!owningPackage) {
          continue;
        }

        addNode({
          id: owningPackage.id,
          kind: "package",
          label: owningPackage.label,
          path: owningPackage.path,
          cluster: "packages",
        });
        addEdge({
          id: `${owningPackage.id}:${item.id}:contains`,
          sourceId: owningPackage.id,
          targetId: item.id,
          kind: "contains",
        });
      }
    }

    return {
      focusId: focusRoute.id,
      nodes: [...nodes.values()],
      edges: [...edges.values()],
    };
  }

  const selected = options.inspector.item;

  if (selected.kind === "package") {
    const selectedPackage =
      options.packages.find((entry) => entry.id === selected.id) ??
      findOwningPackage(selected.path, options.packages);

    if (!selectedPackage) {
      return {
        focusId: selected.id,
        nodes: [],
        edges: [],
      };
    }

    addNode({
      id: selectedPackage.id,
      kind: "package",
      label: selectedPackage.label,
      path: selectedPackage.path,
      cluster: "focus",
    });

    const visibleRoutes = filterRoutesForDisplay(
      options.routes,
      options.packages,
      {
        scopeMode: options.scopeMode,
        selectedPackageId: selectedPackage.id,
      },
    ).slice(0, 8);

    for (const route of visibleRoutes) {
      addNode({
        id: route.id,
        kind: "route",
        label: route.id,
        path: route.filePath,
        cluster: "routes",
      });
      addEdge({
        id: `${selectedPackage.id}:${route.id}:contains`,
        sourceId: selectedPackage.id,
        targetId: route.id,
        kind: "contains",
      });

      addNode({
        id: `file:${route.filePath}`,
        kind: "file",
        label: route.filePath,
        path: route.filePath,
        cluster: "files",
      });
      addEdge({
        id: `${selectedPackage.id}:file:${route.filePath}:contains`,
        sourceId: selectedPackage.id,
        targetId: `file:${route.filePath}`,
        kind: "contains",
      });
      addEdge({
        id: `file:${route.filePath}:${route.id}:flow`,
        sourceId: `file:${route.filePath}`,
        targetId: route.id,
        kind: "flow",
      });
    }

    return {
      focusId: selectedPackage.id,
      nodes: [...nodes.values()],
      edges: [...edges.values()],
    };
  }

  const focusId = selected.id;
  addNode({
    id: focusId,
    kind: selected.kind,
    label: selected.label,
    path: selected.path,
    cluster: "focus",
  });

  const owningPackage = findOwningPackage(selected.path, options.packages);
  if (owningPackage) {
    addNode({
      id: owningPackage.id,
      kind: "package",
      label: owningPackage.label,
      path: owningPackage.path,
      cluster: "packages",
    });
    addEdge({
      id: `${owningPackage.id}:${focusId}:contains`,
      sourceId: owningPackage.id,
      targetId: focusId,
      kind: "contains",
    });
  }

  for (const item of options.dependencyItems
    .filter((entry) => matchesScope(entry.path, options.scopeMode))
    .slice(0, 10)) {
    addNode({
      ...item,
      cluster: "dependencies",
    });
    addEdge({
      id: `${focusId}:${item.id}:depends`,
      sourceId: focusId,
      targetId: item.id,
      kind: "depends",
    });
  }

  for (const item of options.impactItems
    .filter((entry) => matchesScope(entry.path, options.scopeMode))
    .slice(0, 10)) {
    addNode({
      ...item,
      cluster: item.kind === "route" ? "routes" : "impacts",
    });
    addEdge({
      id: `${focusId}:${item.id}:impacts`,
      sourceId: focusId,
      targetId: item.id,
      kind: "impacts",
    });
  }

  return {
    focusId,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  };
}

export function layoutArchitectureGraph(
  graph: ArchitectureGraphModel,
): PositionedArchitectureGraphNode[] {
  if (graph.nodes.length === 0) {
    return [];
  }

  const layoutGraph = new dagre.graphlib.Graph();
  layoutGraph.setGraph({
    rankdir: "LR",
    nodesep: 54,
    ranksep: 112,
    marginx: 32,
    marginy: 32,
  });
  layoutGraph.setDefaultEdgeLabel(() => ({}));

  for (const node of graph.nodes) {
    const size = graphNodeSize(node, graph.focusId);
    layoutGraph.setNode(node.id, size);
  }

  for (const edge of graph.edges) {
    layoutGraph.setEdge(edge.sourceId, edge.targetId, {
      weight: edge.kind === "flow" ? 3 : 1,
      minlen: edge.kind === "contains" ? 1 : 2,
    });
  }

  dagre.layout(layoutGraph);

  return graph.nodes.map((node) => {
    const positionedNode = layoutGraph.node(node.id);
    const size = graphNodeSize(node, graph.focusId);

    return {
      ...node,
      x: positionedNode?.x ?? size.width / 2,
      y: positionedNode?.y ?? size.height / 2,
    };
  });
}

export function searchArchitectureGraphNodes(
  graph: ArchitectureGraphModel,
  query: string,
): ArchitectureGraphSearchMatch[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  return graph.nodes
    .map((node) => ({
      ...node,
      score: scoreGraphNode(node, normalizedQuery, graph.focusId),
    }))
    .filter((node) => node.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.id === graph.focusId || right.id === graph.focusId) {
        return left.id === graph.focusId ? -1 : 1;
      }

      return left.label.localeCompare(right.label);
    });
}

function graphNodeSize(node: ArchitectureGraphNode, focusId: string) {
  if (node.id === focusId) {
    return { width: 280, height: 112 };
  }

  if (node.kind === "package") {
    return { width: 248, height: 96 };
  }

  if (node.kind === "query") {
    return { width: 256, height: 94 };
  }

  return { width: 232, height: 88 };
}

function scoreGraphNode(
  node: ArchitectureGraphNode,
  normalizedQuery: string,
  focusId: string,
) {
  const haystacks = [
    node.label.toLowerCase(),
    node.path?.toLowerCase() ?? "",
    node.kind.toLowerCase(),
    node.id.toLowerCase(),
  ];

  let score = 0;

  for (const haystack of haystacks) {
    if (!haystack) {
      continue;
    }

    if (haystack === normalizedQuery) {
      score += 14;
      continue;
    }

    if (haystack.startsWith(normalizedQuery)) {
      score += 9;
      continue;
    }

    if (haystack.includes(normalizedQuery)) {
      score += 6;
    }
  }

  if (node.id === focusId && score > 0) {
    score += 4;
  }

  return score;
}
