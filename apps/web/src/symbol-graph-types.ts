import type { GraphEnvelope, GraphItem } from "@graphtrace/shared";

export type SymbolGraphMode = "execution" | "impact" | "reference";
export type SymbolGraphConfidenceFilter = "strong" | "proven" | "all";

export interface SymbolGraphData {
  graph?: GraphEnvelope;
  mode: SymbolGraphMode;
  rootSymbolId: string;
  confidenceFilter: SymbolGraphConfidenceFilter;
}

export interface SymbolGraphInspectorSection {
  id: "callers" | "callees" | "routes" | "sinks";
  items: GraphItem[];
  title: string;
}

export interface SymbolGraphConfidenceOption {
  id: SymbolGraphConfidenceFilter;
  label: string;
  count: number;
}
