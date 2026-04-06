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
  confidence: number;
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

export interface IndexWorkspaceOptions {
  workspaceRoot: string;
  full?: boolean;
}

export interface IndexWorkspaceResult {
  dbPath: string;
  summary: IndexSummary;
}

export interface CliRunOptions {
  cwd?: string;
}

export interface CliRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  keepAlive?: boolean;
}

export function toPosixPath(value: string): string {
  return value.split(sep).join("/");
}

export function relativePath(root: string, target: string): string {
  return toPosixPath(relative(root, target));
}
