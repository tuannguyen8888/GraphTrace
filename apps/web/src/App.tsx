import { startTransition, useDeferredValue, useEffect, useState } from "react";

import type { RepositorySummary } from "@graphtrace/shared";
import { pathBelongsToRepository } from "@graphtrace/shared";

import {
  type GraphEdgeFilters,
  buildArchitectureGraph,
  layoutArchitectureGraph,
} from "./architecture-graph";
import { GraphWorkspace } from "./graph-workspace";
import {
  type GraphItem,
  type PackageListEntry,
  type PackageSummary,
  type QueryResult,
  type RouteSummary,
  type ScopeMode,
  type SearchResult,
  type WorkspaceStatus,
  buildSearchWorkbenchGuidance,
  buildGraphTraceCommand,
  buildPackageEntries,
  buildRouteInsights,
  filterRoutesForDisplay,
  filterSearchResultsForDisplay,
  findOwningPackage,
  looksLikeSourcePath,
  matchesScope,
} from "./view-model";

type InspectorMode =
  | { type: "idle" }
  | { type: "route"; route: RouteSummary }
  | { type: "search"; item: SearchResult };

const scopeOptions: Array<{
  id: ScopeMode;
  label: string;
  description: string;
}> = [
  {
    id: "primary",
    label: "Primary workspace",
    description: "Ẩn fixtures và test-only noise để repo chính nổi bật hơn.",
  },
  {
    id: "all",
    label: "Include fixtures",
    description: "Hiện toàn bộ packages, routes, và search hits.",
  },
  {
    id: "tests",
    label: "Tests only",
    description: "Tập trung vào fixtures và các file test.",
  },
];

