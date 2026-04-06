import { startTransition, useDeferredValue, useEffect, useState } from "react";

interface IndexRunInfo {
  mode: string;
  completedAt: string | null;
}

interface WorkspaceStatus {
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

interface RouteSummary {
  id: string;
  method: string;
  path: string;
  filePath: string;
  framework: string;
  confidence: number;
}

interface PackageSummary {
  id: string;
  label: string;
  path?: string;
}

interface SearchResult {
  id: string;
  kind: string;
  label: string;
  path?: string;
  score?: number;
}

interface GraphItem {
  id: string;
  kind: string;
  label: string;
  path?: string;
  confidence?: number;
}

interface QueryResult<T> {
  items: T[];
}

type InspectorMode =
  | { type: "idle" }
  | { type: "route"; route: RouteSummary }
  | { type: "search"; item: SearchResult };

export function App() {
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [selectedPackage, setSelectedPackage] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchKind, setSearchKind] = useState("symbol");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [inspector, setInspector] = useState<InspectorMode>({ type: "idle" });
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [routeFlow, setRouteFlow] = useState<GraphItem[]>([]);
  const [dependencyItems, setDependencyItems] = useState<GraphItem[]>([]);
  const [impactItems, setImpactItems] = useState<GraphItem[]>([]);
  const [workspaceError, setWorkspaceError] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const deferredSearchText = useDeferredValue(searchText);

  useEffect(() => {
    let cancelled = false;
    const workspaceRefreshMarker = refreshNonce;
    void workspaceRefreshMarker;

    const loadWorkspaceData = async () => {
      const query = new URLSearchParams();
      if (selectedPackage) {
        query.set("package", selectedPackage);
      }

      try {
        const [statusPayload, packagesPayload, routesPayload] =
          await Promise.all([
            fetchJson<WorkspaceStatus>("/api/status"),
            fetchJson<QueryResult<PackageSummary>>("/api/packages"),
            fetchJson<QueryResult<RouteSummary>>(
              `/api/routes?${query.toString()}`,
            ),
          ]);

        if (cancelled) {
          return;
        }

        startTransition(() => {
          setWorkspaceError("");
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
          setPackages([]);
          setRoutes([]);
        });
      }
    };

    void loadWorkspaceData();

    return () => {
      cancelled = true;
    };
  }, [refreshNonce, selectedPackage]);

  useEffect(() => {
    if (!deferredSearchText.trim()) {
      setSearchResults([]);
      return;
    }

    const query = new URLSearchParams({
      q: deferredSearchText,
      kind: searchKind,
    });

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
  }, [deferredSearchText, searchKind]);

