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

  app.get("/health", async () => ({ ok: true }));
  app.get("/api/search", async (request) => {
    const query = String((request.query as { q?: string }).q ?? "");
    const store = openGraphStore(
      join(options.workspaceRoot, GRAPHTRACE_DB_PATH),
    );
    const engine = createQueryEngine(store);
    const result = engine.search(query);
    store.close();
    return result;
  });
  app.get("/api/routes", async () => {
    const store = openGraphStore(
      join(options.workspaceRoot, GRAPHTRACE_DB_PATH),
    );
    const engine = createQueryEngine(store);
    const result = engine.routes();
    store.close();
    return result;
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
