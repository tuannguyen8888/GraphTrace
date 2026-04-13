import {
  type FormEvent,
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from "react";

import type { RepositorySummary } from "@graphtrace/shared";
import { pathBelongsToRepository } from "@graphtrace/shared";

import {
  addWorkspace,
  getFileDependencies,
  getFileImpact,
  getRouteFlow,
  getWorkspacePackages,
  getWorkspaceRepositories,
  getWorkspaceRoutes,
  getWorkspaceStatus,
  getWorkspaceSymbolExecution,
  getWorkspaceSymbolImpact,
  getWorkspaceSymbolNeighbors,
  getWorkspaces,
  searchWorkspace,
} from "./api-client";
import {
  type GraphEdgeFilters,
  buildArchitectureGraph,
  layoutArchitectureGraph,
} from "./architecture-graph";
import {
  type WorkspaceHomeSummary,
  buildWorkspaceCards,
} from "./home-view-model";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  type Locale,
  formatLocaleDateTime,
  getMessages,
  resolveLocale,
} from "./i18n";
import { buildRouteHref, parseRouteState } from "./route-state";
import type {
  SymbolGraphActionId,
  SymbolGraphConfidenceFilter,
  SymbolGraphMode,
} from "./symbol-graph-types";
import {
  buildSymbolGraphModel,
  buildSymbolInspectorSections,
} from "./symbol-graph-view-model";
import {
  type GraphItem,
  type PackageListEntry,
  type PackageSummary,
  type QueryResult,
  type RouteSummary,
  type ScopeMode,
  type SearchResult,
  type WorkspaceStarterAction,
  type WorkspaceStatus,
  buildGraphTraceCommand,
  buildPackageEntries,
  buildRouteInsights,
  buildSearchWorkbenchGuidance,
  buildWorkspaceStarterGuide,
  filterRoutesForDisplay,
  filterSearchResultsForDisplay,
  findOwningPackage,
  looksLikeSourcePath,
  matchesScope,
} from "./view-model";
import {
  type WorkspaceInspectorState,
  buildWorkspacePresentationState,
} from "./workspace-focus-view-model";
import { WorkspaceHome } from "./workspace-home";
import { WorkspaceScreen } from "./workspace-screen";

const DEFAULT_SYMBOL_GRAPH_LIMITS = {
  maxNodes: 18,
  maxEdges: 24,
};

