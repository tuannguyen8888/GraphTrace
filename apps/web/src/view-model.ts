import type { DiscoveredUnit, RepositorySummary } from "@graphtrace/shared";
import { pathBelongsToRepository } from "@graphtrace/shared";

import { DEFAULT_LOCALE, getMessages, type Locale } from "./i18n";

export interface IndexRunInfo {
  mode: string;
  completedAt: string | null;
}

export interface WorkspaceStatus {
  workspaceRoot: string;
  dbPath: string;
  units: DiscoveredUnit[];
  repositories?: RepositorySummary[];
  selectedRepositoryId?: string;
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
  repositories?: RepositorySummary[];
  selectedRepositoryId?: string;
  scopeMode: ScopeMode;
  selectedPackageId: string;
}

export interface RouteInsights {
  files: GraphItem[];
  queryHints: GraphItem[];
  relatedPackages: PackageListEntry[];
}

export interface SearchQuickPick {
  id: string;
  kind: string;
  label: string;
  query: string;
  reason: string;
}

export interface SearchWorkbenchGuidance {
  emptyStateTitle: string;
  emptyStateBody: string;
  kindGuide: string;
  triageSteps: string[];
  quickPicks: SearchQuickPick[];
}

export interface SearchWorkbenchGuidanceOptions {
  locale: Locale;
  packages: PackageSummary[];
  routes: RouteSummary[];
  repositories?: RepositorySummary[];
  selectedRepositoryId?: string;
  scopeMode: ScopeMode;
  selectedPackageId: string;
  searchKind: string;
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

  return itemScope === "primary";
}

