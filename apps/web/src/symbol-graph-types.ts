import type {
  GraphConfidenceLabel,
  GraphEnvelope,
  GraphItem,
} from "@graphtrace/shared";

export type SymbolGraphMode = "execution" | "impact" | "reference";
export type SymbolGraphConfidenceFilter = "strong" | "proven" | "all";
export type SymbolGraphActionId =
  | "show-weaker-edges"
  | "expand-callers"
  | "expand-callees"
  | "open-impact";

export interface SymbolGraphData {
  graph?: GraphEnvelope;
  mode: SymbolGraphMode;
  rootSymbolId: string;
  confidenceFilter: SymbolGraphConfidenceFilter;
  labels?: Partial<{
    expandCallers: string;
    expandCallees: string;
  }>;
}

export interface SymbolGraphInspectorSection {
  id: "callers" | "callees" | "routes" | "sinks";
  items: GraphItem[];
  rows: SymbolInspectorRow[];
  title: string;
  warning?: string;
}

export interface SymbolInspectorRow {
  item: GraphItem;
  confidenceLabel?: GraphConfidenceLabel;
  relationshipKind: "caller" | "callee" | "route" | "sink";
  evidenceSummary: string;
  evidenceLines: string[];
}

export interface SymbolGraphConfidenceOption {
  id: SymbolGraphConfidenceFilter;
  label: string;
  count: number;
}

export interface SymbolGraphControlAction {
  id: SymbolGraphActionId;
  label: string;
}