export function App() {
  const [locale, setLocale] = useState<Locale>(() => readLocaleFromLocation());
  const [workspaces, setWorkspaces] = useState<WorkspaceHomeSummary[]>([]);
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [repositories, setRepositories] = useState<RepositorySummary[]>([]);
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(() =>
    readWorkspaceFromLocation(),
  );
  const [selectedRepositoryId, setSelectedRepositoryId] = useState(() =>
    readRepositoryFromLocation(),
  );
  const [scopeMode, setScopeMode] = useState<ScopeMode>(() =>
    readScopeFromLocation(),
  );
  const [selectedPackageId, setSelectedPackageId] = useState(() =>
    readPackageFromLocation(),
  );
  const [searchText, setSearchText] = useState(() =>
    readSearchTextFromLocation(),
  );
  const [searchKind, setSearchKind] = useState(() =>
    readSearchKindFromLocation(),
  );
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [inspector, setInspector] = useState<WorkspaceInspectorState>({
    type: "idle",
  });
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [actionFeedback, setActionFeedback] = useState("");
  const [edgeFilters, setEdgeFilters] = useState<GraphEdgeFilters>({
    flow: true,
    depends: true,
    impacts: true,
    contains: true,
  });
  const [routeFlow, setRouteFlow] = useState<GraphItem[]>([]);
  const [dependencyItems, setDependencyItems] = useState<GraphItem[]>([]);
  const [impactItems, setImpactItems] = useState<GraphItem[]>([]);
  const [symbolGraphMode, setSymbolGraphMode] =
    useState<SymbolGraphMode>("execution");
  const [symbolConfidenceFilter, setSymbolConfidenceFilter] =
    useState<SymbolGraphConfidenceFilter>("strong");
  const [symbolGraphLimits, setSymbolGraphLimits] = useState(
    DEFAULT_SYMBOL_GRAPH_LIMITS,
  );
  const [symbolGraphResult, setSymbolGraphResult] =
    useState<QueryResult<GraphItem> | null>(null);
  const [workspaceError, setWorkspaceError] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [draftRootPath, setDraftRootPath] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [addingWorkspace, setAddingWorkspace] = useState(false);
  const deferredSearchText = useDeferredValue(searchText);
  const messages = getMessages(locale);
  const scopeOptions = buildScopeOptions(locale);
  const workspaceCards = buildWorkspaceCards(workspaces, locale);
  const selectedWorkspace =
    workspaces.find((entry) => entry.id === selectedWorkspaceId) ?? null;

  const selectedRepository =
    repositories.find((entry) => entry.id === selectedRepositoryId) ??
    repositories[0] ??
    null;
  const packageEntries = buildPackageEntries(
    packages,
    scopeMode,
    repositories,
    selectedRepositoryId,
    locale,
  );
  const visibleRoutes = filterRoutesForDisplay(routes, packages, {
    repositories,
    selectedRepositoryId,
    scopeMode,
    selectedPackageId,
  });
  const visibleSearchResults = filterSearchResultsForDisplay(
    searchResults,
    scopeMode,
    repositories,
    selectedRepositoryId,
  );
  const visibleRouteFlow = routeFlow.filter(
    (item) =>
      matchesScope(item.path, scopeMode) &&
      pathBelongsToRepository(item.path, selectedRepositoryId, repositories),
  );
  const visibleDependencyItems = dependencyItems.filter(
    (item) =>
      matchesScope(item.path, scopeMode) &&
      pathBelongsToRepository(item.path, selectedRepositoryId, repositories),
  );
  const visibleImpactItems = impactItems.filter(
    (item) =>
      matchesScope(item.path, scopeMode) &&
      pathBelongsToRepository(item.path, selectedRepositoryId, repositories),
  );
  const routeInsights = buildRouteInsights(visibleRouteFlow, packages, locale);
  const searchWorkbench = buildSearchWorkbenchGuidance({
    locale,
    packages,
    routes,
    repositories,
    selectedRepositoryId,
    scopeMode,
    selectedPackageId,
    searchKind,
  });
  const starterGuide = buildWorkspaceStarterGuide({
    locale,
    packages,
    routes,
    repositories,
    selectedRepositoryId,
    scopeMode,
    selectedPackageId,
  });
  const architectureGraph = buildArchitectureGraph({
    inspector,
    packages,
    routes,
    routeFlow: visibleRouteFlow,
    dependencyItems: visibleDependencyItems,
    impactItems: visibleImpactItems,
    scopeMode,
    selectedPackageId,
    edgeFilters,
  });
  const isSymbolInspector =
    inspector.type === "search" && inspector.item.kind === "symbol";
  const symbolGraph =
    isSymbolInspector && inspector.type === "search"
      ? buildSymbolGraphModel({
          graph: symbolGraphResult?.graph,
          mode: symbolGraphMode,
          rootSymbolId: inspector.item.id,
          confidenceFilter: symbolConfidenceFilter,
          labels: {
            expandCallers: messages.app.symbolGraphExpandCallers,
            expandCallees: messages.app.symbolGraphExpandCallees,
          },
        })
      : null;
  const activeGraph = symbolGraph ?? architectureGraph;
  const positionedGraphNodes = layoutArchitectureGraph(activeGraph);
  const selectedPath =
    inspector.type === "route"
      ? inspector.route.filePath
      : inspector.type === "search"
        ? inspector.item.path
        : undefined;
  const selectedPackage = findOwningPackage(selectedPath, packages);
  const selectedTitle =
    inspector.type === "route"
      ? inspector.route.id
      : inspector.type === "search"
        ? inspector.item.label
        : "";
  const selectedSummary =
    inspector.type === "route"
      ? `${inspector.route.framework} · ${formatConfidence(locale, inspector.route.confidence)}`
      : (selectedPath ?? messages.app.noFilePathToTrace);
  const selectedCommand =
    inspector.type === "idle"
      ? ""
      : buildGraphTraceCommand(
          inspector.type === "route"
            ? {
                id: inspector.route.id,
                kind: "route",
                label: inspector.route.id,
                path: inspector.route.filePath,
              }
            : inspector.item,
        );
  const selectedFileHref =
    status?.workspaceRoot && selectedPath
      ? `file://${encodeURI(joinPath(status.workspaceRoot, selectedPath))}`
      : "";
  const symbolInspectorSections =
    isSymbolInspector && inspector.type === "search"
      ? buildSymbolInspectorSections({
          graph: symbolGraphResult?.graph,
          rootSymbolId: inspector.item.id,
          mode: symbolGraphMode,
          confidenceFilter: symbolConfidenceFilter,
          labels: {
            callers: messages.app.symbolGraphCallers,
            callees: messages.app.symbolGraphCallees,
            routes: messages.app.symbolGraphRoutes,
            sinks: messages.app.symbolGraphSinks,
          },
          weakConfidenceWarning: messages.app.symbolGraphWeakWarning,
        })
      : [];
  const presentationState = buildWorkspacePresentationState({ inspector });
  const sidebarPackageEntries = packageEntries.map((entry) => ({
    ...entry,
    scopeLabel: formatScopeLabel(locale, entry.scope),
  }));

  useEffect(() => {
    let cancelled = false;

    const loadWorkspaces = async () => {
      try {
        const payload = await getWorkspaces(refreshNonce);

        if (cancelled) {
          return;
        }

        startTransition(() => {
          setWorkspaces(payload.items ?? []);
          if (
            selectedWorkspaceId &&
            !(payload.items ?? []).some(
              (entry) => entry.id === selectedWorkspaceId,
            )
          ) {
            setSelectedWorkspaceId("");
          }
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setWorkspaceError(
            error instanceof Error
              ? error.message
              : messages.app.loadWorkspacesError,
          );
        });
      }
    };

    void loadWorkspaces();

    return () => {
      cancelled = true;
    };
  }, [messages.app.loadWorkspacesError, refreshNonce, selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }

    let cancelled = false;

    const loadWorkspaceData = async () => {
      try {
        const repositoriesPayload = await getWorkspaceRepositories(
          selectedWorkspaceId,
          refreshNonce,
        );
        const availableRepositories = repositoriesPayload.items ?? [];
        const nextRepositoryId =
          availableRepositories.find(
            (entry) => entry.id === selectedRepositoryId,
          )?.id ??
          availableRepositories[0]?.id ??
          ".";
        const [statusPayload, packagesPayload, routesPayload] =
          await Promise.all([
            getWorkspaceStatus(
              selectedWorkspaceId,
              refreshNonce,
              nextRepositoryId,
            ),
            getWorkspacePackages(
              selectedWorkspaceId,
              refreshNonce,
              nextRepositoryId,
            ),
            getWorkspaceRoutes(
              selectedWorkspaceId,
              refreshNonce,
              nextRepositoryId,
            ),
          ]);

        if (cancelled) {
          return;
        }

        startTransition(() => {
          setWorkspaceError("");
          setRepositories(availableRepositories);
          setSelectedRepositoryId(nextRepositoryId);
          setStatus(statusPayload);
          setPackages(packagesPayload.items ?? []);
          setRoutes(routesPayload.items ?? []);
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setWorkspaceError(
            error instanceof Error
              ? error.message
              : messages.app.loadWorkspaceStateError,
          );
          setRepositories([]);
          setPackages([]);
          setRoutes([]);
        });
      }
    };

    void loadWorkspaceData();

    return () => {
      cancelled = true;
    };
  }, [
    messages.app.loadWorkspaceStateError,
    refreshNonce,
    selectedRepositoryId,
    selectedWorkspaceId,
  ]);

  useEffect(() => {
    if (!selectedWorkspaceId || !deferredSearchText.trim()) {
      setSearchResults([]);
      return;
    }

    void searchWorkspace(
      selectedWorkspaceId,
      deferredSearchText,
      searchKind,
      selectedRepositoryId,
    )
      .then((payload) => {
        startTransition(() => {
          setSearchResults(payload.items ?? []);
        });
      })
      .catch(() => {
        startTransition(() => {
          setSearchResults([]);
        });
      });
  }, [
    deferredSearchText,
    searchKind,
    selectedRepositoryId,
    selectedWorkspaceId,
  ]);

  useEffect(() => {
    if (!selectedWorkspaceId || inspector.type === "idle") {
      return;
    }

    let cancelled = false;

    const loadInspector = async () => {
      setDetailLoading(true);
      setDetailError("");

      try {
        if (inspector.type === "route") {
          const flowPayload = await getRouteFlow(
            selectedWorkspaceId,
            inspector.route.id,
            refreshNonce,
            selectedRepositoryId,
          );

          if (cancelled) {
            return;
          }

          startTransition(() => {
            setRouteFlow(flowPayload.items ?? []);
            setDependencyItems([]);
            setImpactItems([]);
          });
        } else if (inspector.item.kind === "symbol") {
          const payload =
            symbolGraphMode === "impact"
              ? await getWorkspaceSymbolImpact(
                  selectedWorkspaceId,
                  inspector.item.id,
                  refreshNonce,
                  symbolGraphLimits,
                )
              : symbolGraphMode === "reference"
                ? await getWorkspaceSymbolNeighbors(
                    selectedWorkspaceId,
                    inspector.item.id,
                    refreshNonce,
                  )
                : await getWorkspaceSymbolExecution(
                    selectedWorkspaceId,
                    inspector.item.id,
                    refreshNonce,
                    symbolGraphLimits,
                  );

          if (cancelled) {
            return;
          }

          startTransition(() => {
            setSymbolGraphResult(payload);
            setRouteFlow([]);
            setDependencyItems([]);
            setImpactItems([]);
          });
        } else if (
          inspector.item.path &&
          looksLikeSourcePath(inspector.item.path)
        ) {
          const [depsPayload, impactPayload] = await Promise.all([
            getFileDependencies(
              selectedWorkspaceId,
              inspector.item.path,
              refreshNonce,
              selectedRepositoryId,
            ),
            getFileImpact(
              selectedWorkspaceId,
              inspector.item.path,
              refreshNonce,
              selectedRepositoryId,
            ),
          ]);

          if (cancelled) {
            return;
          }

          startTransition(() => {
            setRouteFlow([]);
            setDependencyItems(depsPayload.items ?? []);
            setImpactItems(impactPayload.items ?? []);
          });
        } else {
          startTransition(() => {
            setSymbolGraphResult(null);
            setRouteFlow([]);
            setDependencyItems([]);
            setImpactItems([]);
          });
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setDetailError(
            error instanceof Error
              ? error.message
              : messages.app.loadInspectorError,
          );
          setSymbolGraphResult(null);
          setRouteFlow([]);
          setDependencyItems([]);
          setImpactItems([]);
        });
      } finally {
        if (!cancelled) {
          startTransition(() => {
            setDetailLoading(false);
          });
        }
      }
    };

    void loadInspector();

    return () => {
      cancelled = true;
    };
  }, [
    inspector,
    messages.app.loadInspectorError,
    refreshNonce,
    selectedRepositoryId,
    selectedWorkspaceId,
    symbolGraphLimits,
    symbolGraphMode,
  ]);

  useEffect(() => {
    if (!selectedPackageId) {
      return;
    }

    const packageStillVisible = packageEntries.some(
      (entry) => entry.id === selectedPackageId,
    );
    if (!packageStillVisible) {
      setSelectedPackageId("");
    }
  }, [packageEntries, selectedPackageId]);

  useEffect(() => {
    if (!actionFeedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setActionFeedback("");
    }, 2200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [actionFeedback]);

  useEffect(() => {
    syncUiStateToLocation({
      locale,
      workspaceId: selectedWorkspaceId,
      repositoryId: selectedRepositoryId,
      scopeMode,
      selectedPackageId,
      searchKind,
      searchText,
    });
  }, [
    locale,
    scopeMode,
    searchKind,
    searchText,
    selectedPackageId,
    selectedRepositoryId,
    selectedWorkspaceId,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.lang = locale;
  }, [locale]);

  const handleAddWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAddingWorkspace(true);

    try {
      const created = await addWorkspace({
        rootPath: draftRootPath,
        label: draftLabel || undefined,
      });

      startTransition(() => {
        setDraftRootPath("");
        setDraftLabel("");
        setSelectedWorkspaceId(created.id);
        setSelectedRepositoryId(".");
        setSelectedPackageId("");
        setSearchText("");
        setSearchResults([]);
        setInspector({ type: "idle" });
        setSymbolGraphMode("execution");
        setSymbolConfidenceFilter("strong");
        setSymbolGraphLimits(DEFAULT_SYMBOL_GRAPH_LIMITS);
        setSymbolGraphResult(null);
        setRefreshNonce((value) => value + 1);
        setWorkspaceError("");
      });
    } catch (error) {
      startTransition(() => {
        setWorkspaceError(
          error instanceof Error
            ? error.message
            : messages.app.addWorkspaceError,
        );
      });
    } finally {
      setAddingWorkspace(false);
    }
  };

  const handleSymbolGraphAction = (actionId: SymbolGraphActionId) => {
    switch (actionId) {
      case "show-weaker-edges":
        setSymbolConfidenceFilter("all");
        return;
      case "open-impact":
        setSymbolGraphMode("impact");
        return;
      case "expand-callers":
      case "expand-callees":
        setSymbolGraphLimits((current) => ({
          maxNodes: current.maxNodes + 12,
          maxEdges: current.maxEdges + 18,
        }));
        return;
    }
  };

  const resetSymbolGraphView = () => {
    setSymbolGraphMode("execution");
    setSymbolConfidenceFilter("strong");
    setSymbolGraphLimits(DEFAULT_SYMBOL_GRAPH_LIMITS);
  };

  const handleOpenWorkspaceList = () => {
    startTransition(() => {
      setSelectedWorkspaceId("");
    });
  };

  const handleOpenWorkspace = (workspaceId: string) => {
    startTransition(() => {
      setSelectedWorkspaceId(workspaceId);
      setSelectedRepositoryId(".");
      setSelectedPackageId("");
      setSearchText("");
      setSearchResults([]);
      setInspector({ type: "idle" });
      resetSymbolGraphView();
      setRouteFlow([]);
      setDependencyItems([]);
      setImpactItems([]);
      setSymbolGraphResult(null);
    });
  };

  const handleRepositoryChange = (nextRepositoryId: string) => {
    startTransition(() => {
      setSelectedRepositoryId(nextRepositoryId);
      setSelectedPackageId("");
      setInspector({ type: "idle" });
      resetSymbolGraphView();
      setRouteFlow([]);
      setDependencyItems([]);
      setImpactItems([]);
      setSymbolGraphResult(null);
      setSearchResults([]);
    });
  };

  const handleSelectGraphNode = (node: {
    id: string;
    kind: string;
    label: string;
    path?: string;
    actionId?: string;
  }) => {
    if (node.actionId) {
      handleSymbolGraphAction(node.actionId as SymbolGraphActionId);
      return;
    }

    if (node.kind === "symbol") {
      resetSymbolGraphView();
    }

    inspectGraphItem(
      {
        id: node.id,
        kind: node.kind,
        label: node.label,
        path: node.path,
      },
      packages,
      routes,
      setInspector,
      setSelectedPackageId,
      setSearchKind,
      setSearchText,
    );
  };

  const handleRunStarterAction = (action: WorkspaceStarterAction) => {
    runStarterAction(
      action,
      packages,
      routes,
      setInspector,
      setSelectedPackageId,
      setSearchKind,
      setSearchText,
    );
  };

  const handleSelectSearchResult = (item: SearchResult) => {
    if (item.kind === "symbol") {
      resetSymbolGraphView();
    }

    inspectSearchResult(item, routes, setInspector);
  };

  const handleSelectRoute = (route: RouteSummary) => {
    setInspector({
      type: "route",
      route,
    });
  };

  const handleSelectInspectorItem = (item: GraphItem) => {
    inspectGraphItem(
      item,
      packages,
      routes,
      setInspector,
      setSelectedPackageId,
      setSearchKind,
      setSearchText,
    );
  };

  const handleSelectSymbolInspectorItem = (item: GraphItem) => {
    if (item.kind === "symbol") {
      resetSymbolGraphView();
    }

    handleSelectInspectorItem(item);
  };

  const handleRerunSearch = () => {
    if (inspector.type === "idle") {
      return;
    }

    runSearchFromItem(
      inspector.type === "route"
        ? {
            id: inspector.route.id,
            kind: "route",
            label: inspector.route.id,
            path: inspector.route.filePath,
          }
        : inspector.item,
      setSearchKind,
      setSearchText,
    );
  };

  if (!selectedWorkspaceId) {
    return (
      <WorkspaceHome
        locale={locale}
        cards={workspaceCards}
        workspaceError={workspaceError}
        addingWorkspace={addingWorkspace}
        draftRootPath={draftRootPath}
        draftLabel={draftLabel}
        onLocaleChange={setLocale}
        onDraftRootPathChange={setDraftRootPath}
        onDraftLabelChange={setDraftLabel}
        onAddWorkspace={handleAddWorkspace}
        onOpenWorkspace={handleOpenWorkspace}
      />
    );
  }

  const relatedPackageItems = routeInsights.relatedPackages.map((entry) => ({
    id: entry.id,
    kind: "package",
    label: entry.label,
    path: entry.path,
  }));
  const selectedSearchResultId =
    inspector.type === "search" ? inspector.item.id : "";
  const selectedRouteId = inspector.type === "route" ? inspector.route.id : "";

  return (
    <WorkspaceScreen
      locale={locale}
      workspaceError={workspaceError}
      presentationState={presentationState}
      header={{
        selectedWorkspace,
        repositories,
        selectedRepositoryId,
        onOpenWorkspaceList: handleOpenWorkspaceList,
        onLocaleChange: setLocale,
        onRepositoryChange: handleRepositoryChange,
        onRefreshGraph: () => {
          startTransition(() => {
            setRefreshNonce((value) => value + 1);
          });
        },
        currentWorkspaceLabel:
          selectedWorkspace?.label ?? messages.common.loading,
        lastIndexLabel: formatTimestamp(
          locale,
          status?.lastIndexRun?.completedAt,
        ),
      }}
      sidebar={{
        status,
        selectedRepository,
        scopeOptions,
        scopeMode,
        onScopeModeChange: setScopeMode,
        selectedPackageId,
        onSelectPackage: setSelectedPackageId,
        onTogglePackage: (packageId) =>
          setSelectedPackageId((current) =>
            current === packageId ? "" : packageId,
          ),
        packageEntries: sidebarPackageEntries,
      }}
      graphPanel={{
        isSymbolInspector,
        edgeFilters,
        onToggleEdgeFilter: (key) =>
          setEdgeFilters((current) => ({
            ...current,
            [key]: !current[key],
          })),
        graph: activeGraph,
        nodes: positionedGraphNodes,
        starterGuide,
        onSelectNode: handleSelectGraphNode,
        onRunStarterAction: handleRunStarterAction,
        symbolControls:
          isSymbolInspector && inspector.type === "search"
            ? {
                mode: symbolGraphMode,
                confidenceFilter: symbolConfidenceFilter,
                confidenceSummary: symbolGraphResult?.graph?.summary,
                symbolLabel: inspector.item.label,
                onModeChange: setSymbolGraphMode,
                onConfidenceFilterChange: setSymbolConfidenceFilter,
                onAction: handleSymbolGraphAction,
              }
            : undefined,
      }}
      supportingPanels={{
        variant: presentationState.supportingPanelsVariant,
        searchText,
        onSearchTextChange: setSearchText,
        searchKind,
        onSearchKindChange: setSearchKind,
        searchWorkbench,
        visibleSearchResults,
        selectedSearchResultId,
        onSelectQuickPick: (pick) => {
          startTransition(() => {
            setSearchKind(pick.kind);
            setSearchText(pick.query);
          });
        },
        onSelectSearchResult: handleSelectSearchResult,
        packages,
        visibleRoutes,
        selectedRouteId,
        onSelectRoute: handleSelectRoute,
      }}
      inspectorPanel={{
        inspector,
        selectedTitle,
        selectedSummary,
        selectedPackage,
        selectedPath,
        selectedCommand,
        selectedFileHref,
        actionFeedback,
        onActionFeedbackChange: setActionFeedback,
        onRerunSearch: handleRerunSearch,
        detailLoading,
        detailError,
        isSymbolInspector,
        symbolInspectorSections,
        onSelectSymbolInspectorItem: handleSelectSymbolInspectorItem,
        routeFlowItems: visibleRouteFlow,
        relatedPackageItems,
        queryHintItems: routeInsights.queryHints,
        dependencyItems: visibleDependencyItems,
        impactItems: visibleImpactItems,
        workspaceRoot: status?.workspaceRoot,
        onSelectItem: handleSelectInspectorItem,
      }}
    />
  );
}

