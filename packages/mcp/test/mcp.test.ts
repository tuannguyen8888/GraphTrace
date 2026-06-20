import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, test } from "vitest";

import { ensureWorkspaceInitialized } from "@graphtrace/config";
import { indexWorkspace } from "@graphtrace/indexer";
import { createGraphTraceDaemon } from "@graphtrace/server";

const repoRoot = process.cwd();
const fixtureRoot = join(repoRoot, "fixtures", "express-prisma-workspace");
const symbolGraphFixtureRoot = join(
  repoRoot,
  "fixtures",
  "symbol-graph-workspace",
);
const laravelFixtureRoot = join(repoRoot, "fixtures", "laravel-workspace");
const mixedFixtureRoot = join(repoRoot, "fixtures", "mixed-workspace");
const cliEntry = join(repoRoot, "packages", "cli", "src", "bin.ts");
const mcpEntry = join(repoRoot, "packages", "mcp", "src", "index.ts");

interface ToolGraphItem {
  id?: string;
  kind?: string;
  label?: string;
  path?: string;
  filePath?: string;
  method?: string;
}

function readToolItems(payload: unknown): ToolGraphItem[] {
  return (payload as { items?: ToolGraphItem[] } | undefined)?.items ?? [];
}

function readToolText(payload: unknown): string {
  return (payload as { content?: Array<{ text?: string }> } | undefined)
    ?.content?.[0]?.text
    ? String(
        (payload as { content?: Array<{ text?: string }> }).content?.[0]?.text,
      )
    : "";
}

async function createTempGitWorkspaceFromFixture(fixturePath: string) {
  const sandboxRoot = await mkdtemp(
    join(tmpdir(), "graphtrace-worktree-fixture-"),
  );
  const repoRoot = join(sandboxRoot, "repo");
  await mkdir(repoRoot, { recursive: true });
  await cp(fixturePath, repoRoot, { recursive: true });
  execFileSync("git", ["init"], { cwd: repoRoot, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "GraphTrace Test"], {
    cwd: repoRoot,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.email", "graphtrace@example.com"], {
    cwd: repoRoot,
    stdio: "ignore",
  });
  execFileSync("git", ["add", "."], { cwd: repoRoot, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "init"], {
    cwd: repoRoot,
    stdio: "ignore",
  });

  return {
    sandboxRoot,
    repoRoot,
    cleanup: () => rm(sandboxRoot, { recursive: true, force: true }),
  };
}

