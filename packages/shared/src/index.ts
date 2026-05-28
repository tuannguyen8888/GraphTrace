export const GRAPHTRACE_DIR = ".graphtrace";
export const GRAPHTRACE_CONFIG_PATH = `${GRAPHTRACE_DIR}/config.json`;
export const GRAPHTRACE_DB_PATH = `${GRAPHTRACE_DIR}/index.db`;

export const GRAPH_NODE_KINDS = [
  "file",
  "symbol",
  "route",
  "package",
  "query",
  "sink",
] as const;

export type GraphNodeKind = (typeof GRAPH_NODE_KINDS)[number];

export const GRAPH_EDGE_TYPES = [
  "imports",
  "exports",
  "calls",
  "references",
  "depends_on",
  "re_exports",
  "routes_to",
  "queries",
  "reads_from",
  "writes_to",
] as const;

export type GraphEdgeType = (typeof GRAPH_EDGE_TYPES)[number];
export type EdgeType = GraphEdgeType;

export const GRAPH_CONFIDENCE_LABELS = [
  "proven",
  "inferred-strong",
  "inferred-weak",
] as const;

export type GraphConfidenceLabel = (typeof GRAPH_CONFIDENCE_LABELS)[number];

export type SearchKind = "symbol" | "route" | "file" | "package";
export type DependencyDirection = "in" | "out" | "both";
export type UnitLanguage = "js-ts" | "php" | "unknown";
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