function inspectSearchResult(
  item: SearchResult,
  routes: RouteSummary[],
  setInspector: (value: WorkspaceInspectorState) => void,
) {
  if (item.kind === "route") {
    const matchingRoute = routes.find((route) => route.id === item.id) ?? null;
    if (matchingRoute) {
      setInspector({
        type: "route",
        route: matchingRoute,
      });
      return;
    }
  }

  setInspector({
    type: "search",
    item,
  });
}

function inspectGraphItem(
  item: GraphItem,
  packages: PackageSummary[],
  routes: RouteSummary[],
  setInspector: (value: WorkspaceInspectorState) => void,
  setSelectedPackageId: (value: string | ((current: string) => string)) => void,
  setSearchKind: (value: string) => void,
  setSearchText: (value: string) => void,
) {
  if (item.kind === "route") {
    const matchingRoute = routes.find((route) => route.id === item.id);
    if (matchingRoute) {
      setInspector({ type: "route", route: matchingRoute });
      return;
    }
  }

  if (item.kind === "package") {
    const matchingPackage =
      packages.find((entry) => entry.id === item.id) ??
      packages.find((entry) => entry.path === item.path) ??
      packages.find((entry) => entry.label === item.label);

    if (matchingPackage) {
      setSelectedPackageId(matchingPackage.id);
      startTransition(() => {
        setSearchKind("package");
        setSearchText(matchingPackage.label);
      });
    }
    return;
  }

  if (item.path && looksLikeSourcePath(item.path)) {
    setInspector({
      type: "search",
      item: {
        id: item.id,
        kind: item.kind === "query" ? "file" : item.kind,
        label: item.kind === "query" ? item.path : item.label,
        path: item.path,
      },
    });
    return;
  }

  startTransition(() => {
    setSearchKind(preferredSearchKind(item.kind));
    setSearchText(getSearchSeed(item));
  });
}

