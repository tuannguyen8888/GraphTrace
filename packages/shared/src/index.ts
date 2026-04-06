import { relative, sep } from "node:path";

export const GRAPHTRACE_DIR = ".graphtrace";
export const GRAPHTRACE_CONFIG_PATH = `${GRAPHTRACE_DIR}/config.json`;
export const GRAPHTRACE_DB_PATH = `${GRAPHTRACE_DIR}/index.db`;

export type EdgeType =
  | "imports"
  | "exports"
  | "calls"
  | "depends_on"
  | "re_exports"
  | "routes_to"
  | "queries"
  | "reads_from"
  | "writes_to";

export type SearchKind = "symbol" | "route" | "file" | "package";
export type DependencyDirection = "in" | "out" | "both";
export type UnitLanguage = "js-ts" | "unknown";
export type UnitKind =
  | "project"
  | "repo"
  | "app"
  | "service"
  | "package"
  | "subproject";
export type IndexingMode = "full" | "shallow" | "skipped";

export interface PluginProvenance {
  pluginId: string;
  pluginVersion: string;
  confidence: number;
}

export interface PluginMatch extends PluginProvenance {
  kind:
    | "workspace-detector"
    | "language-plugin"
    | "framework-plugin"
    | "linker";
  matched: boolean;
  reasons: string[];
}

export interface DiscoveredUnit {
  id: string;
  rootPath: string;
  displayName: string;
  kind: UnitKind;
  language: UnitLanguage;
  tooling: string;
  indexingMode: IndexingMode;
  confidence: number;
  signals: string[];
  sourceRoots: string[];
  parentUnitId?: string;
  pluginMatches: PluginMatch[];
}

export interface SearchItem {
  id: string;
  kind: string;
  label: string;
  path?: string;
  score: number;
}

export interface RouteItem {
  id: string;
  method: string;
  path: string;
  handlerName: string;
  handlerSymbolId: string;
  filePath: string;
  framework: string;
  unitId: string;
  confidence: number;
  provenance?: PluginProvenance;
}

export interface GraphItem {
  id: string;
  kind: string;
  label: string;
  path?: string;
  confidence?: number;
}

export interface QueryResult<T> {
  items: T[];
}

export interface GraphTraceConfig {
  workspaceGlobs: string[];
  exclude: string[];
  frameworks: string[];
  detection: {
    mode: "auto";
    maxDepth: number;
    minUnitConfidence: number;
  };
  plugins: {
    disable: string[];
    prefer: string[];
  };
  search: {
    embeddingsProvider: "none" | "ollama" | "openai";
    embeddingsModel: string | null;
  };
  web: {
    port: number;
  };
}

export interface IndexSummary {
  packageCount: number;
  fileCount: number;
  symbolCount: number;
  routeCount: number;
  queryEdgeCount: number;
}

export interface IndexRunInfo {
  id: number;
  mode: "full" | "incremental";
  startedAt: string;
  completedAt: string | null;
  summary: IndexSummary | null;
}

export interface GraphTraceStatus {
  workspaceRoot: string;
  dbPath: string;
  counts: IndexSummary;
  units: DiscoveredUnit[];
  lastIndexRun: IndexRunInfo | null;
}

export interface IndexWorkspaceOptions {
  workspaceRoot: string;
  full?: boolean;
  changedFiles?: string[];
  removedFiles?: string[];
}

export interface IndexWorkspaceResult {
  dbPath: string;
  summary: IndexSummary;
  units: DiscoveredUnit[];
  explain: {
    units: DiscoveredUnit[];
  };
}

export interface CliRunOptions {
  cwd?: string;
  emitStdout?: (line: string) => void;
  emitStderr?: (line: string) => void;
}

export interface CliRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  keepAlive?: boolean;
  cleanup?: () => void | Promise<void>;
}

export function toPosixPath(value: string): string {
  return value.split(sep).join("/");
}

export function relativePath(root: string, target: string): string {
  return toPosixPath(relative(root, target));
}
