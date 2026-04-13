import type { RouteSummary, SearchResult } from "./view-model";

export type WorkspaceInspectorState =
  | { type: "idle" }
  | { type: "route"; route: RouteSummary }
  | { type: "search"; item: SearchResult };

export interface WorkspacePresentationState {
  mode: "overview" | "focused-route" | "focused-symbol" | "focused-file";
  emphasizeGraph: boolean;
  emphasizeInspector: boolean;
  showStarterGuide: boolean;
  supportingPanelsVariant: "full" | "secondary";
  mobileSectionOrder: Array<"graph" | "inspector" | "supporting">;
  graphCanvasDensity: "default" | "expanded";
}

export function hasConcreteSelection(inspector: WorkspaceInspectorState) {
  return inspector.type !== "idle";
}

export function buildWorkspacePresentationState(input: {
  inspector: WorkspaceInspectorState;
}): WorkspacePresentationState {
  if (!hasConcreteSelection(input.inspector)) {
    return {
      mode: "overview",
      emphasizeGraph: false,
      emphasizeInspector: false,
      showStarterGuide: true,
      supportingPanelsVariant: "full",
      mobileSectionOrder: ["graph", "supporting", "inspector"],
      graphCanvasDensity: "default",
    };
  }

  if (input.inspector.type === "route") {
    return buildFocusedState("focused-route");
  }

  if (input.inspector.item.kind === "symbol") {
    return buildFocusedState("focused-symbol");
  }

  return buildFocusedState("focused-file");
}

function buildFocusedState(
  mode: WorkspacePresentationState["mode"],
): WorkspacePresentationState {
  return {
    mode,
    emphasizeGraph: true,
    emphasizeInspector: true,
    showStarterGuide: false,
    supportingPanelsVariant: "secondary",
    mobileSectionOrder: ["graph", "inspector", "supporting"],
    graphCanvasDensity: "expanded",
  };
}