function runStarterAction(
  action: WorkspaceStarterAction,
  packages: PackageSummary[],
  routes: RouteSummary[],
  setInspector: (value: WorkspaceInspectorState) => void,
  setSelectedPackageId: (value: string | ((current: string) => string)) => void,
  setSearchKind: (value: string) => void,
  setSearchText: (value: string) => void,
) {
  if (action.kind === "route" && action.targetId) {
    const route = routes.find((entry) => entry.id === action.targetId);
    if (route) {
      startTransition(() => {
        setSearchKind("route");
        setSearchText(route.id);
        setInspector({ type: "route", route });
      });
      return;
    }
  }

  if (action.kind === "file" && action.targetPath) {
    const targetPath = action.targetPath;

    startTransition(() => {
      setSearchKind("file");
      setSearchText(targetPath);
      setInspector({
        type: "search",
        item: {
          id: `starter-file:${targetPath}`,
          kind: "file",
          label: targetPath,
          path: targetPath,
        },
      });
    });
    return;
  }

  if (action.kind === "package" && action.targetId) {
    const matchingPackage =
      packages.find((entry) => entry.id === action.targetId) ??
      packages.find((entry) => entry.label === action.query);

    if (matchingPackage) {
      startTransition(() => {
        setSelectedPackageId(matchingPackage.id);
        setSearchKind("package");
        setSearchText(matchingPackage.label);
      });
      return;
    }
  }

  startTransition(() => {
    setSearchKind(action.kind);
    setSearchText(action.query);
  });
}

