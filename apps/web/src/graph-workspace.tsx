import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

import type {
  ArchitectureGraphEdge,
  ArchitectureGraphModel,
  ArchitectureGraphNode,
  PositionedArchitectureGraphNode,
} from "./architecture-graph";
import { searchArchitectureGraphNodes } from "./architecture-graph";

import "@xyflow/react/dist/style.css";

interface GraphWorkspaceProps {
  graph: ArchitectureGraphModel;
  nodes: PositionedArchitectureGraphNode[];
  onSelectNode: (node: ArchitectureGraphNode) => void;
}

interface GraphFlowNodeData extends Record<string, unknown> {
  item: ArchitectureGraphNode;
  isFocus: boolean;
  isHighlighted: boolean;
}

type GraphFlowNode = Node<GraphFlowNodeData, "graphNode">;
type GraphFlowEdge = Edge;
const nodeTypes = {
  graphNode: GraphCanvasNode,
};

export function GraphWorkspace(props: GraphWorkspaceProps) {
  return (
    <ReactFlowProvider>
      <GraphWorkspaceInner {...props} />
    </ReactFlowProvider>
  );
}

function GraphWorkspaceInner(props: GraphWorkspaceProps) {
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<GraphFlowNode>(
    [],
  );
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<GraphFlowEdge>(
    [],
  );
  const [graphSearchText, setGraphSearchText] = useState("");
  const [highlightedNodeId, setHighlightedNodeId] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance<GraphFlowNode, GraphFlowEdge> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setFlowNodes(createFlowNodes(props.nodes, props.graph.focusId, ""));
    setFlowEdges(createFlowEdges(props.graph.edges));
    setGraphSearchText("");
    setHighlightedNodeId("");
  }, [props.graph.edges, props.graph.focusId, props.nodes, setFlowEdges, setFlowNodes]);

  useEffect(() => {
    setFlowNodes((currentNodes) =>
      currentNodes.map((node) => {
        const item = node.data.item;
        const isFocus = item.id === props.graph.focusId;
        const isHighlighted = item.id === highlightedNodeId;

        return {
          ...node,
          data: {
            item,
            isFocus,
            isHighlighted,
          },
          style: buildFlowNodeStyle(isFocus, isHighlighted, item.kind),
        };
      }),
    );
  }, [highlightedNodeId, props.graph.focusId, setFlowNodes]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const searchMatches = searchArchitectureGraphNodes(
    props.graph,
    graphSearchText,
  ).slice(0, 8);

  if (props.graph.nodes.length === 0) {
    return (
      <div className="empty-state graph-empty">
        Chọn route, file, hoặc package trong inspector để xem bounded
        architecture graph quanh selection đó.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={isFullscreen ? "graph-workspace is-fullscreen" : "graph-workspace"}
    >
      <div className="graph-workspace-toolbar">
        <label className="field grow">
          <span>Search in graph</span>
          <input
            value={graphSearchText}
            onChange={(event) => setGraphSearchText(event.target.value)}
            placeholder="route id, package, file path, query hint..."
          />
        </label>

        <div className="graph-toolbar-actions">
          <button
            className="graph-filter"
            type="button"
            onClick={() => {
              reactFlowInstance?.fitView({
                duration: 280,
                padding: 0.18,
              });
            }}
          >
            Reset view
          </button>
          <button
            className="graph-filter"
            type="button"
            onClick={async () => {
              if (!containerRef.current) {
                return;
              }

              if (document.fullscreenElement === containerRef.current) {
                await document.exitFullscreen();
                return;
              }

              await containerRef.current.requestFullscreen();
            }}
          >
            {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          </button>
        </div>
      </div>

      {graphSearchText.trim() ? (
        <div className="graph-search-results">
          {searchMatches.length === 0 ? (
            <div className="graph-search-empty">
              Không có node nào trên canvas khớp với "{graphSearchText}".
            </div>
          ) : (
            searchMatches.map((match) => (
              <button
                key={match.id}
                className={
                  highlightedNodeId === match.id
                    ? "graph-search-hit is-active"
                    : "graph-search-hit"
                }
                type="button"
                onClick={() => {
                  setHighlightedNodeId(match.id);
                  focusGraphNode(match.id, flowNodes, reactFlowInstance);
                  props.onSelectNode(match);
                }}
              >
                <span className="list-chip">{match.kind}</span>
                <span className="list-title">{match.label}</span>
                <span className="list-subtle">
                  {match.path ?? `${match.cluster} node`}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}

      <div className="graph-canvas graph-react-flow">
        <ReactFlow<GraphFlowNode, GraphFlowEdge>
          nodes={flowNodes}
          edges={flowEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={setReactFlowInstance}
          fitView
          fitViewOptions={{
            padding: 0.18,
          }}
          minZoom={0.45}
          maxZoom={1.8}
          defaultEdgeOptions={{
            type: "smoothstep",
          }}
          nodeTypes={nodeTypes}
          nodesDraggable
          onNodeClick={(_, node) => {
            setHighlightedNodeId(node.id);
            props.onSelectNode(node.data.item);
          }}
        >
          <MiniMap
            pannable
            zoomable
            maskColor="rgba(7, 14, 24, 0.6)"
            nodeColor={(node) => {
              const graphNode = props.graph.nodes.find(
                (entry) => entry.id === node.id,
              );
              return node.id === props.graph.focusId
                ? "#f6b449"
                : graphNode?.kind === "package"
                  ? "#82d9a0"
                  : graphNode?.kind === "route"
                    ? "#63bbff"
                    : "#b2bdd1";
            }}
          />
          <Controls showInteractive />
          <Background color="rgba(159, 176, 200, 0.18)" gap={24} />
        </ReactFlow>
      </div>
    </div>
  );
}

function createFlowNodes(
  nodes: PositionedArchitectureGraphNode[],
  focusId: string,
  highlightedNodeId: string,
): GraphFlowNode[] {
  return nodes.map((node) => {
    const isFocus = node.id === focusId;
    const isHighlighted = node.id === highlightedNodeId;
    const size = graphNodeDimensions(isFocus, node.kind);

    return {
      id: node.id,
      type: "graphNode",
      position: {
        x: node.x - size.width / 2,
        y: node.y - size.height / 2,
      },
      draggable: true,
      selectable: true,
      data: {
        item: node,
        isFocus,
        isHighlighted,
      },
      style: buildFlowNodeStyle(isFocus, isHighlighted, node.kind),
      width: size.width,
      height: size.height,
    };
  });
}

function GraphCanvasNode(props: NodeProps<GraphFlowNode>) {
  return (
    <div className="graph-node-card">
      <Handle type="target" position={Position.Left} className="graph-handle" />
      <span className="graph-node-kind">{props.data.item.kind}</span>
      <span className="graph-node-label">
        {truncateGraphLabel(props.data.item.label, props.data.isFocus ? 40 : 32)}
      </span>
      {props.data.item.path ? (
        <span className="graph-node-path">
          {truncateGraphLabel(props.data.item.path, props.data.isFocus ? 42 : 34)}
        </span>
      ) : null}
      <Handle type="source" position={Position.Right} className="graph-handle" />
    </div>
  );
}

function createFlowEdges(edges: ArchitectureGraphEdge[]): GraphFlowEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceId,
    target: edge.targetId,
    animated: edge.kind === "flow",
    style: buildFlowEdgeStyle(edge.kind),
  }));
}

function buildFlowNodeStyle(
  isFocus: boolean,
  isHighlighted: boolean,
  kind: string,
) {
  const accentColor =
    kind === "route"
      ? "rgba(99, 187, 255, 0.44)"
      : kind === "package"
        ? "rgba(130, 217, 160, 0.4)"
        : kind === "query"
          ? "rgba(255, 129, 102, 0.36)"
          : "rgba(246, 180, 73, 0.32)";

  return {
    padding: 0,
    width: isFocus ? 280 : kind === "package" ? 248 : 232,
    minHeight: isFocus ? 112 : kind === "query" ? 94 : 88,
    borderRadius: 24,
    border: isHighlighted
      ? "1.6px solid rgba(255, 255, 255, 0.82)"
      : isFocus
        ? "1.6px solid rgba(246, 180, 73, 0.46)"
        : "1.2px solid rgba(255, 255, 255, 0.08)",
    background: `linear-gradient(180deg, ${accentColor}, transparent 55%), rgba(9, 19, 34, 0.96)`,
    color: "#edf2f7",
    boxShadow: isHighlighted
      ? "0 0 0 2px rgba(99, 187, 255, 0.24), 0 24px 48px rgba(3, 8, 18, 0.44)"
      : "0 18px 40px rgba(3, 8, 18, 0.34)",
  };
}

function buildFlowEdgeStyle(kind: ArchitectureGraphEdge["kind"]) {
  switch (kind) {
    case "flow":
      return { stroke: "rgba(99, 187, 255, 0.86)", strokeWidth: 2.6 };
    case "depends":
      return { stroke: "rgba(246, 180, 73, 0.82)", strokeWidth: 2.3 };
    case "impacts":
      return { stroke: "rgba(255, 129, 102, 0.84)", strokeWidth: 2.3 };
    case "contains":
      return {
        stroke: "rgba(151, 205, 142, 0.8)",
        strokeWidth: 1.9,
        strokeDasharray: "7 6",
      };
  }
}

function graphNodeDimensions(isFocus: boolean, kind: string) {
  if (isFocus) {
    return { width: 280, height: 112 };
  }

  if (kind === "package") {
    return { width: 248, height: 96 };
  }

  if (kind === "query") {
    return { width: 256, height: 94 };
  }

  return { width: 232, height: 88 };
}

function focusGraphNode(
  nodeId: string,
  nodes: GraphFlowNode[],
  reactFlowInstance: ReactFlowInstance<GraphFlowNode, GraphFlowEdge> | null,
) {
  if (!reactFlowInstance) {
    return;
  }

  const node = nodes.find((entry) => entry.id === nodeId);
  if (!node) {
    return;
  }

  const width = typeof node.width === "number" ? node.width : 232;
  const height = typeof node.height === "number" ? node.height : 88;
  reactFlowInstance.setCenter(
    node.position.x + width / 2,
    node.position.y + height / 2,
    {
      zoom: 1.15,
      duration: 280,
    },
  );
}

function truncateGraphLabel(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}