export interface SourceSpan {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface SymbolDescriptor {
  id: string;
  name: string;
  displayName: string;
  kind: string;
  language: "typescript" | "javascript" | "php" | "unknown";
  fileId: string;
  filePath: string;
  exported: boolean;
  ownerSymbolId?: string;
  ownerKind?: string;
  signatureText?: string;
  frameworkRole?: string;
  span?: SourceSpan;
}

export interface GraphEdgeProvenance {
  kind: string;
  source: string;
  evidence: string[];
  metadata?: Record<string, unknown>;
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
  symbol?: SymbolDescriptor;
}

export interface QueryResult<T> {
  items: T[];
  graph?: GraphEnvelope;
  coverage?: CoverageSummary;
}

export interface CoverageWarning {
  code: string;
  message: string;
  unitIds: string[];
}

export interface CoverageSummary {
  warnings: CoverageWarning[];
}

export interface GraphEdgeDescriptor {
  id: string;
  type: GraphEdgeType;
  sourceId: string;
  sourceKind: GraphNodeKind | string;
  targetId: string;
  targetKind: GraphNodeKind | string;
  confidence: number;
  confidenceLabel: GraphConfidenceLabel;
  provenance?: GraphEdgeProvenance;
  metadata?: Record<string, unknown>;
}

export interface GraphEnvelopeSummary {
  nodeCount: number;
  edgeCount: number;
  rootNodeIds: string[];
  confidence: Partial<Record<GraphConfidenceLabel, number>>;
  truncated?: {
    nodeLimitReached?: boolean;
    edgeLimitReached?: boolean;
    omittedNodeCount?: number;
    omittedEdgeCount?: number;
  };
}

export interface GraphEnvelope {
  nodes: GraphItem[];
  edges: GraphEdgeDescriptor[];
  summary: GraphEnvelopeSummary;
  coverage?: CoverageSummary;
}

export type SymbolLocator =
  | { symbolId: string }
  | { filePath: string; line: number; column: number }
  | { filePath: string; symbolName: string };

export function createGraphEnvelope(
  input: Partial<GraphEnvelope> = {},
): GraphEnvelope {
  const nodes = input.nodes ?? [];
  const edges = input.edges ?? [];
  const confidence = input.summary?.confidence ?? {};
  const rootNodeIds = input.summary?.rootNodeIds ?? [];

  return {
    nodes,
    edges,
    summary: {
      nodeCount: input.summary?.nodeCount ?? nodes.length,
      edgeCount: input.summary?.edgeCount ?? edges.length,
      rootNodeIds,
      confidence,
      truncated: input.summary?.truncated,
    },
    coverage: input.coverage,
  };
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
  repositories?: RepositorySummary[];
  selectedRepositoryId?: string;
  lastIndexRun: IndexRunInfo | null;
}

export interface RepositorySummary {
  id: string;
  rootPath: string;
  label: string;
  kind: "primary" | "nested";
  sourceUnitId: string;
}

export interface IndexWorkspaceOptions {
  workspaceRoot: string;
  full?: boolean;
  changedFiles?: string[];
  removedFiles?: string[];
  dbPath?: string;
  persistWorkspaceArtifacts?: boolean;
  configOverrides?: Partial<GraphTraceConfig>;
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
  return value.replaceAll("\\", "/");
}

export function relativePath(root: string, target: string): string {
  const from = normalizePathParts(root);
  const to = normalizePathParts(target);

  if (from.prefix.toLowerCase() !== to.prefix.toLowerCase()) {
    return toPosixPath(target);
  }

  let commonIndex = 0;
  while (
    commonIndex < from.segments.length &&
    commonIndex < to.segments.length &&
    from.segments[commonIndex] === to.segments[commonIndex]
  ) {
    commonIndex += 1;
  }

  const upwardSegments = new Array(
    Math.max(0, from.segments.length - commonIndex),
  ).fill("..");
  const downwardSegments = to.segments.slice(commonIndex);
  const relativeSegments = [...upwardSegments, ...downwardSegments];

  return relativeSegments.length > 0 ? relativeSegments.join("/") : ".";
}

export function deriveRepositories(
  units: DiscoveredUnit[],
): RepositorySummary[] {
  const rootUnit =
    units.find((unit) => unit.rootPath === ".") ??
    ({
      id: "unit:root",
      rootPath: ".",
      displayName: "Primary workspace",
    } as const);

  const nestedRepositoryCandidates = units
    .filter(
      (unit) =>
        unit.rootPath !== "." &&
        !isDependencyRepositoryRoot(unit.rootPath) &&
        (unit.kind === "project" ||
          unit.kind === "subproject" ||
          unit.kind === "repo" ||
          unit.kind === "app" ||
          unit.kind === "service"),
    )
    .sort((left, right) => right.rootPath.length - left.rootPath.length);
  const keptUnits: DiscoveredUnit[] = [];

  for (const unit of nestedRepositoryCandidates) {
    const shadowedByMoreSpecificUnit = keptUnits.some(
      (entry) =>
        entry.rootPath === unit.rootPath ||
        entry.rootPath.startsWith(`${unit.rootPath}/`),
    );

    if (!shadowedByMoreSpecificUnit) {
      keptUnits.push(unit);
    }
  }

  const labelCounts = new Map<string, number>();

  for (const unit of keptUnits) {
    labelCounts.set(
      unit.displayName,
      (labelCounts.get(unit.displayName) ?? 0) + 1,
    );
  }

  const nestedRepositories = keptUnits
    .map((unit) => ({
      id: unit.rootPath,
      rootPath: unit.rootPath,
      label:
        (labelCounts.get(unit.displayName) ?? 0) > 1
          ? `${unit.displayName} · ${unit.rootPath}`
          : unit.displayName,
      kind: "nested" as const,
      sourceUnitId: unit.id,
    }))
    .sort((left, right) => left.rootPath.localeCompare(right.rootPath));

  return [
    {
      id: ".",
      rootPath: ".",
      label: rootUnit.displayName,
      kind: "primary",
      sourceUnitId: rootUnit.id,
    },
    ...nestedRepositories,
  ];
}

export function resolveRepositoryForPath(
  path: string | undefined,
  repositories: RepositorySummary[],
): RepositorySummary | null {
  if (repositories.length === 0) {
    return null;
  }

  const primaryRepository =
    repositories.find((entry) => entry.kind === "primary") ?? repositories[0];

  if (!path || path === ".") {
    return primaryRepository;
  }

  const nestedMatch = repositories
    .filter((entry) => entry.kind === "nested")
    .sort((left, right) => right.rootPath.length - left.rootPath.length)
    .find(
      (entry) =>
        path === entry.rootPath || path.startsWith(`${entry.rootPath}/`),
    );

  return nestedMatch ?? primaryRepository;
}

export function pathBelongsToRepository(
  path: string | undefined,
  repositoryId: string,
  repositories: RepositorySummary[],
): boolean {
  return resolveRepositoryForPath(path, repositories)?.id === repositoryId;
}

function isDependencyRepositoryRoot(rootPath: string): boolean {
  return (
    rootPath === "vendor" ||
    rootPath.startsWith("vendor/") ||
    rootPath.includes("/vendor/")
  );
}

function normalizePathParts(value: string) {
  const normalized = toPosixPath(value);
  const driveMatch = normalized.match(/^[A-Za-z]:/);
  const prefix = driveMatch?.[0] ?? (normalized.startsWith("/") ? "/" : "");
  const remainder = prefix ? normalized.slice(prefix.length) : normalized;
  const segments: string[] = [];

  for (const part of remainder.split("/")) {
    if (!part || part === ".") {
      continue;
    }

    if (part === "..") {
      segments.pop();
      continue;
    }

    segments.push(part);
  }

  return {
    prefix,
    segments,
  };
}