function runSearchFromItem(
  item: Pick<GraphItem, "kind" | "label" | "path">,
  setSearchKind: (value: string) => void,
  setSearchText: (value: string) => void,
) {
  startTransition(() => {
    setSearchKind(preferredSearchKind(item.kind));
    setSearchText(getSearchSeed(item));
  });
}

function preferredSearchKind(kind: string) {
  if (kind === "route" || kind === "file" || kind === "package") {
    return kind;
  }

  return "symbol";
}

function getSearchSeed(item: Pick<GraphItem, "kind" | "label" | "path">) {
  if (item.kind === "route") {
    return item.label;
  }

  if (item.path) {
    const segments = item.path.split("/");
    return segments[segments.length - 1] ?? item.path;
  }

  return item.label;
}

function readRepositoryFromLocation() {
  return readRouteStateFromLocation().repositoryId;
}

function readWorkspaceFromLocation() {
  return readRouteStateFromLocation().workspaceId;
}

function readScopeFromLocation(): ScopeMode {
  return readRouteStateFromLocation().scopeMode;
}

function readPackageFromLocation() {
  return readRouteStateFromLocation().selectedPackageId;
}

function readSearchTextFromLocation() {
  return readRouteStateFromLocation().searchText;
}

function readSearchKindFromLocation() {
  return readRouteStateFromLocation().searchKind;
}

