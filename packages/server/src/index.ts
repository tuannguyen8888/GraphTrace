import { access, readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import Fastify, { type FastifyInstance } from "fastify";

import {
  type createQueryEngine,
  withWorkspaceQueryEngine,
} from "@graphtrace/query-engine";
import type { GraphTraceDaemon } from "./daemon";

export interface GraphTraceServer {
  address: string;
  close: () => Promise<void>;
}

interface GraphTraceServerOptions {
  workspaceRoot?: string;
  daemon?: GraphTraceDaemon;
}

interface StartGraphTraceServerOptions extends GraphTraceServerOptions {
  port: number;
}

const currentModuleDir = dirname(fileURLToPath(import.meta.url));
const builtWebRoots = [
  join(currentModuleDir, "web-dist"),
  join(currentModuleDir, "..", "web-dist"),
  join(currentModuleDir, "..", "..", "web-dist"),
  join(currentModuleDir, "..", "..", "..", "web-dist"),
  join(currentModuleDir, "..", "..", "..", "apps", "web", "dist"),
];

async function readBuiltWebFile(pathParts: string[]): Promise<{
  body: string | Buffer;
  contentType: string;
} | null> {
  for (const builtWebRoot of builtWebRoots) {
    const filePath = join(builtWebRoot, ...pathParts);

    try {
      await access(filePath);
    } catch {
      continue;
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
      body: await readFile(
        filePath,
        extension === ".html" ? "utf8" : undefined,
      ),
      contentType,
    };
  }

  return null;
}

export function createGraphTraceApp(
  options: GraphTraceServerOptions,
): FastifyInstance {
  const app = Fastify();
  const daemon = options.daemon;
  const workspaceRoot = options.workspaceRoot;

  app.get("/health", async () => ({ ok: true }));
  if (workspaceRoot) {
    registerSingleWorkspaceRoutes(app, workspaceRoot, (action) =>
      withWorkspaceQueryEngine(workspaceRoot, action),
    );
  }
  registerWorkspaceScopedRoutes(app, daemon);
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
      reply.code(503);
      reply.header("content-type", "text/plain; charset=utf-8");
      return "GraphTrace web assets are missing. Run `pnpm web:build` before starting the web server.";
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
  const address = await app.listen({ host: "127.0.0.1", port: options.port });
  return {
    address,
    close: async () => {
      await app.close();
    },
  };
}

function registerSingleWorkspaceRoutes(
  app: FastifyInstance,
  workspaceRoot: string | undefined,
  withQueryEngine: <T>(
    action: (engine: ReturnType<typeof createQueryEngine>, dbPath: string) => T,
  ) => T,
): void {
  if (!workspaceRoot) {
    return;
  }

  app.get("/api/repositories", async () => {
    return withQueryEngine((engine) => engine.repositories());
  });
  app.get("/api/status", async (request) => {
    const { repository } = request.query as { repository?: string };
    return withQueryEngine((engine, dbPath) =>
      repository
        ? engine.statusByRepository(workspaceRoot, dbPath, repository)
        : engine.status(workspaceRoot, dbPath),
    );
  });
  app.get("/api/search", async (request) => {
    const { q, kind, repository } = request.query as {
      q?: string;
      kind?: string;
      repository?: string;
    };
    const query = String(q ?? "");
    return withQueryEngine((engine) =>
      repository
        ? engine.searchByRepository(repository, query, kind || undefined)
        : engine.search(query, kind || undefined),
    );
  });
  app.get("/api/routes", async (request) => {
    const packageName = String(
      (request.query as { package?: string }).package ?? "",
    );
    const repositoryId = String(
      (request.query as { repository?: string }).repository ?? "",
    );
    return withQueryEngine((engine) =>
      repositoryId
        ? engine.routesByRepository(repositoryId, packageName || undefined)
        : engine.routes(packageName || undefined),
    );
  });
  app.get("/api/packages", async (request) => {
    const repositoryId = String(
      (request.query as { repository?: string }).repository ?? "",
    );
    return withQueryEngine((engine) =>
      repositoryId
        ? engine.listPackagesByRepository(repositoryId)
        : engine.listPackages(),
    );
  });
  app.get("/api/overview", async () => {
    return withQueryEngine((engine) => engine.getPackageOverview());
  });
  app.get("/api/deps", async (request) => {
    const {
      target = "",
      direction = "both",
      depth,
      repository,
    } = request.query as {
      target?: string;
      direction?: "in" | "out" | "both";
      depth?: string;
      repository?: string;
    };
    return withQueryEngine((engine) =>
      repository
        ? engine.dependenciesByRepository(
            repository,
            target,
            direction,
            depth ? Number(depth) : undefined,
          )
        : engine.dependencies(
            target,
            direction,
            depth ? Number(depth) : undefined,
          ),
    );
  });
  app.get("/api/impact", async (request) => {
    const {
      target = "",
      depth,
      repository,
    } = request.query as {
      target?: string;
      depth?: string;
      repository?: string;
    };
    return withQueryEngine((engine) =>
      repository
        ? engine.impactByRepository(
            repository,
            target,
            depth ? Number(depth) : undefined,
          )
        : engine.impact(target, depth ? Number(depth) : undefined),
    );
  });
  app.get("/api/flow", async (request) => {
    const {
      target = "",
      depth,
      repository,
    } = request.query as {
      target?: string;
      depth?: string;
      repository?: string;
    };
    return withQueryEngine((engine) =>
      repository
        ? engine.flowByRepository(
            repository,
            target,
            depth ? Number(depth) : undefined,
          )
        : engine.flow(target, depth ? Number(depth) : undefined),
    );
  });
}

function registerWorkspaceScopedRoutes(
  app: FastifyInstance,
  daemon: GraphTraceDaemon | undefined,
): void {
  if (!daemon) {
    return;
  }

  app.get("/api/workspaces", async () => ({
    items: daemon.listWorkspaceSummaries(),
  }));

  app.post("/api/workspaces", async (request, reply) => {
    const body = (request.body ?? {}) as {
      rootPath?: string;
      label?: string;
    };

    if (!body.rootPath?.trim()) {
      reply.code(400);
      return {
        error: "root_path_required",
      };
    }

    const workspace = await daemon.addWorkspace(body.rootPath, {
      label: body.label?.trim() || undefined,
    });
    reply.code(201);
    return workspace;
  });

  app.delete("/api/workspaces/:workspaceId", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const workspace = daemon.getWorkspace(workspaceId);

    if (!workspace) {
      reply.code(404);
      return {
        error: "workspace_not_found",
      };
    }

    daemon.removeWorkspace(workspaceId);
    return {
      ok: true,
    };
  });

  app.get("/api/workspaces/:workspaceId/repositories", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    return daemon.withWorkspaceQueryEngine(workspaceId, (engine) =>
      engine.repositories(),
    );
  });

  app.get("/api/workspaces/:workspaceId/status", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { repository } = request.query as { repository?: string };
    return daemon.status(workspaceId, repository);
  });

  app.get("/api/workspaces/:workspaceId/search", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { q, kind, repository } = request.query as {
      q?: string;
      kind?: string;
      repository?: string;
    };

    return daemon.withWorkspaceQueryEngine(workspaceId, (engine) =>
      repository
        ? engine.searchByRepository(
            repository,
            String(q ?? ""),
            kind || undefined,
          )
        : engine.search(String(q ?? ""), kind || undefined),
    );
  });

  app.get("/api/workspaces/:workspaceId/routes", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { package: packageName, repository } = request.query as {
      package?: string;
      repository?: string;
    };

    return daemon.withWorkspaceQueryEngine(workspaceId, (engine) =>
      repository
        ? engine.routesByRepository(repository, packageName || undefined)
        : engine.routes(packageName || undefined),
    );
  });

  app.get("/api/workspaces/:workspaceId/packages", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { repository } = request.query as {
      repository?: string;
    };

    return daemon.withWorkspaceQueryEngine(workspaceId, (engine) =>
      repository
        ? engine.listPackagesByRepository(repository)
        : engine.listPackages(),
    );
  });

  app.get("/api/workspaces/:workspaceId/deps", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const {
      target = "",
      direction = "both",
      depth,
      repository,
    } = request.query as {
      target?: string;
      direction?: "in" | "out" | "both";
      depth?: string;
      repository?: string;
    };

    return daemon.withWorkspaceQueryEngine(workspaceId, (engine) =>
      repository
        ? engine.dependenciesByRepository(
            repository,
            target,
            direction,
            depth ? Number(depth) : undefined,
          )
        : engine.dependencies(
            target,
            direction,
            depth ? Number(depth) : undefined,
          ),
    );
  });

  app.get("/api/workspaces/:workspaceId/impact", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const {
      target = "",
      depth,
      repository,
    } = request.query as {
      target?: string;
      depth?: string;
      repository?: string;
    };

    return daemon.withWorkspaceQueryEngine(workspaceId, (engine) =>
      repository
        ? engine.impactByRepository(
            repository,
            target,
            depth ? Number(depth) : undefined,
          )
        : engine.impact(target, depth ? Number(depth) : undefined),
    );
  });

  app.get("/api/workspaces/:workspaceId/flow", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const {
      target = "",
      depth,
      repository,
    } = request.query as {
      target?: string;
      depth?: string;
      repository?: string;
    };

    return daemon.withWorkspaceQueryEngine(workspaceId, (engine) =>
      repository
        ? engine.flowByRepository(
            repository,
            target,
            depth ? Number(depth) : undefined,
          )
        : engine.flow(target, depth ? Number(depth) : undefined),
    );
  });
}

export * from "./daemon";
