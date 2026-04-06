import { useDeferredValue, useEffect, useState } from "react";

interface RouteSummary {
  id: string;
  method: string;
  path: string;
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
}

export function App() {
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [selectedPackage, setSelectedPackage] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchKind, setSearchKind] = useState("symbol");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const deferredSearchText = useDeferredValue(searchText);

  useEffect(() => {
    void fetch("/api/packages")
      .then(async (response) => response.json())
      .then((payload: { items?: PackageSummary[] }) => {
        setPackages(payload.items ?? []);
      })
      .catch(() => {
        setPackages([]);
      });
  }, []);

  useEffect(() => {
    const query = new URLSearchParams();
    if (selectedPackage) {
      query.set("package", selectedPackage);
    }

    void fetch(`/api/routes?${query.toString()}`)
      .then(async (response) => response.json())
      .then((payload: { items?: RouteSummary[] }) => {
        setRoutes(payload.items ?? []);
      })
      .catch(() => {
        setRoutes([]);
      });
  }, [selectedPackage]);

  useEffect(() => {
    if (!deferredSearchText.trim()) {
      setSearchResults([]);
      return;
    }

    const query = new URLSearchParams({
      q: deferredSearchText,
      kind: searchKind,
    });

    void fetch(`/api/search?${query.toString()}`)
      .then(async (response) => response.json())
      .then((payload: { items?: SearchResult[] }) => {
        setSearchResults(payload.items ?? []);
      })
      .catch(() => {
        setSearchResults([]);
      });
  }, [deferredSearchText, searchKind]);

  return (
    <main
      style={{
        fontFamily:
          '"IBM Plex Mono", "SFMono-Regular", "Cascadia Code", monospace',
        minHeight: "100vh",
        padding: "2rem",
        background:
          "radial-gradient(circle at top left, rgba(255, 208, 122, 0.25), transparent 26%), linear-gradient(135deg, #0f172a 0%, #111827 55%, #1f2937 100%)",
        color: "#e5e7eb",
      }}
    >
      <section
        style={{
          display: "grid",
          gap: "1.5rem",
          maxWidth: "1200px",
          margin: "0 auto",
        }}
      >
        <header
          style={{
            display: "grid",
            gap: "0.75rem",
            padding: "1.5rem",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            background: "rgba(15, 23, 42, 0.76)",
            backdropFilter: "blur(14px)",
          }}
        >
          <span style={{ color: "#f59e0b", letterSpacing: "0.18em" }}>
            LOCAL-FIRST CODE GRAPH
          </span>
          <h1 style={{ margin: 0, fontSize: "clamp(2rem, 4vw, 4rem)" }}>
            GraphTrace
          </h1>
          <p style={{ margin: 0, maxWidth: "64ch", color: "#cbd5e1" }}>
            Inspect packages, routes, and semantic-ish search results from the
            same local graph store that powers the CLI and MCP tools.
          </p>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(260px, 320px) minmax(0, 1fr)",
            gap: "1.5rem",
          }}
        >
          <aside
            style={{
              display: "grid",
              gap: "1rem",
              padding: "1.25rem",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              background: "rgba(15, 23, 42, 0.65)",
            }}
          >
            <div>
              <h2 style={{ marginTop: 0 }}>Packages</h2>
              <label style={{ display: "grid", gap: "0.5rem" }}>
                <span style={{ color: "#94a3b8" }}>
                  Filter routes by package
                </span>
                <select
                  value={selectedPackage}
                  onChange={(event) => setSelectedPackage(event.target.value)}
                  style={{
                    background: "#111827",
                    color: "#e5e7eb",
                    border: "1px solid rgba(148, 163, 184, 0.25)",
                    padding: "0.65rem 0.75rem",
                  }}
                >
                  <option value="">All packages</option>
                  {packages.map((entry) => (
                    <option key={entry.id} value={entry.label}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "grid",
                gap: "0.75rem",
              }}
            >
              {packages.map((entry) => (
                <li
                  key={entry.id}
                  style={{
                    padding: "0.75rem",
                    border: "1px solid rgba(148, 163, 184, 0.12)",
                    background:
                      selectedPackage === entry.label
                        ? "rgba(245, 158, 11, 0.14)"
                        : "rgba(15, 23, 42, 0.7)",
                  }}
                >
                  <div>{entry.label}</div>
                  {entry.path ? (
                    <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                      {entry.path}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </aside>

          <div style={{ display: "grid", gap: "1.5rem" }}>
            <section
              style={{
                display: "grid",
                gap: "1rem",
                padding: "1.25rem",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                background: "rgba(15, 23, 42, 0.65)",
              }}
            >
              <h2 style={{ margin: 0 }}>Search</h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) 180px",
                  gap: "0.75rem",
                }}
              >
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="search symbols, routes, files, packages"
                  style={{
                    background: "#111827",
                    color: "#e5e7eb",
                    border: "1px solid rgba(148, 163, 184, 0.25)",
                    padding: "0.75rem 0.85rem",
                  }}
                />
                <select
                  value={searchKind}
                  onChange={(event) => setSearchKind(event.target.value)}
                  style={{
                    background: "#111827",
                    color: "#e5e7eb",
                    border: "1px solid rgba(148, 163, 184, 0.25)",
                    padding: "0.75rem 0.85rem",
                  }}
                >
                  <option value="symbol">symbol</option>
                  <option value="route">route</option>
                  <option value="file">file</option>
                  <option value="package">package</option>
                </select>
              </div>

              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "grid",
                  gap: "0.75rem",
                }}
              >
                {searchResults.map((item) => (
                  <li
                    key={`${item.kind}:${item.id}`}
                    style={{
                      padding: "0.8rem",
                      border: "1px solid rgba(148, 163, 184, 0.12)",
                      background: "rgba(17, 24, 39, 0.78)",
                    }}
                  >
                    <div style={{ color: "#f59e0b" }}>{item.kind}</div>
                    <div>{item.label}</div>
                    {item.path ? (
                      <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                        {item.path}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>

            <section
              style={{
                display: "grid",
                gap: "1rem",
                padding: "1.25rem",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                background: "rgba(15, 23, 42, 0.65)",
              }}
            >
              <h2 style={{ margin: 0 }}>Routes</h2>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "grid",
                  gap: "0.75rem",
                }}
              >
                {routes.map((route) => (
                  <li
                    key={route.id}
                    style={{
                      display: "grid",
                      gap: "0.25rem",
                      padding: "0.8rem",
                      border: "1px solid rgba(148, 163, 184, 0.12)",
                      background: "rgba(17, 24, 39, 0.78)",
                    }}
                  >
                    <div style={{ color: "#f59e0b" }}>{route.method}</div>
                    <div>{route.path}</div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </section>
      </section>
    </main>
  );
}
