import { access, readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import Fastify, { type FastifyInstance } from "fastify";

import { createQueryEngine } from "@graphtrace/query-engine";
import { GRAPHTRACE_DB_PATH } from "@graphtrace/shared";
import { openGraphStore } from "@graphtrace/storage";

export interface GraphTraceServer {
  address: string;
  close: () => Promise<void>;
}

interface GraphTraceServerOptions {
  workspaceRoot: string;
}

interface StartGraphTraceServerOptions extends GraphTraceServerOptions {
  port: number;
}

const serverPackageRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const builtWebRoot = join(serverPackageRoot, "apps", "web", "dist");

function withQueryEngineForWorkspace(workspaceRoot: string) {
  return <T>(
    action: (engine: ReturnType<typeof createQueryEngine>) => T,
  ): T => {
    const store = openGraphStore(join(workspaceRoot, GRAPHTRACE_DB_PATH));
    const engine = createQueryEngine(store);

    try {
      return action(engine);
    } finally {
      store.close();
    }
  };
}

async function readBuiltWebFile(pathParts: string[]): Promise<{
  body: string | Buffer;
  contentType: string;
} | null> {
  const filePath = join(builtWebRoot, ...pathParts);

  try {
    await access(filePath);
  } catch {
    return null;
  }

  const extension = extname(filePath);
  const contentType =
    extension === ".js"
      ? "text/javascript; charset=utf-8"
      : extension === ".css"
        ? "text/css; charset=utf-8"
        : extension === ".html"
          ? "text/html; charset=utf-8"
          : "application/octet-stream";

  return {
    body: await readFile(filePath, extension === ".html" ? "utf8" : undefined),
    contentType,
  };
}

export function createGraphTraceApp(
  options: GraphTraceServerOptions,
): FastifyInstance {
  const app = Fastify();
  const withQueryEngine = withQueryEngineForWorkspace(options.workspaceRoot);

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
  app.get("/assets/*", async (request, reply) => {
    const rawPath = String((request.params as { "*": string })["*"] ?? "");
    const assetPath = normalize(rawPath).replace(/^(\.\.(\/|\\|$))+/, "");
    const asset = await readBuiltWebFile(["assets", assetPath]);

    if (!asset) {
      reply.code(404);
      return { error: "asset_not_found" };
    }

    reply.header("content-type", asset.contentType);
    return asset.body;
  });
  app.get("/", async (_request, reply) => {
    const html = await readBuiltWebFile(["index.html"]);

    if (!html || typeof html.body !== "string") {
      reply.header("content-type", "text/html; charset=utf-8");
      return "<!doctype html><html><body><h1>GraphTrace</h1></body></html>";
    }

    reply.header("content-type", html.contentType);
    return html.body;
  });

  return app;
}

export async function startGraphTraceServer(
  options: StartGraphTraceServerOptions,
): Promise<GraphTraceServer> {
  const app = createGraphTraceApp(options);

  await app.listen({ host: "127.0.0.1", port: options.port });
  return {
    address: `http://127.0.0.1:${options.port}`,
    close: async () => {
      await app.close();
    },
  };
}
