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
  getWorkspaces,
  searchWorkspace,
} from "./api-client";
import {
  type GraphEdgeFilters,
  buildArchitectureGraph,
  layoutArchitectureGraph,
} from "./architecture-graph";
import { GraphWorkspace } from "./graph-workspace";
import {
  type WorkspaceHomeSummary,
  buildWorkspaceCards,
} from "./home-view-model";
import {
  DEFAULT_LOCALE,
  formatLocaleDateTime,
  getMessages,
  LOCALE_STORAGE_KEY,
  resolveLocale,
  type Locale,
  SUPPORTED_LOCALES,
} from "./i18n";
import { buildRouteHref, parseRouteState } from "./route-state";
import {
  type GraphItem,
  type PackageListEntry,
  type PackageSummary,
  type QueryResult,
  type RouteSummary,
  type ScopeMode,
  type SearchResult,
  type WorkspaceStatus,
  buildGraphTraceCommand,
  buildPackageEntries,
  buildRouteInsights,
  buildSearchWorkbenchGuidance,
  filterRoutesForDisplay,
  filterSearchResultsForDisplay,
  findOwningPackage,
  looksLikeSourcePath,
  matchesScope,
} from "./view-model";
import { WorkspaceHome } from "./workspace-home";

type InspectorMode =
  | { type: "idle" }
  | { type: "route"; route: RouteSummary }
  | { type: "search"; item: SearchResult };

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
  const [inspector, setInspector] = useState<InspectorMode>({ type: "idle" });
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
  const routeInsights = buildRouteInsights(
    visibleRouteFlow,
    packages,
    locale,
  );
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
  const positionedGraphNodes = layoutArchitectureGraph(architectureGraph);
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
        onOpenWorkspace={(workspaceId) => {
          startTransition(() => {
            setSelectedWorkspaceId(workspaceId);
            setSelectedRepositoryId(".");
            setSelectedPackageId("");
            setSearchText("");
            setSearchResults([]);
            setInspector({ type: "idle" });
          });
        }}
      />
    );
  }

  const relatedPackageItems = routeInsights.relatedPackages.map((entry) => ({
    id: entry.id,
    kind: "package",
    label: entry.label,
    path: entry.path,
  }));

  return (
    <main className="app-shell">
      <section className="app-frame">
        <header className="command-deck">
          <div className="command-copy">
            {selectedWorkspace ? (
              <div className="workspace-breadcrumb">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    startTransition(() => {
                      setSelectedWorkspaceId("");
                    });
                  }}
                >
                  {messages.app.workspaceListLabel}
                </button>
                <span>/</span>
                <strong>{selectedWorkspace.label}</strong>
              </div>
            ) : null}
            <span className="eyebrow">{messages.app.eyebrow}</span>
            <h1>GraphTrace</h1>
            <p>{messages.app.intro}</p>
          </div>

          <div className="command-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                startTransition(() => {
                  setSelectedWorkspaceId("");
                });
              }}
            >
              {messages.app.backToWorkspaces}
            </button>
            <label className="field repo-picker">
              <span>{messages.localeLabel}</span>
              <select
                value={locale}
                onChange={(event) =>
                  setLocale(resolveLocale(event.target.value, locale))
                }
              >
                {SUPPORTED_LOCALES.map((entry) => (
                  <option key={entry} value={entry}>
                    {messages.localeNames[entry]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field repo-picker">
              <span>{messages.app.repositoryScope}</span>
              <select
                value={selectedRepositoryId}
                onChange={(event) => {
                  const nextRepositoryId = event.target.value;
                  startTransition(() => {
                    setSelectedRepositoryId(nextRepositoryId);
                    setSelectedPackageId("");
                    setInspector({ type: "idle" });
                    setRouteFlow([]);
                    setDependencyItems([]);
                    setImpactItems([]);
                    setSearchResults([]);
                  });
                }}
              >
                {repositories.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.kind === "primary"
                      ? `${entry.label} · ${entry.rootPath}`
                      : `${entry.label} · ${entry.rootPath}`}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="refresh-button"
              type="button"
              onClick={() => {
                startTransition(() => {
                  setRefreshNonce((value) => value + 1);
                });
              }}
            >
              {messages.app.refreshGraph}
            </button>
            <div className="status-note">
              <span>{messages.app.workspaceLabel}</span>
              <strong>{selectedWorkspace?.label ?? messages.common.loading}</strong>
            </div>
            <div className="status-note">
              <span>{messages.app.lastIndexLabel}</span>
              <strong>{formatTimestamp(locale, status?.lastIndexRun?.completedAt)}</strong>
            </div>
          </div>
        </header>

        {workspaceError ? (
          <section className="error-banner">{workspaceError}</section>
        ) : null}

        <section className="workspace-grid">
          <aside className="panel rail-panel">
            <div className="panel-heading">
              <span className="panel-kicker">
                {messages.app.workspaceStatusKicker}
              </span>
              <h2>{messages.app.graphStateTitle}</h2>
            </div>

            <dl className="metric-grid">
              <Metric
                label={messages.app.packagesLabel}
                value={status?.counts.packageCount ?? 0}
              />
              <Metric
                label={messages.app.filesLabel}
                value={status?.counts.fileCount ?? 0}
              />
              <Metric
                label={messages.app.symbolsLabel}
                value={status?.counts.symbolCount ?? 0}
              />
              <Metric
                label={messages.app.routesLabel}
                value={status?.counts.routeCount ?? 0}
              />
              <Metric
                label={messages.app.queryEdgesLabel}
                value={status?.counts.queryEdgeCount ?? 0}
              />
            </dl>

            <div className="meta-block">
              <span>{messages.app.repositoryLabel}</span>
              <strong>{selectedRepository?.label ?? messages.common.loading}</strong>
            </div>
            <div className="meta-block">
              <span>{messages.app.repositoryRootLabel}</span>
              <strong>
                {selectedRepository?.rootPath ?? messages.common.loading}
              </strong>
            </div>
            <div className="meta-block">
              <span>{messages.app.workspaceRootLabel}</span>
              <strong>{status?.workspaceRoot ?? messages.common.loading}</strong>
            </div>
            <div className="meta-block">
              <span>{messages.app.dbPathLabel}</span>
              <strong>{status?.dbPath ?? messages.common.loading}</strong>
            </div>
            <div className="meta-block">
              <span>{messages.app.modeLabel}</span>
              <strong>{status?.lastIndexRun?.mode ?? messages.common.noneYet}</strong>
            </div>

            <div className="panel-divider" />

            <div className="panel-heading compact">
              <span className="panel-kicker">
                {messages.app.workspaceScopeKicker}
              </span>
              <h2>{messages.app.triageLensTitle}</h2>
            </div>

            <div className="scope-toggle">
              {scopeOptions.map((option) => (
                <button
                  key={option.id}
                  className={
                    scopeMode === option.id
                      ? "scope-option is-active"
                      : "scope-option"
                  }
                  type="button"
                  onClick={() => setScopeMode(option.id)}
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>

            <div className="panel-divider" />

            <div className="panel-heading compact">
              <span className="panel-kicker">{messages.app.packagesKicker}</span>
              <h2>{messages.app.routeFilterTitle}</h2>
            </div>

            <label className="field">
              <span>{messages.app.filterByPackageLabel}</span>
              <select
                value={selectedPackageId}
                onChange={(event) => setSelectedPackageId(event.target.value)}
              >
                <option value="">{messages.app.allVisiblePackages}</option>
                {packageEntries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                    {entry.disambiguation ? ` · ${entry.secondaryLabel}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <ul className="stack-list package-list">
              {packageEntries.map((entry) => (
                <li key={entry.id}>
                  <button
                    className={
                      entry.id === selectedPackageId
                        ? "list-item is-active"
                        : "list-item"
                    }
                    type="button"
                    onClick={() =>
                      setSelectedPackageId((current) =>
                        current === entry.id ? "" : entry.id,
                      )
                    }
                  >
                    <span className="list-chip">
                      {formatScopeLabel(locale, entry.scope)}
                    </span>
                    <span className="list-title">{entry.label}</span>
                    <span className="list-meta">{entry.secondaryLabel}</span>
                    {entry.disambiguation ? (
                      <span className="list-subtle">
                        {messages.app.duplicateLabelHint}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="workspace-main">
            <article className="panel graph-panel">
              <div className="panel-heading">
                <span className="panel-kicker">
                  {messages.app.architectureGraphKicker}
                </span>
                <h2>{messages.app.boundedRelationshipTitle}</h2>
                <p>{messages.app.architectureGraphDescription}</p>
              </div>

              <div className="graph-toolbar">
                {(
                  [
                    ["flow", messages.app.graphEdgeFlow],
                    ["depends", messages.app.graphEdgeDepends],
                    ["impacts", messages.app.graphEdgeImpacts],
                    ["contains", messages.app.graphEdgeContains],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    className={
                      edgeFilters[key]
                        ? "graph-filter is-active"
                        : "graph-filter"
                    }
                    type="button"
                    onClick={() =>
                      setEdgeFilters((current) => ({
                        ...current,
                        [key]: !current[key],
                      }))
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>

              <GraphWorkspace
                locale={locale}
                graph={architectureGraph}
                nodes={positionedGraphNodes}
                onSelectNode={(node) =>
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
                  )
                }
              />
            </article>

            <article className="panel">
              <div className="panel-heading">
                <span className="panel-kicker">
                  {messages.app.searchResultsKicker}
                </span>
                <h2>{messages.app.workbenchTitle}</h2>
                <p>{messages.app.workbenchDescription}</p>
              </div>

              <div className="control-row">
                <label className="field grow">
                  <span>{messages.app.queryLabel}</span>
                  <input
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="runCli, packages/server, /api/impact..."
                  />
                </label>
                <label className="field">
                  <span>{messages.app.kindLabel}</span>
                  <select
                    value={searchKind}
                    onChange={(event) => setSearchKind(event.target.value)}
                  >
                    <option value="symbol">symbol</option>
                    <option value="route">route</option>
                    <option value="file">file</option>
                    <option value="package">package</option>
                  </select>
                </label>
              </div>

              <section className="search-guidance">
                <div className="search-guidance-card">
                  <span className="panel-kicker">
                    {messages.app.guidedTriageKicker}
                  </span>
                  <h3>{searchWorkbench.emptyStateTitle}</h3>
                  <p>{searchWorkbench.emptyStateBody}</p>
                </div>

                <div className="search-kind-guide">
                  <strong>{searchKind}</strong>
                  <span>{searchWorkbench.kindGuide}</span>
                </div>

                <div className="quick-pick-grid">
                  {searchWorkbench.quickPicks.map((pick) => (
                    <button
                      key={pick.id}
                      className="quick-pick"
                      type="button"
                      onClick={() => {
                        startTransition(() => {
                          setSearchKind(pick.kind);
                          setSearchText(pick.query);
                        });
                      }}
                    >
                      <span className="list-chip">{pick.kind}</span>
                      <span className="list-title">{pick.label}</span>
                      <span className="list-meta">{pick.query}</span>
                      <span className="list-subtle">{pick.reason}</span>
                    </button>
                  ))}
                </div>

                <ol className="triage-steps">
                  {searchWorkbench.triageSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </section>

              <ul className="stack-list results-list">
                {visibleSearchResults.length === 0 ? (
                  <li className="empty-state">
                    {searchText.trim()
                      ? messages.app.noSearchMatches({
                          searchKind,
                          searchText,
                        })
                      : messages.app.idleSearchPrompt}
                  </li>
                ) : (
                  visibleSearchResults.map((item) => {
                    const owningPackage = findOwningPackage(
                      item.path,
                      packages,
                    );
                    return (
                      <li key={`${item.kind}:${item.id}`}>
                        <button
                          className={
                            inspector.type === "search" &&
                            inspector.item.id === item.id
                              ? "list-item is-active"
                              : "list-item"
                          }
                          type="button"
                          onClick={() =>
                            inspectSearchResult(item, routes, setInspector)
                          }
                        >
                          <span className="list-chip">{item.kind}</span>
                          <span className="list-title">{item.label}</span>
                          <span className="list-meta">
                            {item.path ?? `score ${item.score ?? 0}`}
                          </span>
                          {owningPackage?.label ? (
                            <span className="list-subtle">
                              {owningPackage.label} · {owningPackage.path}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </article>

            <article className="panel">
              <div className="panel-heading">
                <span className="panel-kicker">
                  {messages.app.routeExplorerKicker}
                </span>
                <h2>{messages.app.httpSurfaceTitle}</h2>
                <p>{messages.app.routeExplorerDescription}</p>
              </div>

              <ul className="stack-list results-list">
                {visibleRoutes.length === 0 ? (
                  <li className="empty-state">{messages.app.noRoutesInScope}</li>
                ) : (
                  visibleRoutes.map((route) => {
                    const owningPackage = findOwningPackage(
                      route.filePath,
                      packages,
                    );
                    return (
                      <li key={route.id}>
                        <button
                          className={
                            inspector.type === "route" &&
                            inspector.route.id === route.id
                              ? "list-item is-active route-item"
                              : "list-item route-item"
                          }
                          type="button"
                          onClick={() => {
                            setInspector({
                              type: "route",
                              route,
                            });
                          }}
                        >
                          <span className="route-line">
                            <span className="method-chip">{route.method}</span>
                            <span className="route-path">{route.path}</span>
                          </span>
                          <span className="route-meta-line">
                            <span>{route.framework}</span>
                            <span>{formatConfidence(locale, route.confidence)}</span>
                            <span>
                              {owningPackage?.label ?? messages.app.unmappedPackage}
                            </span>
                          </span>
                          <span className="list-meta">{route.filePath}</span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </article>
          </section>

          <aside className="panel inspector-panel">
            <div className="panel-heading">
              <span className="panel-kicker">
                {messages.app.detailPaneKicker}
              </span>
              <h2>{messages.app.inspectorTitle}</h2>
              <p>{messages.app.inspectorDescription}</p>
            </div>

            {inspector.type === "idle" ? (
              <div className="empty-state inspector-empty">
                {messages.app.inspectorEmpty}
              </div>
            ) : (
              <>
                <div className="inspector-card">
                  <span className="list-chip">
                    {inspector.type === "route" ? "route" : inspector.item.kind}
                  </span>
                  <h3>{selectedTitle}</h3>
                  <p>{selectedSummary}</p>
                  {selectedPackage ? (
                    <p className="inspector-supporting">
                      {selectedPackage.label} · {selectedPackage.path}
                    </p>
                  ) : null}

                  <div className="action-row">
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={!selectedPath}
                      onClick={() => {
                        if (selectedPath) {
                          void copyToClipboard(
                            selectedPath,
                            messages.app.copiedPath,
                            setActionFeedback,
                            locale,
                          );
                        }
                      }}
                    >
                      {messages.common.copyPath}
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={!selectedCommand}
                      onClick={() => {
                        if (selectedCommand) {
                          void copyToClipboard(
                            selectedCommand,
                            messages.app.copiedCommand,
                            setActionFeedback,
                            locale,
                          );
                        }
                      }}
                    >
                      {messages.common.copyCommand}
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => {
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
                      }}
                    >
                      {messages.app.rerunSearch}
                    </button>
                    {selectedFileHref ? (
                      <a
                        className="ghost-button is-link"
                        href={selectedFileHref}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {messages.common.openFile}
                      </a>
                    ) : null}
                  </div>

                  {actionFeedback ? (
                    <p className="action-feedback">{actionFeedback}</p>
                  ) : null}
                </div>

                {detailLoading ? (
                  <div className="empty-state inspector-empty">
                    {messages.app.inspectorLoading}
                  </div>
                ) : null}
                {detailError ? (
                  <div className="error-banner">{detailError}</div>
                ) : null}

                {inspector.type === "route" ? (
                  <>
                    <InspectorSection
                      locale={locale}
                      title={messages.app.routeFlowTitle}
                      subtitle={messages.app.routeFlowSubtitle}
                      items={visibleRouteFlow}
                      workspaceRoot={status?.workspaceRoot}
                      onSelectItem={(item) =>
                        inspectGraphItem(
                          item,
                          packages,
                          routes,
                          setInspector,
                          setSelectedPackageId,
                          setSearchKind,
                          setSearchText,
                        )
                      }
                      onFeedback={setActionFeedback}
                    />
                    <InspectorSection
                      locale={locale}
                      title={messages.app.relatedPackagesTitle}
                      subtitle={messages.app.relatedPackagesSubtitle}
                      items={relatedPackageItems}
                      workspaceRoot={status?.workspaceRoot}
                      onSelectItem={(item) =>
                        inspectGraphItem(
                          item,
                          packages,
                          routes,
                          setInspector,
                          setSelectedPackageId,
                          setSearchKind,
                          setSearchText,
                        )
                      }
                      onFeedback={setActionFeedback}
                    />
                    <InspectorSection
                      locale={locale}
                      title={messages.app.queryHintsTitle}
                      subtitle={messages.app.queryHintsSubtitle}
                      items={routeInsights.queryHints}
                      workspaceRoot={status?.workspaceRoot}
                      onSelectItem={(item) =>
                        inspectGraphItem(
                          item,
                          packages,
                          routes,
                          setInspector,
                          setSelectedPackageId,
                          setSearchKind,
                          setSearchText,
                        )
                      }
                      onFeedback={setActionFeedback}
                    />
                  </>
                ) : (
                  <>
                    <InspectorSection
                      locale={locale}
                      title={messages.app.dependenciesTitle}
                      subtitle={messages.app.dependenciesSubtitle}
                      items={visibleDependencyItems}
                      workspaceRoot={status?.workspaceRoot}
                      onSelectItem={(item) =>
                        inspectGraphItem(
                          item,
                          packages,
                          routes,
                          setInspector,
                          setSelectedPackageId,
                          setSearchKind,
                          setSearchText,
                        )
                      }
                      onFeedback={setActionFeedback}
                    />
                    <InspectorSection
                      locale={locale}
                      title={messages.app.impactTitle}
                      subtitle={messages.app.impactSubtitle}
                      items={visibleImpactItems}
                      workspaceRoot={status?.workspaceRoot}
                      onSelectItem={(item) =>
                        inspectGraphItem(
                          item,
                          packages,
                          routes,
                          setInspector,
                          setSelectedPackageId,
                          setSearchKind,
                          setSearchText,
                        )
                      }
                      onFeedback={setActionFeedback}
                    />
                  </>
                )}
              </>
            )}
          </aside>
        </section>
      </section>
    </main>
  );
}

function Metric(props: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <dt>{props.label}</dt>
      <dd>{props.value}</dd>
    </div>
  );
}

function InspectorSection(props: {
  locale: Locale;
  title: string;
  subtitle: string;
  items: GraphItem[];
  workspaceRoot?: string;
  onSelectItem: (item: GraphItem) => void;
  onFeedback: (message: string) => void;
}) {
  const messages = getMessages(props.locale);

  return (
    <section className="inspector-section">
      <div className="inspector-section-heading">
        <h3>{props.title}</h3>
        <p>{props.subtitle}</p>
      </div>

      <ul className="stack-list inspector-list">
        {props.items.length === 0 ? (
          <li className="empty-state">{messages.app.noItemsInTrace}</li>
        ) : (
          props.items.map((item) => {
            const itemCommand = buildGraphTraceCommand(item);
            const itemFileHref =
              props.workspaceRoot && item.path
                ? `file://${encodeURI(joinPath(props.workspaceRoot, item.path))}`
                : "";

            return (
              <li key={item.id} className="inspector-row">
                <button
                  className="inspector-row-main"
                  type="button"
                  onClick={() => props.onSelectItem(item)}
                >
                  <span className="list-chip">{item.kind}</span>
                  <span className="list-title">{item.label}</span>
                  <span className="list-meta">
                    {item.path ?? item.id}
                    {typeof item.confidence === "number"
                      ? ` · ${formatConfidence(props.locale, item.confidence)}`
                      : ""}
                  </span>
                </button>

                <div className="inspector-row-actions">
                  <button
                    className="mini-action"
                    type="button"
                    disabled={!item.path}
                    onClick={() => {
                      if (item.path) {
                        void copyToClipboard(
                          item.path,
                          messages.app.copiedPath,
                          props.onFeedback,
                          props.locale,
                        );
                      }
                    }}
                  >
                    {messages.common.copyPath}
                  </button>
                  <button
                    className="mini-action"
                    type="button"
                    onClick={() => {
                      void copyToClipboard(
                        itemCommand,
                        messages.app.copiedCommand,
                        props.onFeedback,
                        props.locale,
                      );
                    }}
                  >
                    {messages.common.copyCommand}
                  </button>
                  {itemFileHref ? (
                    <a
                      className="mini-action is-link"
                      href={itemFileHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {messages.common.openFile}
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}

function inspectSearchResult(
  item: SearchResult,
  routes: RouteSummary[],
  setInspector: (value: InspectorMode) => void,
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
  setInspector: (value: InspectorMode) => void,
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

async function copyToClipboard(
  value: string,
  message: string,
  setFeedback: (message: string) => void,
  locale: Locale = DEFAULT_LOCALE,
) {
  try {
    await navigator.clipboard.writeText(value);
    setFeedback(message);
  } catch {
    setFeedback(getMessages(locale).app.clipboardUnavailable);
  }
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