describe("mcp", () => {
  test("exposes the GraphTrace MCP toolset over stdio", async () => {
    await ensureWorkspaceInitialized(fixtureRoot);
    await indexWorkspace({ workspaceRoot: fixtureRoot, full: true });
    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-mcp-home-"));
    const daemon = createGraphTraceDaemon({ homeDir });

    const transport = new StdioClientTransport({
      command: "pnpm",
      args: [
        "exec",
        "node",
        "--import",
        "tsx",
        cliEntry,
        "mcp",
        "--home",
        homeDir,
      ],
      cwd: fixtureRoot,
      stderr: "pipe",
    });
    let stderr = "";

    transport.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const client = new Client(
      {
        name: "graphtrace-test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    try {
      await daemon.addWorkspace(fixtureRoot, {
        label: "fixture",
      });
      await client.connect(transport);

      const tools = await client.listTools();

      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        "add_workspace",
        "find_relevant_context",
        "get_data_flow",
        "get_dependencies",
        "get_impact_analysis",
        "get_package_overview",
        "get_routes",
        "get_status",
        "get_symbol_context",
        "graphtrace_explain_edge",
        "graphtrace_get_execution_context",
        "graphtrace_get_symbol",
        "graphtrace_get_symbol_impact",
        "graphtrace_search_symbols",
        "list_packages",
        "list_workspaces",
        "reindex_workspace",
        "remove_workspace",
        "run_index",
        "search_code",
      ]);

      const search = await client.callTool({
        name: "search_code",
        arguments: { query: "users" },
      });
      const searchVerbose = await client.callTool({
        name: "search_code",
        arguments: { query: "users", verbose: true },
      });
      const symbolContext = await client.callTool({
        name: "get_symbol_context",
        arguments: { query: "listUsers" },
      });
      const dependencies = await client.callTool({
        name: "get_dependencies",
        arguments: {
          target: "apps/api/src/services/user-service.ts",
          direction: "in",
          depth: 2,
        },
      });
      const impact = await client.callTool({
        name: "get_impact_analysis",
        arguments: {
          target: "apps/api/src/services/user-service.ts",
          depth: 4,
        },
      });
      const flow = await client.callTool({
        name: "get_data_flow",
        arguments: {
          target: "GET /users",
          depth: 4,
        },
      });
      const routes = await client.callTool({
        name: "get_routes",
        arguments: {},
      });
      const status = await client.callTool({
        name: "get_status",
        arguments: {},
      });
      const statusVerbose = await client.callTool({
        name: "get_status",
        arguments: { verbose: true },
      });
      const routesVerbose = await client.callTool({
        name: "get_routes",
        arguments: { verbose: true },
      });
      const reindex = await client.callTool({
        name: "run_index",
        arguments: {
          mode: "incremental",
        },
      });
      const packages = await client.callTool({
        name: "list_packages",
        arguments: {},
      });
      const overview = await client.callTool({
        name: "get_package_overview",
        arguments: {},
      });
      const searchItems = readToolItems(search.structuredContent);
      const symbolContextItems = readToolItems(symbolContext.structuredContent);
      const dependencyItems = readToolItems(dependencies.structuredContent);
      const impactItems = readToolItems(impact.structuredContent);
      const flowItems = readToolItems(flow.structuredContent);
      const routeItems = readToolItems(routes.structuredContent);
      const routePayload = routes.structuredContent as {
        summary?: {
          compact?: boolean;
          totalItems?: number;
          returnedItems?: number;
        };
      };
      const searchPayload = search.structuredContent as {
        summary?: {
          compact?: boolean;
          totalItems?: number;
          returnedItems?: number;
        };
      };
      const searchVerbosePayload = searchVerbose.structuredContent as {
        summary?: unknown;
        items?: unknown[];
      };
      const statusPayload = status.structuredContent as {
        workspaceRoot?: string;
        counts?: {
          routeCount?: number;
        };
        summary?: {
          compact?: boolean;
          unitCount?: number;
        };
        units?: unknown[];
      };
      const statusVerbosePayload = statusVerbose.structuredContent as {
        units?: unknown[];
      };
      const routesVerbosePayload = routesVerbose.structuredContent as {
        items?: unknown[];
      };
      const reindexPayload = reindex.structuredContent as {
        summary?: {
          routeCount?: number;
        };
      };
      const packageItems = readToolItems(packages.structuredContent);
      const overviewItems = readToolItems(overview.structuredContent);

      expect(search.isError).not.toBe(true);
      expect(searchPayload.summary).toMatchObject({
        compact: true,
        totalItems: expect.any(Number),
        returnedItems: expect.any(Number),
      });
      expect(searchVerbosePayload.summary).toBeUndefined();
      expect(searchVerbosePayload.items?.length).toBeGreaterThanOrEqual(
        searchPayload.summary?.totalItems ?? 0,
      );
      expect(searchItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "route",
            id: "GET /users",
          }),
        ]),
      );
      expect(symbolContext.isError).not.toBe(true);
      expect(symbolContextItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.stringContaining("listUsers"),
          }),
        ]),
      );
      expect(dependencies.isError).not.toBe(true);
      expect(dependencyItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.stringContaining("server.ts"),
          }),
        ]),
      );
      expect(
        dependencyItems.some(
          (item) =>
            typeof item.path === "string" && item.path.includes("db/client.ts"),
        ),
      ).toBe(false);
      expect(impact.isError).not.toBe(true);
      expect(impactItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "route",
            id: "GET /users",
          }),
        ]),
      );
      expect(flow.isError).not.toBe(true);
      expect(flowItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "query",
          }),
        ]),
      );
      expect(routes.isError).not.toBe(true);
      expect(routePayload.summary).toMatchObject({
        compact: true,
        totalItems: expect.any(Number),
        returnedItems: expect.any(Number),
      });
      expect(routeItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "GET",
            path: "/users",
          }),
        ]),
      );
      expect(status.isError).not.toBe(true);
      expect(statusPayload.workspaceRoot).toBe(fixtureRoot);
      expect(statusPayload.counts?.routeCount).toBe(1);
      expect(statusPayload.units).toBeUndefined();
      expect(statusPayload.summary).toMatchObject({
        compact: true,
        unitCount: expect.any(Number),
      });
      expect(statusVerbosePayload.units?.length).toBeGreaterThan(0);
      expect(routesVerbosePayload.items?.length).toBeGreaterThanOrEqual(
        routePayload.summary?.totalItems ?? 0,
      );
      expect(reindex.isError).not.toBe(true);
      expect(reindexPayload.summary?.routeCount).toBe(1);
      expect(packages.isError).not.toBe(true);
      expect(packageItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: "@fixture/api",
          }),
        ]),
      );
      expect(overview.isError).not.toBe(true);
      expect(overviewItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: "@fixture/api",
          }),
        ]),
      );
    } catch (error) {
      throw new Error(
        `MCP integration failed.\nSTDERR:\n${stderr || "<empty>"}\nCAUSE:${error instanceof Error ? ` ${error.message}` : ` ${String(error)}`}`,
      );
    } finally {
      await transport.close().catch(() => undefined);
      daemon.close();
    }
  }, 20_000);

  test("finds relevant context in a JS/TS workspace", async () => {
    await ensureWorkspaceInitialized(fixtureRoot);
    await indexWorkspace({ workspaceRoot: fixtureRoot, full: true });
    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-mcp-home-"));
    const daemon = createGraphTraceDaemon({ homeDir });

    const transport = new StdioClientTransport({
      command: "pnpm",
      args: [
        "exec",
        "node",
        "--import",
        "tsx",
        cliEntry,
        "mcp",
        "--home",
        homeDir,
      ],
      cwd: fixtureRoot,
      stderr: "pipe",
    });
    const client = new Client(
      {
        name: "graphtrace-triage-js-test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    try {
      await daemon.addWorkspace(fixtureRoot, {
        label: "fixture",
      });
      await client.connect(transport);

      const triage = await client.callTool({
        name: "find_relevant_context",
        arguments: {
          query: "Find the users route and listUsers handler context",
        },
      });
      const payload = triage.structuredContent as {
        freshness?: { state?: string };
        searches?: Array<{ query?: string; kind?: string }>;
        confidence?: { label?: string; score?: number };
        candidates?: {
          routes?: Array<{ method?: string; path?: string }>;
          symbols?: Array<{ id?: string; path?: string }>;
          files?: Array<{ path?: string }>;
        };
        nextActions?: string[];
      };

      expect(triage.isError).not.toBe(true);
      expect(payload.freshness?.state).toBe("fresh");
      expect(payload.searches?.length).toBeGreaterThan(1);
      expect(payload.confidence?.score).toBeGreaterThan(0);
      expect(payload.candidates?.routes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ method: "GET", path: "/users" }),
        ]),
      );
      expect(payload.candidates?.symbols).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: expect.stringContaining("listUsers") }),
        ]),
      );
      expect(payload.nextActions).toEqual(
        expect.arrayContaining([
          expect.stringContaining("graphtrace_get_symbol"),
        ]),
      );
    } finally {
      await transport.close().catch(() => undefined);
      daemon.close();
    }
  }, 20_000);

  test("finds relevant context in a PHP/Laravel workspace", async () => {
    await ensureWorkspaceInitialized(laravelFixtureRoot);
    await indexWorkspace({ workspaceRoot: laravelFixtureRoot, full: true });
    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-mcp-home-"));
    const daemon = createGraphTraceDaemon({ homeDir });

    const transport = new StdioClientTransport({
      command: "pnpm",
      args: [
        "exec",
        "node",
        "--import",
        "tsx",
        cliEntry,
        "mcp",
        "--home",
        homeDir,
      ],
      cwd: laravelFixtureRoot,
      stderr: "pipe",
    });
    const client = new Client(
      {
        name: "graphtrace-triage-php-test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    try {
      await daemon.addWorkspace(laravelFixtureRoot, {
        label: "laravel-fixture",
      });
      await client.connect(transport);

      const triage = await client.callTool({
        name: "find_relevant_context",
        arguments: {
          query:
            "Find Laravel users route controller and UserService listUsers",
        },
      });
      const payload = triage.structuredContent as {
        freshness?: { state?: string };
        searches?: Array<{ query?: string; kind?: string }>;
        confidence?: { label?: string; score?: number };
        candidates?: {
          routes?: Array<{ method?: string; path?: string }>;
          symbols?: Array<{ id?: string; path?: string }>;
          files?: Array<{ path?: string }>;
        };
        nextActions?: string[];
      };

      expect(triage.isError).not.toBe(true);
      expect(payload.freshness?.state).toBe("fresh");
      expect(payload.searches?.some((search) => search.kind === "route")).toBe(
        true,
      );
      expect(payload.confidence?.label).not.toBe("low");
      expect(payload.candidates?.routes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ method: "GET", path: "/users" }),
        ]),
      );
      expect(payload.candidates?.symbols).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining("UserService.php"),
          }),
        ]),
      );
      expect(payload.nextActions).toEqual(
        expect.arrayContaining([expect.stringContaining("search_code")]),
      );
    } finally {
      await transport.close().catch(() => undefined);
      daemon.close();
    }
  }, 20_000);

  test("serves multiple registered workspaces from one MCP home and resolves workspace scope explicitly", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-mcp-home-"));
    const daemon = createGraphTraceDaemon({ homeDir });

    try {
      const graphtrace = await daemon.addWorkspace(repoRoot, {
        label: "GraphTrace",
      });
      const fixture = await daemon.addWorkspace(fixtureRoot, {
        label: "fixture",
      });

      const transport = new StdioClientTransport({
        command: "pnpm",
        args: [
          "exec",
          "node",
          "--import",
          "tsx",
          cliEntry,
          "mcp",
          "--home",
          homeDir,
        ],
        cwd: repoRoot,
        stderr: "pipe",
      });
      const client = new Client(
        {
          name: "graphtrace-multi-workspace-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        },
      );

      try {
        await client.connect(transport);

        const workspaces = await client.callTool({
          name: "list_workspaces",
          arguments: {},
        });
        const graphtraceSearch = await client.callTool({
          name: "search_code",
          arguments: {
            query: "runCli",
            workspaceId: graphtrace.id,
          },
        });
        const autoResolvedSymbol = await client.callTool({
          name: "graphtrace_get_symbol",
          arguments: {
            filePath: "packages/server/src/index.ts",
            symbolName: "registerSingleWorkspaceRoutes",
          },
        });
        const cwdRoutes = await client.callTool({
          name: "get_routes",
          arguments: {},
        });

        const workspaceItems = readToolItems(workspaces.structuredContent);
        const graphtraceItems = readToolItems(
          graphtraceSearch.structuredContent,
        );
        const autoResolvedItems = readToolItems(
          autoResolvedSymbol.structuredContent,
        );

        expect(workspaces.isError).not.toBe(true);
        expect(workspaceItems).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: graphtrace.id, label: "GraphTrace" }),
            expect.objectContaining({ id: fixture.id, label: "fixture" }),
          ]),
        );
        expect(graphtraceSearch.isError).not.toBe(true);
        expect(
          graphtraceItems.some((item) => item.id?.includes("runCli")),
        ).toBe(true);
        expect(autoResolvedSymbol.isError).not.toBe(true);
        expect(
          autoResolvedItems.some(
            (item) =>
              item.id?.includes("registerSingleWorkspaceRoutes") &&
              item.filePath?.includes("packages/server/src/index.ts"),
          ),
        ).toBe(true);
        expect(cwdRoutes.isError).not.toBe(true);
      } finally {
        await transport.close().catch(() => undefined);
      }
    } finally {
      daemon.close();
    }
  }, 30_000);

  test("exposes symbol search and lookup tools", async () => {
    await ensureWorkspaceInitialized(symbolGraphFixtureRoot);
    await indexWorkspace({ workspaceRoot: symbolGraphFixtureRoot, full: true });
    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-mcp-home-"));
    const daemon = createGraphTraceDaemon({ homeDir });

    const transport = new StdioClientTransport({
      command: "pnpm",
      args: [
        "exec",
        "node",
        "--import",
        "tsx",
        cliEntry,
        "mcp",
        "--home",
        homeDir,
      ],
      cwd: symbolGraphFixtureRoot,
      stderr: "pipe",
    });
    const client = new Client(
      {
        name: "graphtrace-symbol-test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    try {
      await daemon.addWorkspace(symbolGraphFixtureRoot, {
        label: "symbol-fixture",
      });
      await client.connect(transport);

      const search = await client.callTool({
        name: "graphtrace_search_symbols",
        arguments: { query: "report" },
      });
      const getSymbol = await client.callTool({
        name: "graphtrace_get_symbol",
        arguments: {
          filePath: "apps/api/src/services/user-service.ts",
          symbolName: "createReporter",
        },
      });
      const execution = await client.callTool({
        name: "graphtrace_get_execution_context",
        arguments: {
          symbolId: "symbol:apps/api/src/services/user-service.ts#listUsers",
          maxNodes: 10,
          maxEdges: 10,
        },
      });
      const impact = await client.callTool({
        name: "graphtrace_get_symbol_impact",
        arguments: {
          symbolId: "symbol:apps/api/src/routes/users.ts#auditedListUsers",
          maxNodes: 2,
          maxEdges: 1,
        },
      });
      const edge = await client.callTool({
        name: "graphtrace_explain_edge",
        arguments: {
          edgeId:
            "edge:routes_to:GET /users->symbol:apps/api/src/routes/users.ts#auditedListUsers",
        },
      });

      const searchPayload = search.structuredContent as {
        items?: Array<{ id?: string; kind?: string }>;
        graph?: {
          summary?: {
            nodeCount?: number;
          };
        };
      };
      const getSymbolPayload = getSymbol.structuredContent as {
        items?: Array<{ id?: string; filePath?: string }>;
        graph?: {
          nodes?: Array<{ id?: string }>;
        };
      };
      const executionPayload = execution.structuredContent as {
        confidenceSummary?: {
          label?: string;
          signals?: string[];
          recommendedVerification?: string[];
        };
        graph?: {
          nodes?: Array<{ id?: string; kind?: string }>;
        };
      };
      const impactPayload = impact.structuredContent as {
        graph?: {
          summary?: {
            truncated?: {
              nodeLimitReached?: boolean;
            };
          };
        };
      };
      const edgePayload = edge.structuredContent as {
        id?: string;
        provenance?: {
          kind?: string;
        };
      };

      expect(search.isError).not.toBe(true);
      expect(searchPayload.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "symbol:apps/api/src/services/user-service.ts#createReporter",
            kind: "function",
          }),
        ]),
      );
      expect(searchPayload.graph?.summary?.nodeCount).toBeGreaterThanOrEqual(1);
      expect(getSymbol.isError).not.toBe(true);
      expect(getSymbolPayload.items).toEqual([
        expect.objectContaining({
          id: "symbol:apps/api/src/services/user-service.ts#createReporter",
        }),
      ]);
      expect(getSymbolPayload.graph?.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "symbol:apps/api/src/services/user-service.ts#createReporter",
          }),
        ]),
      );
      expect(execution.isError).not.toBe(true);
      expect(executionPayload.confidenceSummary?.signals).toEqual(
        expect.arrayContaining(["proven", "inferred-strong"]),
      );
      expect(
        executionPayload.confidenceSummary?.recommendedVerification,
      ).toEqual(
        expect.arrayContaining([
          expect.stringContaining("graphtrace_explain_edge"),
        ]),
      );
      expect(executionPayload.graph?.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "GET /users",
            kind: "route",
          }),
        ]),
      );
      expect(impact.isError).not.toBe(true);
      expect(impactPayload.graph?.summary?.truncated?.nodeLimitReached).toBe(
        true,
      );
      expect(edge.isError).not.toBe(true);
      expect(edgePayload).toMatchObject({
        id: "edge:routes_to:GET /users->symbol:apps/api/src/routes/users.ts#auditedListUsers",
        provenance: {
          kind: "route-handler",
        },
      });
    } finally {
      await transport.close().catch(() => undefined);
      daemon.close();
    }
  }, 20_000);

  test("returns laravel execution context and data flow through MCP tools", async () => {
    await ensureWorkspaceInitialized(laravelFixtureRoot);
    await indexWorkspace({ workspaceRoot: laravelFixtureRoot, full: true });

    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-mcp-home-"));
    const daemon = createGraphTraceDaemon({ homeDir });

    const transport = new StdioClientTransport({
      command: "pnpm",
      args: [
        "exec",
        "node",
        "--import",
        "tsx",
        cliEntry,
        "mcp",
        "--home",
        homeDir,
      ],
      cwd: laravelFixtureRoot,
      stderr: "pipe",
    });
    const client = new Client(
      {
        name: "graphtrace-laravel-mcp-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    try {
      await daemon.addWorkspace(laravelFixtureRoot, {
        label: "laravel",
      });
      await client.connect(transport);

      const execution = await client.callTool({
        name: "graphtrace_get_execution_context",
        arguments: {
          symbolId:
            "symbol:app/Http/Controllers/UserController.php#UserController.index",
        },
      });
      const flow = await client.callTool({
        name: "get_data_flow",
        arguments: {
          target: "GET /users",
          depth: 4,
        },
      });

      const executionItems = readToolItems(execution.structuredContent);
      const flowItems = readToolItems(flow.structuredContent);

      expect(execution.isError).not.toBe(true);
      expect(executionItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "GET /users",
            kind: "route",
          }),
          expect.objectContaining({
            id: "symbol:app/Services/UserService.php#UserService.listUsers",
            kind: "symbol",
          }),
          expect.objectContaining({
            kind: "query",
            id: expect.stringContaining(
              "User::query()->where('active', true)->get(",
            ),
          }),
        ]),
      );
      expect(flow.isError).not.toBe(true);
      expect(flowItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "query",
            id: expect.stringContaining(
              "User::query()->where('active', true)->get(",
            ),
          }),
        ]),
      );
    } finally {
      await transport.close().catch(() => undefined);
      daemon.close();
    }
  }, 20_000);

  test("adds confidence summaries for partial-indexing search results", async () => {
    await ensureWorkspaceInitialized(mixedFixtureRoot);
    await indexWorkspace({ workspaceRoot: mixedFixtureRoot, full: true });
    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-mcp-home-"));
    const daemon = createGraphTraceDaemon({ homeDir });

    const transport = new StdioClientTransport({
      command: "pnpm",
      args: [
        "exec",
        "node",
        "--import",
        "tsx",
        cliEntry,
        "mcp",
        "--home",
        homeDir,
      ],
      cwd: mixedFixtureRoot,
      stderr: "pipe",
    });
    const client = new Client(
      {
        name: "graphtrace-confidence-partial-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    try {
      await daemon.addWorkspace(mixedFixtureRoot, { label: "mixed" });
      await client.connect(transport);

      const search = await client.callTool({
        name: "search_code",
        arguments: { query: "server" },
      });
      const payload = search.structuredContent as {
        confidenceSummary?: {
          label?: string;
          signals?: string[];
          recommendedVerification?: string[];
        };
      };

      expect(search.isError).not.toBe(true);
      expect(payload.confidenceSummary).toMatchObject({
        label: "low",
      });
      expect(payload.confidenceSummary?.signals).toEqual(
        expect.arrayContaining(["partial", "shallow"]),
      );
      expect(payload.confidenceSummary?.recommendedVerification).toEqual(
        expect.arrayContaining([
          expect.stringContaining("shallow metadata only"),
        ]),
      );
    } finally {
      await transport.close().catch(() => undefined);
      daemon.close();
    }
  }, 20_000);

  test("prefers the MCP startup cwd when multiple registered workspaces exist", async () => {
    await ensureWorkspaceInitialized(fixtureRoot);
    await ensureWorkspaceInitialized(symbolGraphFixtureRoot);
    await indexWorkspace({ workspaceRoot: fixtureRoot, full: true });
    await indexWorkspace({ workspaceRoot: symbolGraphFixtureRoot, full: true });
    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-mcp-home-"));
    const daemon = createGraphTraceDaemon({ homeDir });

    const transport = new StdioClientTransport({
      command: "pnpm",
      args: [
        "exec",
        "node",
        "--import",
        "tsx",
        cliEntry,
        "mcp",
        "--home",
        homeDir,
      ],
      cwd: symbolGraphFixtureRoot,
      stderr: "pipe",
    });
    const client = new Client(
      {
        name: "graphtrace-test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    try {
      await daemon.addWorkspace(fixtureRoot, { label: "fixture" });
      await daemon.addWorkspace(symbolGraphFixtureRoot, { label: "symbols" });
      await client.connect(transport);

      const status = await client.callTool({
        name: "get_status",
        arguments: {},
      });
      const payload = status.structuredContent as { workspaceRoot?: string };

      expect(status.isError).not.toBe(true);
      expect(payload.workspaceRoot).toBe(symbolGraphFixtureRoot);
    } finally {
      await client.close().catch(() => undefined);
      await transport.close().catch(() => undefined);
      daemon.close();
    }
  }, 20_000);

  test("resolves unique symbolName-only MCP graph lookups", async () => {
    await ensureWorkspaceInitialized(symbolGraphFixtureRoot);
    await indexWorkspace({ workspaceRoot: symbolGraphFixtureRoot, full: true });
    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-mcp-home-"));
    const daemon = createGraphTraceDaemon({ homeDir });

    const transport = new StdioClientTransport({
      command: "pnpm",
      args: [
        "exec",
        "node",
        "--import",
        "tsx",
        cliEntry,
        "mcp",
        "--home",
        homeDir,
      ],
      cwd: symbolGraphFixtureRoot,
      stderr: "pipe",
    });
    const client = new Client(
      {
        name: "graphtrace-test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    try {
      await daemon.addWorkspace(symbolGraphFixtureRoot, { label: "symbols" });
      await client.connect(transport);

      const execution = await client.callTool({
        name: "graphtrace_get_execution_context",
        arguments: {
          symbolName: "listUsers",
          maxNodes: 10,
          maxEdges: 10,
        },
      });
      const impact = await client.callTool({
        name: "graphtrace_get_symbol_impact",
        arguments: {
          symbolName: "auditedListUsers",
          maxNodes: 2,
          maxEdges: 1,
        },
      });
      const executionPayload = execution.structuredContent as {
        graph?: { nodes?: Array<{ id?: string; kind?: string }> };
      };
      const impactPayload = impact.structuredContent as {
        graph?: { summary?: { truncated?: { nodeLimitReached?: boolean } } };
      };

      expect(execution.isError).not.toBe(true);
      expect(executionPayload.graph?.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "GET /users",
            kind: "route",
          }),
        ]),
      );
      expect(impact.isError).not.toBe(true);
      expect(impactPayload.graph?.summary?.truncated?.nodeLimitReached).toBe(
        true,
      );
    } finally {
      await client.close().catch(() => undefined);
      await transport.close().catch(() => undefined);
      daemon.close();
    }
  }, 20_000);

  test("prefers the active worktree over the base repo and ranks list_workspaces by cwd", async () => {
    const fixture = await createTempGitWorkspaceFromFixture(fixtureRoot);
    const worktreeRoot = join(fixture.sandboxRoot, "repo-worktree");
    execFileSync(
      "git",
      ["worktree", "add", "-b", "feature/triage", worktreeRoot],
      {
        cwd: fixture.repoRoot,
        stdio: "ignore",
      },
    );
    await ensureWorkspaceInitialized(fixture.repoRoot);
    await ensureWorkspaceInitialized(worktreeRoot);
    await indexWorkspace({ workspaceRoot: fixture.repoRoot, full: true });
    await indexWorkspace({ workspaceRoot: worktreeRoot, full: true });
    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-mcp-home-"));
    const daemon = createGraphTraceDaemon({ homeDir });

    const transport = new StdioClientTransport({
      command: "pnpm",
      args: [
        "exec",
        "node",
        "--import",
        "tsx",
        "--eval",
        `process.chdir(${JSON.stringify(worktreeRoot)}); const { createGraphTraceMcpServer } = await import(${JSON.stringify(mcpEntry)}); await createGraphTraceMcpServer({ homeDir: ${JSON.stringify(homeDir)}, workspaceRoot: ${JSON.stringify(worktreeRoot)} });`,
      ],
      cwd: repoRoot,
      stderr: "pipe",
    });
    const client = new Client(
      {
        name: "graphtrace-worktree-test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    try {
      const baseWorkspace = await daemon.addWorkspace(fixture.repoRoot, {
        label: "fixture",
      });
      const worktreeWorkspace = await daemon.addWorkspace(worktreeRoot, {
        label: "fixture",
      });
      await client.connect(transport);

      const workspaces = await client.callTool({
        name: "list_workspaces",
        arguments: {},
      });
      const status = await client.callTool({
        name: "get_status",
        arguments: {},
      });
      const mismatched = await client.callTool({
        name: "get_status",
        arguments: { workspaceId: baseWorkspace.id },
      });
      const workspaceItems = readToolItems(
        workspaces.structuredContent,
      ) as Array<{
        id?: string;
        canonicalRootPath?: string;
        score?: number;
        currentCwdRank?: number;
        cwdRelationship?: string;
      }>;
      const statusPayload = status.structuredContent as {
        workspaceRoot?: string;
      };
      const mismatchedPayload = mismatched.structuredContent as {
        workspaceRoot?: string;
        routingWarning?: { code?: string; message?: string };
      };

      expect(workspaces.isError).not.toBe(true);
      expect(workspaceItems[0]).toMatchObject({
        id: worktreeWorkspace.id,
        canonicalRootPath: worktreeRoot,
      });
      expect(workspaceItems[0]?.cwdRelationship).toBe("exact");
      expect(workspaceItems[1]).toMatchObject({
        id: baseWorkspace.id,
      });
      expect(status.isError).not.toBe(true);
      expect(statusPayload.workspaceRoot).toBe(worktreeRoot);
      expect(mismatched.isError).not.toBe(true);
      expect(mismatchedPayload.workspaceRoot).toBe(fixture.repoRoot);
      expect(mismatchedPayload.routingWarning).toMatchObject({
        code: "workspace-root-mismatch",
      });
      expect(mismatchedPayload.routingWarning?.message).toContain(worktreeRoot);
    } finally {
      await client.close().catch(() => undefined);
      await transport.close().catch(() => undefined);
      daemon.close();
      await fixture.cleanup();
    }
  }, 30_000);

  test("marks deleted worktrees missing and keeps same-label workspaces distinguishable", async () => {
    const fixture = await createTempGitWorkspaceFromFixture(fixtureRoot);
    const deletedWorktreeRoot = join(
      fixture.sandboxRoot,
      "repo-deleted-worktree",
    );
    execFileSync(
      "git",
      ["worktree", "add", "-b", "feature/deleted", deletedWorktreeRoot],
      {
        cwd: fixture.repoRoot,
        stdio: "ignore",
      },
    );
    await ensureWorkspaceInitialized(fixture.repoRoot);
    await ensureWorkspaceInitialized(deletedWorktreeRoot);
    await indexWorkspace({ workspaceRoot: fixture.repoRoot, full: true });
    await indexWorkspace({ workspaceRoot: deletedWorktreeRoot, full: true });
    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-mcp-home-"));
    const daemon = createGraphTraceDaemon({ homeDir });

    const transport = new StdioClientTransport({
      command: "pnpm",
      args: [
        "exec",
        "node",
        "--import",
        "tsx",
        "--eval",
        `process.chdir(${JSON.stringify(fixture.repoRoot)}); const { createGraphTraceMcpServer } = await import(${JSON.stringify(mcpEntry)}); await createGraphTraceMcpServer({ homeDir: ${JSON.stringify(homeDir)}, workspaceRoot: ${JSON.stringify(fixture.repoRoot)} });`,
      ],
      cwd: repoRoot,
      stderr: "pipe",
    });
    const client = new Client(
      {
        name: "graphtrace-missing-worktree-test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    try {
      const baseWorkspace = await daemon.addWorkspace(fixture.repoRoot, {
        label: "fixture",
      });
      const deletedWorkspace = await daemon.addWorkspace(deletedWorktreeRoot, {
        label: "fixture",
      });
      await rm(deletedWorktreeRoot, { recursive: true, force: true });
      await client.connect(transport);

      const workspaces = await client.callTool({
        name: "list_workspaces",
        arguments: {},
      });
      const workspaceItems = readToolItems(
        workspaces.structuredContent,
      ) as Array<{
        id?: string;
        label?: string;
        status?: string;
        canonicalRootPath?: string;
      }>;

      expect(workspaces.isError).not.toBe(true);
      expect(workspaceItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: baseWorkspace.id,
            label: "fixture",
            status: "ready",
          }),
          expect.objectContaining({
            id: deletedWorkspace.id,
            label: "fixture",
            status: "missing",
            canonicalRootPath: deletedWorktreeRoot,
          }),
        ]),
      );
      expect(baseWorkspace.id).not.toBe(deletedWorkspace.id);
    } finally {
      await client.close().catch(() => undefined);
      await transport.close().catch(() => undefined);
      daemon.close();
      await fixture.cleanup();
    }
  }, 30_000);

  test("writes opt-in MCP telemetry events", async () => {
    await ensureWorkspaceInitialized(fixtureRoot);
    await indexWorkspace({ workspaceRoot: fixtureRoot, full: true });
    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-mcp-home-"));
    const daemon = createGraphTraceDaemon({ homeDir });

    const transport = new StdioClientTransport({
      command: "pnpm",
      args: [
        "exec",
        "node",
        "--import",
        "tsx",
        cliEntry,
        "mcp",
        "--home",
        homeDir,
      ],
      cwd: fixtureRoot,
      env: {
        ...process.env,
        GRAPHTRACE_MCP_TELEMETRY: "1",
      },
      stderr: "pipe",
    });
    const client = new Client(
      {
        name: "graphtrace-test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    try {
      await daemon.addWorkspace(fixtureRoot, { label: "fixture" });
      await client.connect(transport);
      await client.callTool({ name: "get_status", arguments: {} });
      await client.close();

      const telemetry = await readFile(
        join(homeDir, ".graphtrace", "mcp-telemetry.jsonl"),
        "utf8",
      );
      expect(telemetry).toContain('"toolName":"get_status"');
      expect(telemetry).toContain('"ok":true');
    } finally {
      await client.close().catch(() => undefined);
      await transport.close().catch(() => undefined);
      daemon.close();
    }
  }, 20_000);
});
