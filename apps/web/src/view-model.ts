export interface IndexRunInfo {
  mode: string;
  completedAt: string | null;
}

export interface WorkspaceStatus {
  workspaceRoot: string;
  dbPath: string;
  counts: {
    packageCount: number;
    fileCount: number;
    symbolCount: number;
    routeCount: number;
    queryEdgeCount: number;
  };
  lastIndexRun: IndexRunInfo | null;
}

export interface RouteSummary {
  id: string;
  method: string;
  path: string;
  filePath: string;
  framework: string;
  confidence: number;
}

export interface PackageSummary {
  id: string;
  label: string;
  path?: string;
}

export interface SearchResult {
  id: string;
  kind: string;
  label: string;
  path?: string;
  score?: number;
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

export type ScopeMode = "primary" | "all" | "tests";
export type ItemScope = "primary" | "fixture" | "test";

export interface PackageListEntry extends PackageSummary {
  disambiguation: boolean;
  scope: ItemScope;
  secondaryLabel: string;
}

export interface RouteFilterOptions {
  scopeMode: ScopeMode;
  selectedPackageId: string;
}

export interface RouteInsights {
  files: GraphItem[];
  queryHints: GraphItem[];
  relatedPackages: PackageListEntry[];
}

export function classifyItemScope(path?: string): ItemScope {
  if (!path || path === ".") {
    return "primary";
  }

  if (path.startsWith("fixtures/")) {
    return "fixture";
  }

  if (/(^|\/)(__tests__|test|tests)(\/|$)/.test(path)) {
    return "test";
  }

  if (/\.(test|spec)\.[jt]sx?$/.test(path)) {
    return "test";
  }

  return "primary";
}

export function matchesScope(path: string | undefined, scopeMode: ScopeMode) {
  const itemScope = classifyItemScope(path);

  if (scopeMode === "all") {
    return true;
  }

  if (scopeMode === "tests") {
    return itemScope === "fixture" || itemScope === "test";
  }

  return itemScope !== "fixture";
}

export function buildPackageEntries(
  packages: PackageSummary[],
  scopeMode: ScopeMode,
): PackageListEntry[] {
  const filteredPackages = packages.filter((entry) =>
    matchesScope(entry.path, scopeMode),
  );
  const labelCounts = new Map<string, number>();

  for (const entry of filteredPackages) {
    labelCounts.set(entry.label, (labelCounts.get(entry.label) ?? 0) + 1);
  }

  return [...filteredPackages]
    .sort((left, right) =>
      compareByScopeAndLabel(left.path, right.path, left.label, right.label),
    )
    .map((entry) => ({
      ...entry,
      disambiguation: (labelCounts.get(entry.label) ?? 0) > 1,
      scope: classifyItemScope(entry.path),
      secondaryLabel: entry.path ?? "workspace root",
    }));
}

export function filterRoutesForDisplay(
  routes: RouteSummary[],
  packages: PackageSummary[],
  options: RouteFilterOptions,
) {
  const selectedPackage = packages.find(
    (entry) => entry.id === options.selectedPackageId,
  );

  return routes.filter((route) => {
    if (!matchesScope(route.filePath, options.scopeMode)) {
      return false;
    }

    if (!selectedPackage?.path) {
      return true;
    }

    return (
      route.filePath === selectedPackage.path ||
      route.filePath.startsWith(`${selectedPackage.path}/`)
    );
  });
}

export function filterSearchResultsForDisplay(
  results: SearchResult[],
  scopeMode: ScopeMode,
) {
  return results.filter((item) => matchesScope(item.path, scopeMode));
}

export function buildRouteInsights(
  items: GraphItem[],
  packages: PackageSummary[],
): RouteInsights {
  const files = items.filter((item) => item.kind === "file" && item.path);
  const queryHints = items.filter((item) => item.kind === "query");
  const relatedPackages = new Map<string, PackageListEntry>();

  for (const item of files) {
    const owningPackage = findOwningPackage(item.path, packages);
    if (!owningPackage) {
      continue;
    }

    relatedPackages.set(owningPackage.id, {
      ...owningPackage,
      disambiguation: false,
      scope: classifyItemScope(owningPackage.path),
      secondaryLabel: owningPackage.path ?? "workspace root",
    });
  }

  return {
    files,
    queryHints,
    relatedPackages: [...relatedPackages.values()].sort((left, right) =>
      compareByScopeAndLabel(left.path, right.path, left.label, right.label),
    ),
  };
}

export function findOwningPackage(
  path: string | undefined,
  packages: PackageSummary[],
) {
  if (!path) {
    return null;
  }

  return (
    [...packages]
      .filter(
        (entry) =>
          entry.path &&
          (path === entry.path || path.startsWith(`${entry.path}/`)),
      )
      .sort(
        (left, right) => (right.path?.length ?? 0) - (left.path?.length ?? 0),
      )[0] ?? null
  );
}

export function buildGraphTraceCommand(
  item: Pick<GraphItem, "id" | "kind" | "label" | "path">,
) {
  if (item.kind === "route") {
    return `graphtrace flow "${item.id}" --depth 6`;
  }

  if (item.path && looksLikeSourcePath(item.path)) {
    return `graphtrace deps "${item.path}" --direction both --depth 2`;
  }

  return `graphtrace search "${item.label}" --kind ${item.kind}`;
}

export function looksLikeSourcePath(path?: string) {
  return Boolean(path && /\.(ts|tsx|js|jsx)$/.test(path));
}

function compareByScopeAndLabel(
  leftPath: string | undefined,
  rightPath: string | undefined,
  leftLabel: string,
  rightLabel: string,
) {
  const leftScopeWeight = scopeWeight(classifyItemScope(leftPath));
  const rightScopeWeight = scopeWeight(classifyItemScope(rightPath));

  if (leftScopeWeight !== rightScopeWeight) {
    return leftScopeWeight - rightScopeWeight;
  }

  return leftLabel.localeCompare(rightLabel);
}

function scopeWeight(scope: ItemScope) {
  switch (scope) {
    case "primary":
      return 0;
    case "test":
      return 1;
    case "fixture":
      return 2;
  }
}
