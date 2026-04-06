import { readFile } from "node:fs/promises";
import { join } from "node:path";

import Fastify from "fastify";

import { createQueryEngine } from "@graphtrace/query-engine";
import { GRAPHTRACE_DB_PATH } from "@graphtrace/shared";
import { openGraphStore } from "@graphtrace/storage";

export interface GraphTraceServer {
  address: string;
  close: () => Promise<void>;
}

export async function startGraphTraceServer(options: {
  workspaceRoot: string;
  port: number;
}): Promise<GraphTraceServer> {
  const app = Fastify();

  const withQueryEngine = <T>(
    action: (engine: ReturnType<typeof createQueryEngine>) => T,
  ): T => {
    const store = openGraphStore(
      join(options.workspaceRoot, GRAPHTRACE_DB_PATH),
    );
    const engine = createQueryEngine(store);

    try {
      return action(engine);
    } finally {
      store.close();
    }
  };

  app.get("/health", async () => ({ ok: true }));
  app.get("/api/search", async (request) => {
    const { q, kind } = request.query as { q?: string; kind?: string };
    const query = String(q ?? "");
    return withQueryEngine((engine) => engine.search(query, kind || undefined));
  });
  app.get("/api/routes", async (request) => {
    const packageName = String(
      (request.query as { package?: string }).package ?? "",
    );
    return withQueryEngine((engine) => engine.routes(packageName || undefined));
  });
  app.get("/api/packages", async () => {
    return withQueryEngine((engine) => engine.listPackages());
  });
  app.get("/api/overview", async () => {
    return withQueryEngine((engine) => engine.getPackageOverview());
  });
  app.get("/api/deps", async (request) => {
    const {
      target = "",
      direction = "both",
      depth,
    } = request.query as {
      target?: string;
      direction?: "in" | "out" | "both";
      depth?: string;
    };
    return withQueryEngine((engine) =>
      engine.dependencies(target, direction, depth ? Number(depth) : undefined),
    );
  });
  app.get("/api/impact", async (request) => {
    const { target = "", depth } = request.query as {
      target?: string;
      depth?: string;
    };
    return withQueryEngine((engine) =>
      engine.impact(target, depth ? Number(depth) : undefined),
    );
  });
  app.get("/api/flow", async (request) => {
    const { target = "", depth } = request.query as {
      target?: string;
      depth?: string;
    };
    return withQueryEngine((engine) =>
      engine.flow(target, depth ? Number(depth) : undefined),
    );
  });
  app.get("/", async () => {
    try {
      return await readFile(
        join(options.workspaceRoot, "apps/web/index.html"),
        "utf8",
      );
    } catch {
      return "<!doctype html><html><body><h1>GraphTrace</h1></body></html>";
    }
  });

  await app.listen({ host: "127.0.0.1", port: options.port });
  return {
    address: `http://127.0.0.1:${options.port}`,
    close: async () => {
      await app.close();
    },
  };
}