function readLocaleFromLocation(): Locale {
  return readRouteStateFromLocation().locale;
}

function buildRepositoryQuery(repositoryId: string, hasExistingQuery = false) {
  if (!repositoryId) {
    return "";
  }

  return `${hasExistingQuery ? "&" : "?"}repository=${encodeURIComponent(repositoryId)}`;
}

function buildRefreshQuery(refreshNonce: number, hasExistingQuery = false) {
  return `${hasExistingQuery ? "&" : "?"}refresh=${refreshNonce}`;
}

function syncUiStateToLocation(state: {
  locale: Locale;
  workspaceId: string;
  repositoryId: string;
  scopeMode: ScopeMode;
  selectedPackageId: string;
  searchKind: string;
  searchText: string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  window.history.replaceState({}, "", buildRouteHref(state));
}

function readRouteStateFromLocation() {
  if (typeof window === "undefined") {
    return {
      locale: DEFAULT_LOCALE,
      workspaceId: "",
      repositoryId: ".",
      scopeMode: "primary" as const,
      selectedPackageId: "",
      searchText: "",
      searchKind: "symbol",
    };
  }

  const storedLocale = resolveLocale(
    window.localStorage.getItem(LOCALE_STORAGE_KEY),
    DEFAULT_LOCALE,
  );

  return parseRouteState(window.location.href, storedLocale);
}

function formatTimestamp(locale: Locale, value?: string | null) {
  if (!value) {
    return getMessages(locale).common.noneYet;
  }

  return formatLocaleDateTime(locale, value);
}

function formatConfidence(locale: Locale, value?: number) {
  if (typeof value !== "number") {
    return "n/a";
  }

  return getMessages(locale).app.confidence({
    value: Math.round(value * 100),
  });
}

function formatScopeLabel(locale: Locale, scope: PackageListEntry["scope"]) {
  const messages = getMessages(locale);

  switch (scope) {
    case "primary":
      return messages.common.repoScopeLabel;
    case "test":
      return messages.common.testScopeLabel;
    case "fixture":
      return messages.common.fixtureScopeLabel;
  }
}

function buildScopeOptions(locale: Locale): Array<{
  id: ScopeMode;
  label: string;
  description: string;
}> {
  const messages = getMessages(locale);

  return [
    {
      id: "primary",
      label: messages.scope.primary.label,
      description: messages.scope.primary.description,
    },
    {
      id: "all",
      label: messages.scope.all.label,
      description: messages.scope.all.description,
    },
    {
      id: "tests",
      label: messages.scope.tests.label,
      description: messages.scope.tests.description,
    },
  ];
}

function joinPath(root: string, path: string) {
  if (path === ".") {
    return root;
  }

  return `${root.replace(/\/$/, "")}/${path.replace(/^\.\//, "")}`;
}
