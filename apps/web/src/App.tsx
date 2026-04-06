import { useEffect, useState } from "react";

interface RouteSummary {
  id: string;
  method: string;
  path: string;
}

export function App() {
  const [routes, setRoutes] = useState<RouteSummary[]>([]);

  useEffect(() => {
    void fetch("/api/routes")
      .then(async (response) => response.json())
      .then((payload: { items?: RouteSummary[] }) => {
        setRoutes(payload.items ?? []);
      })
      .catch(() => {
        setRoutes([]);
      });
  }, []);

  return (
    <main
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        padding: "2rem",
      }}
    >
      <h1>GraphTrace</h1>
      <p>Local-first code graph and agent context for JS/TS monorepos.</p>
      <section>
        <h2>Routes</h2>
        <ul>
          {routes.map((route) => (
            <li key={route.id}>
              {route.method} {route.path}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