  useEffect(() => {
    if (inspector.type === "idle") {
      return;
    }

    let cancelled = false;
    const inspectorRefreshMarker = refreshNonce;
    void inspectorRefreshMarker;

    const loadInspector = async () => {
      setDetailLoading(true);
      setDetailError("");

      try {
        if (inspector.type === "route") {
          const flowPayload = await fetchJson<QueryResult<GraphItem>>(
            `/api/flow?target=${encodeURIComponent(inspector.route.id)}`,
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
              `/api/deps?target=${encodeURIComponent(inspector.item.path)}&direction=both&depth=2`,
            ),
            fetchJson<QueryResult<GraphItem>>(
              `/api/impact?target=${encodeURIComponent(inspector.item.path)}&depth=4`,
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
  }, [inspector, refreshNonce]);

  return (
    <main className="app-shell">
      <section className="app-frame">
        <header className="command-deck">
          <div className="command-copy">
            <span className="eyebrow">LOCAL-FIRST CODE GRAPH</span>
            <h1>GraphTrace</h1>
            <p>
              Search code, inspect routes, and trace likely blast radius from a
              single local graph store.
            </p>
          </div>

          <div className="command-actions">
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
              <span className="panel-kicker">Packages</span>
              <h2>Route filter</h2>
            </div>

            <label className="field">
              <span>Scope route explorer</span>
              <select
                value={selectedPackage}
                onChange={(event) => setSelectedPackage(event.target.value)}
              >
                <option value="">All packages</option>
                {packages.map((entry) => (
                  <option key={entry.id} value={entry.label}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>

            <ul className="stack-list">
              {packages.map((entry) => (
                <li key={entry.id}>
                  <button
                    className={
                      entry.label === selectedPackage
                        ? "list-item is-active"
                        : "list-item"
                    }
                    type="button"
                    onClick={() =>
                      setSelectedPackage((current) =>
                        current === entry.label ? "" : entry.label,
                      )
                    }
                  >
                    <span className="list-title">{entry.label}</span>
                    <span className="list-meta">
                      {entry.path ?? "package root"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="workspace-main">
            <article className="panel">
              <div className="panel-heading">
                <span className="panel-kicker">Search results</span>
                <h2>Symbol and file workbench</h2>
              </div>

              <div className="control-row">
                <label className="field grow">
                  <span>Query</span>
                  <input
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="listUsers, users.ts, /users..."
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

              <ul className="stack-list results-list">
                {searchResults.length === 0 ? (
                  <li className="empty-state">
                    Gõ query để xem symbol, route, file, hoặc package match.
                  </li>
                ) : (
                  searchResults.map((item) => (
                    <li key={`${item.kind}:${item.id}`}>
                      <button
                        className={
                          inspector.type === "search" &&
                          inspector.item.id === item.id
                            ? "list-item is-active"
                            : "list-item"
                        }
                        type="button"
                        onClick={() => {
                          if (item.kind === "route") {
                            const matchingRoute =
                              routes.find((route) => route.id === item.id) ??
                              null;
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
                        }}
                      >
                        <span className="list-chip">{item.kind}</span>
                        <span className="list-title">{item.label}</span>
                        <span className="list-meta">
                          {item.path ?? `score ${item.score ?? 0}`}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </article>

            <article className="panel">
              <div className="panel-heading">
                <span className="panel-kicker">Route explorer</span>
                <h2>HTTP surface</h2>
              </div>

              <ul className="stack-list results-list">
                {routes.length === 0 ? (
                  <li className="empty-state">
                    Chưa có route match với package filter hiện tại.
                  </li>
                ) : (
                  routes.map((route) => (
                    <li key={route.id}>
                      <button
                        className={
                          inspector.type === "route" &&
                          inspector.route.id === route.id
                            ? "list-item is-active"
                            : "list-item"
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
                          <span className="list-title">{route.path}</span>
                        </span>
                        <span className="list-meta">
                          {route.framework} ·{" "}
                          {formatConfidence(route.confidence)} ·{" "}
                          {route.filePath}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </article>
          </section>

          <aside className="panel inspector-panel">
            <div className="panel-heading">
              <span className="panel-kicker">Detail pane</span>
              <h2>Inspector</h2>
            </div>

            {inspector.type === "idle" ? (
              <div className="empty-state inspector-empty">
                Chọn một route hoặc search result để xem flow, dependencies, và
                impact.
              </div>
            ) : (
              <>
                <div className="inspector-card">
                  <span className="list-chip">
                    {inspector.type === "route" ? "route" : inspector.item.kind}
                  </span>
                  <h3>
                    {inspector.type === "route"
                      ? inspector.route.id
                      : inspector.item.label}
                  </h3>
                  <p>
                    {inspector.type === "route"
                      ? `${inspector.route.framework} · ${formatConfidence(
                          inspector.route.confidence,
                        )}`
                      : (inspector.item.path ?? "Không có file path để trace.")}
                  </p>
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
                  <InspectorSection
                    title="Route flow"
                    subtitle="Đường đi từ route sang file và query hints."
                    items={routeFlow}
                  />
                ) : (
                  <>
                    <InspectorSection
                      title="Dependencies"
                      subtitle="Inbound và outbound trong bán kính 2 bước."
                      items={dependencyItems}
                    />
                    <InspectorSection
                      title="Impact"
                      subtitle="Những file và route dễ bị ảnh hưởng nếu chỉnh file này."
                      items={impactItems}
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
          props.items.map((item) => (
            <li key={item.id} className="inspector-row">
              <span className="list-chip">{item.kind}</span>
              <span className="list-title">{item.label}</span>
              <span className="list-meta">
                {item.path ?? item.id}
                {typeof item.confidence === "number"
                  ? ` · ${formatConfidence(item.confidence)}`
                  : ""}
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
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

function looksLikeSourcePath(path?: string) {
  return Boolean(path && /\.(ts|tsx|js|jsx)$/.test(path));
}