export function buildPackageEntries(
  packages: PackageSummary[],
  scopeMode: ScopeMode,
  repositories: RepositorySummary[] = [],
  selectedRepositoryId = ".",
  locale: Locale = DEFAULT_LOCALE,
): PackageListEntry[] {
  const messages = getMessages(locale);
  const filteredPackages = packages.filter((entry) =>
    matchesScope(entry.path, scopeMode),
  );
  const repositoryScopedPackages =
    repositories.length > 0
      ? filteredPackages.filter((entry) =>
          pathBelongsToRepository(
            entry.path,
            selectedRepositoryId,
            repositories,
          ),
        )
      : filteredPackages;
  const labelCounts = new Map<string, number>();

  for (const entry of repositoryScopedPackages) {
    labelCounts.set(entry.label, (labelCounts.get(entry.label) ?? 0) + 1);
  }

  return [...repositoryScopedPackages]
    .sort((left, right) =>
      compareByScopeAndLabel(left.path, right.path, left.label, right.label),
    )
    .map((entry) => ({
      ...entry,
      disambiguation: (labelCounts.get(entry.label) ?? 0) > 1,
      scope: classifyItemScope(entry.path),
      secondaryLabel: entry.path ?? messages.common.workspaceRoot,
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

    if (
      options.repositories?.length &&
      options.selectedRepositoryId &&
      !pathBelongsToRepository(
        route.filePath,
        options.selectedRepositoryId,
        options.repositories,
      )
    ) {
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
  repositories: RepositorySummary[] = [],
  selectedRepositoryId = ".",
) {
  return results.filter((item) => {
    if (!matchesScope(item.path, scopeMode)) {
      return false;
    }

    if (!repositories.length) {
      return true;
    }

    return pathBelongsToRepository(
      item.path,
      selectedRepositoryId,
      repositories,
    );
  });
}

export function buildRouteInsights(
  items: GraphItem[],
  packages: PackageSummary[],
  locale: Locale = DEFAULT_LOCALE,
): RouteInsights {
  const messages = getMessages(locale);
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
      secondaryLabel: owningPackage.path ?? messages.common.workspaceRoot,
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

export function buildSearchWorkbenchGuidance(
  options: SearchWorkbenchGuidanceOptions,
): SearchWorkbenchGuidance {
  const messages = getMessages(options.locale);
  const repositories = options.repositories ?? [];
  const selectedRepositoryId = options.selectedRepositoryId ?? ".";
  const visiblePackages = buildPackageEntries(
    options.packages,
    options.scopeMode,
    repositories,
    selectedRepositoryId,
    options.locale,
  );
  const visibleRoutes = filterRoutesForDisplay(
    options.routes,
    options.packages,
    {
      repositories,
      selectedRepositoryId,
      scopeMode: options.scopeMode,
      selectedPackageId: options.selectedPackageId,
    },
  );
  const selectedPackage =
    options.packages.find((entry) => entry.id === options.selectedPackageId) ??
    null;
  const anchorRoute = visibleRoutes[0] ?? null;
  const anchorPackage =
    selectedPackage ??
    (anchorRoute
      ? findOwningPackage(anchorRoute.filePath, options.packages)
      : (visiblePackages.find((entry) => entry.path && entry.path !== ".") ??
        visiblePackages[0] ??
        null));
  const anchorFilePath =
    anchorRoute?.filePath ??
    (selectedPackage?.path && selectedPackage.path !== "."
      ? selectedPackage.path
      : anchorPackage?.path && anchorPackage.path !== "."
        ? anchorPackage.path
        : undefined);
  const quickPicks: SearchQuickPick[] = [];

  if (anchorRoute) {
    quickPicks.push({
      id: `quick-route:${anchorRoute.id}`,
      kind: "route",
      label: messages.searchWorkbench.routeQuickPickLabel({
        routeId: anchorRoute.id,
      }),
      query: anchorRoute.id,
      reason: messages.searchWorkbench.routeQuickPickReason,
    });
  }

  if (anchorPackage) {
    quickPicks.push({
      id: `quick-package:${anchorPackage.id}`,
      kind: "package",
      label: messages.searchWorkbench.packageQuickPickLabel({
        packageLabel: anchorPackage.label,
      }),
      query: anchorPackage.label,
      reason: messages.searchWorkbench.packageQuickPickReason,
    });
  }

  if (anchorFilePath) {
    quickPicks.push({
      id: `quick-file:${anchorFilePath}`,
      kind: "file",
      label: messages.searchWorkbench.fileQuickPickLabel({
        filePath: anchorFilePath,
      }),
      query: anchorFilePath,
      reason: messages.searchWorkbench.fileQuickPickReason,
    });
  }

  const dedupedQuickPicks = quickPicks.filter(
    (item, index, items) =>
      items.findIndex(
        (candidate) =>
          candidate.kind === item.kind && candidate.query === item.query,
      ) === index,
  );
  const contextLabel =
    selectedPackage?.label ??
    anchorPackage?.label ??
    (selectedRepositoryId === "."
      ? messages.searchWorkbench.mainRepoLabel
      : selectedRepositoryId);

  return {
    emptyStateTitle: messages.searchWorkbench.startFromContext({
      contextLabel,
    }),
    emptyStateBody: messages.searchWorkbench.intro,
    kindGuide: describeSearchKind(options.searchKind, options.locale),
    triageSteps: [
      messages.searchWorkbench.step1({ contextLabel }),
      messages.searchWorkbench.step2,
      messages.searchWorkbench.step3,
    ],
    quickPicks: dedupedQuickPicks.slice(0, 3),
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

  const leftRootWeight = leftPath === "." ? 1 : 0;
  const rightRootWeight = rightPath === "." ? 1 : 0;

  if (leftRootWeight !== rightRootWeight) {
    return leftRootWeight - rightRootWeight;
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

function describeSearchKind(
  kind: string,
  locale: Locale = DEFAULT_LOCALE,
) {
  const messages = getMessages(locale);

  switch (kind) {
    case "route":
      return messages.searchWorkbench.searchKindGuide.route;
    case "file":
      return messages.searchWorkbench.searchKindGuide.file;
    case "package":
      return messages.searchWorkbench.searchKindGuide.package;
    default:
      return messages.searchWorkbench.searchKindGuide.symbol;
  }
}