export function App() {
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [repositories, setRepositories] = useState<RepositorySummary[]>([]);
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
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
  const deferredSearchText = useDeferredValue(searchText);

  const selectedRepository =
    repositories.find((entry) => entry.id === selectedRepositoryId) ??
    repositories[0] ??
    null;
  const packageEntries = buildPackageEntries(
    packages,
    scopeMode,
    repositories,
    selectedRepositoryId,
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
  const visibleRouteFlow = routeFlow.filter((item) =>
    matchesScope(item.path, scopeMode) &&
    pathBelongsToRepository(item.path, selectedRepositoryId, repositories),
  );
  const visibleDependencyItems = dependencyItems.filter((item) =>
    matchesScope(item.path, scopeMode) &&
    pathBelongsToRepository(item.path, selectedRepositoryId, repositories),
  );
  const visibleImpactItems = impactItems.filter((item) =>
    matchesScope(item.path, scopeMode) &&
    pathBelongsToRepository(item.path, selectedRepositoryId, repositories),
  );
  const routeInsights = buildRouteInsights(visibleRouteFlow, packages);
  const searchWorkbench = buildSearchWorkbenchGuidance({
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
      ? `${inspector.route.framework} · ${formatConfidence(inspector.route.confidence)}`
      : (selectedPath ?? "Không có file path để trace.");
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

    const loadWorkspaceData = async () => {
      try {
        const repositoriesPayload = await fetchJson<
          QueryResult<RepositorySummary>
        >("/api/repositories");
        const availableRepositories = repositoriesPayload.items ?? [];
        const nextRepositoryId =
          availableRepositories.find(
            (entry) => entry.id === selectedRepositoryId,
          )?.id ??
          availableRepositories[0]?.id ??
          ".";
        const repositoryQuery = buildRepositoryQuery(nextRepositoryId);
        const [statusPayload, packagesPayload, routesPayload] =
          await Promise.all([
            fetchJson<WorkspaceStatus>(`/api/status${repositoryQuery}`),
            fetchJson<QueryResult<PackageSummary>>(
              `/api/packages${repositoryQuery}`,
            ),
            fetchJson<QueryResult<RouteSummary>>(`/api/routes${repositoryQuery}`),
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
              : "Không tải được workspace state.",
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
  }, [refreshNonce, selectedRepositoryId]);

  useEffect(() => {
    if (!deferredSearchText.trim()) {
      setSearchResults([]);
      return;
    }

    const query = new URLSearchParams({
      q: deferredSearchText,
      kind: searchKind,
    });
    if (selectedRepositoryId) {
      query.set("repository", selectedRepositoryId);
    }

    void fetchJson<QueryResult<SearchResult>>(`/api/search?${query.toString()}`)
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
  }, [deferredSearchText, searchKind, selectedRepositoryId]);

  useEffect(() => {
    if (inspector.type === "idle") {
      return;
    }

    let cancelled = false;

    const loadInspector = async () => {
      setDetailLoading(true);
      setDetailError("");
      const repositoryQuery = buildRepositoryQuery(selectedRepositoryId, true);

      try {
        if (inspector.type === "route") {
          const flowPayload = await fetchJson<QueryResult<GraphItem>>(
            `/api/flow?target=${encodeURIComponent(inspector.route.id)}${repositoryQuery}`,
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
            fetchJson<QueryResult<GraphItem>>(
              `/api/deps?target=${encodeURIComponent(inspector.item.path)}&direction=both&depth=2${repositoryQuery}`,
            ),
            fetchJson<QueryResult<GraphItem>>(
              `/api/impact?target=${encodeURIComponent(inspector.item.path)}&depth=4${repositoryQuery}`,
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
              : "Không tải được inspector.",
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
  }, [inspector, refreshNonce, selectedRepositoryId]);

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
      repositoryId: selectedRepositoryId,
      scopeMode,
      selectedPackageId,
      searchKind,
      searchText,
    });
  }, [scopeMode, searchKind, searchText, selectedPackageId, selectedRepositoryId]);

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
            <span className="eyebrow">LOCAL-FIRST CODE GRAPH</span>
            <h1>GraphTrace</h1>
            <p>
              Search code, inspect routes, and keep drilling from files,
              dependencies, impact, and flow without falling back to repo-wide
              scans too early.
            </p>
          </div>

          <div className="command-actions">
            <label className="field repo-picker">
              <span>Repository</span>
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
              Refresh graph
            </button>
            <div className="status-note">
              <span>Last index</span>
              <strong>
                {formatTimestamp(status?.lastIndexRun?.completedAt)}
              </strong>
            </div>
          </div>
        </header>

        {workspaceError ? (
          <section className="error-banner">{workspaceError}</section>
        ) : null}

        <section className="workspace-grid">
          <aside className="panel rail-panel">
            <div className="panel-heading">
              <span className="panel-kicker">Workspace status</span>
              <h2>Graph state</h2>
            </div>

            <dl className="metric-grid">
              <Metric
                label="Packages"
                value={status?.counts.packageCount ?? 0}
              />
              <Metric label="Files" value={status?.counts.fileCount ?? 0} />
              <Metric label="Symbols" value={status?.counts.symbolCount ?? 0} />
              <Metric label="Routes" value={status?.counts.routeCount ?? 0} />
              <Metric
                label="Query edges"
                value={status?.counts.queryEdgeCount ?? 0}
              />
            </dl>

            <div className="meta-block">
              <span>Repository</span>
              <strong>{selectedRepository?.label ?? "Đang tải..."}</strong>
            </div>
            <div className="meta-block">
              <span>Repository root</span>
              <strong>{selectedRepository?.rootPath ?? "Đang tải..."}</strong>
            </div>
            <div className="meta-block">
              <span>Workspace root</span>
              <strong>{status?.workspaceRoot ?? "Đang tải..."}</strong>
            </div>
            <div className="meta-block">
              <span>DB path</span>
              <strong>{status?.dbPath ?? "Đang tải..."}</strong>
            </div>
            <div className="meta-block">
              <span>Mode</span>
              <strong>{status?.lastIndexRun?.mode ?? "chưa có"}</strong>
            </div>

            <div className="panel-divider" />

            <div className="panel-heading compact">
              <span className="panel-kicker">Workspace scope</span>
              <h2>Triage lens</h2>
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
              <span className="panel-kicker">Packages</span>
              <h2>Route filter</h2>
            </div>

            <label className="field">
              <span>Filter by package</span>
              <select
                value={selectedPackageId}
                onChange={(event) => setSelectedPackageId(event.target.value)}
              >
                <option value="">All visible packages</option>
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
                      {formatScopeLabel(entry.scope)}
                    </span>
                    <span className="list-title">{entry.label}</span>
                    <span className="list-meta">{entry.secondaryLabel}</span>
                    {entry.disambiguation ? (
                      <span className="list-subtle">
                        Duplicate label, path used to disambiguate.
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
                <span className="panel-kicker">Architecture graph</span>
                <h2>Bounded relationship view</h2>
                <p>
                  Graph view chỉ hiển thị neighborhood quanh selection hiện tại
                  để tránh noise trên self-host repo.
                </p>
              </div>

              <div className="graph-toolbar">
                {(
                  [
                    ["flow", "Flow"],
                    ["depends", "Dependencies"],
                    ["impacts", "Impact"],
                    ["contains", "Contains"],
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
                <span className="panel-kicker">Search results</span>
                <h2>Symbol and file workbench</h2>
                <p>
                  Tập trung vào repo chính trước, rồi mở rộng sang fixtures khi
                  cần đối chiếu.
                </p>
              </div>

              <div className="control-row">
                <label className="field grow">
                  <span>Query</span>
                  <input
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="runCli, packages/server, /api/impact..."
                  />
                </label>
                <label className="field">
                  <span>Kind</span>
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
                  <span className="panel-kicker">Guided triage</span>
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
                      <span className="list-title">{pick.query}</span>
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
                      ? `Chưa thấy ${searchKind} nào khớp với "${searchText}" trong scope hiện tại. Thử một quick pick phía trên hoặc đổi kind search.`
                      : "Chọn một quick pick phía trên hoặc gõ query để xem symbol, route, file, hoặc package match theo scope hiện tại."}
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
                <span className="panel-kicker">Route explorer</span>
                <h2>HTTP surface</h2>
                <p>
                  Route list được lọc theo scope và package thực tế, không còn
                  phụ thuộc vào package label mơ hồ.
                </p>
              </div>

              <ul className="stack-list results-list">
                {visibleRoutes.length === 0 ? (
                  <li className="empty-state">
                    Không có route nào trong scope hoặc package hiện tại.
                  </li>
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
                            <span>{formatConfidence(route.confidence)}</span>
                            <span>
                              {owningPackage?.label ?? "unmapped package"}
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
              <span className="panel-kicker">Detail pane</span>
              <h2>Inspector</h2>
              <p>
                Chọn route, file, dependency, impact item, hoặc query hint để
                tiếp tục drill-down.
              </p>
            </div>

            {inspector.type === "idle" ? (
              <div className="empty-state inspector-empty">
                Chọn một route hoặc search result để xem flow, dependencies,
                impact, và quick actions.
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
                            "Đã copy file path.",
                            setActionFeedback,
                          );
                        }
                      }}
                    >
                      Copy path
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={!selectedCommand}
                      onClick={() => {
                        if (selectedCommand) {
                          void copyToClipboard(
                            selectedCommand,
                            "Đã copy GraphTrace command.",
                            setActionFeedback,
                          );
                        }
                      }}
                    >
                      Copy command
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
                      Re-run search
                    </button>
                    {selectedFileHref ? (
                      <a
                        className="ghost-button is-link"
                        href={selectedFileHref}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open file
                      </a>
                    ) : null}
                  </div>

                  {actionFeedback ? (
                    <p className="action-feedback">{actionFeedback}</p>
                  ) : null}
                </div>

                {detailLoading ? (
                  <div className="empty-state inspector-empty">
                    Đang tải inspector data...
                  </div>
                ) : null}
                {detailError ? (
                  <div className="error-banner">{detailError}</div>
                ) : null}

                {inspector.type === "route" ? (
                  <>
                    <InspectorSection
                      title="Route flow"
                      subtitle="Click vào từng file, package, hoặc query hint để tiếp tục trace."
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
                      title="Related packages"
                      subtitle="Packages liên quan trực tiếp tới các file trong route flow."
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
                      title="Query hints"
                      subtitle="Những query heuristics GraphTrace tìm thấy dọc route flow."
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
                      title="Dependencies"
                      subtitle="Inbound và outbound trong bán kính 2 bước."
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
                      title="Impact"
                      subtitle="Những file và route dễ bị ảnh hưởng nếu chỉnh file này."
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
  title: string;
  subtitle: string;
  items: GraphItem[];
  workspaceRoot?: string;
  onSelectItem: (item: GraphItem) => void;
  onFeedback: (message: string) => void;
}) {
  return (
    <section className="inspector-section">
      <div className="inspector-section-heading">
        <h3>{props.title}</h3>
        <p>{props.subtitle}</p>
      </div>

      <ul className="stack-list inspector-list">
        {props.items.length === 0 ? (
          <li className="empty-state">
            Không có item nào trong vùng trace này.
          </li>
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
                      ? ` · ${formatConfidence(item.confidence)}`
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
                          "Đã copy file path.",
                          props.onFeedback,
                        );
                      }
                    }}
                  >
                    Copy path
                  </button>
                  <button
                    className="mini-action"
                    type="button"
                    onClick={() => {
                      void copyToClipboard(
                        itemCommand,
                        "Đã copy GraphTrace command.",
                        props.onFeedback,
                      );
                    }}
                  >
                    Copy command
                  </button>
                  {itemFileHref ? (
                    <a
                      className="mini-action is-link"
                      href={itemFileHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open file
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
) {
  try {
    await navigator.clipboard.writeText(value);
    setFeedback(message);
  } catch {
    setFeedback("Clipboard API không khả dụng trong browser này.");
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
  if (typeof window === "undefined") {
    return ".";
  }

  return new URL(window.location.href).searchParams.get("repository") ?? ".";
}

function readScopeFromLocation(): ScopeMode {
  if (typeof window === "undefined") {
    return "primary";
  }

  const scope = new URL(window.location.href).searchParams.get("scope");
  return scope === "all" || scope === "tests" ? scope : "primary";
}

function readPackageFromLocation() {
  if (typeof window === "undefined") {
    return "";
  }

  return new URL(window.location.href).searchParams.get("package") ?? "";
}

function readSearchTextFromLocation() {
  if (typeof window === "undefined") {
    return "";
  }

  return new URL(window.location.href).searchParams.get("q") ?? "";
}

function readSearchKindFromLocation() {
  if (typeof window === "undefined") {
    return "symbol";
  }

  const kind = new URL(window.location.href).searchParams.get("kind");
  return kind === "route" || kind === "file" || kind === "package"
    ? kind
    : "symbol";
}

function buildRepositoryQuery(repositoryId: string, hasExistingQuery = false) {
  if (!repositoryId) {
    return "";
  }

  return `${hasExistingQuery ? "&" : "?"}repository=${encodeURIComponent(repositoryId)}`;
}

function syncUiStateToLocation(state: {
  repositoryId: string;
  scopeMode: ScopeMode;
  selectedPackageId: string;
  searchKind: string;
  searchText: string;
}) {
  if (typeof window === "undefined" || !state.repositoryId) {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("repository", state.repositoryId);
  url.searchParams.set("scope", state.scopeMode);

  if (state.selectedPackageId) {
    url.searchParams.set("package", state.selectedPackageId);
  } else {
    url.searchParams.delete("package");
  }

  if (state.searchText.trim()) {
    url.searchParams.set("q", state.searchText);
    url.searchParams.set("kind", state.searchKind);
  } else {
    url.searchParams.delete("q");
    url.searchParams.delete("kind");
  }

  window.history.replaceState({}, "", url);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as T;
}

function formatTimestamp(value?: string | null) {
  if (!value) {
    return "chưa có";
  }

  return new Date(value).toLocaleString();
}

function formatConfidence(value?: number) {
  if (typeof value !== "number") {
    return "n/a";
  }

  return `${Math.round(value * 100)}% confidence`;
}

function formatScopeLabel(scope: PackageListEntry["scope"]) {
  switch (scope) {
    case "primary":
      return "repo";
    case "test":
      return "test";
    case "fixture":
      return "fixture";
  }
}

function joinPath(root: string, path: string) {
  if (path === ".") {
    return root;
  }

  return `${root.replace(/\/$/, "")}/${path.replace(/^\.\//, "")}`;
}
