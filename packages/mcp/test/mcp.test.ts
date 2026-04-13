import { mkdtemp } from "node:fs/promises";
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
const cliEntry = join(repoRoot, "packages", "cli", "src", "bin.ts");

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

describe("mcp", () => {
  test("exposes the GraphTrace MCP toolset over stdio", async () => {
    await ensureWorkspaceInitialized(fixtureRoot);
    await indexWorkspace({ workspaceRoot: fixtureRoot, full: true });

    const transport = new StdioClientTransport({
      command: "pnpm",
      args: ["exec", "node", "--import", "tsx", cliEntry, "mcp"],
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
      await client.connect(transport);

      const tools = await client.listTools();

      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        "add_workspace",
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
      const statusPayload = status.structuredContent as {
        workspaceRoot?: string;
        counts?: {
          routeCount?: number;
        };
      };
      const reindexPayload = reindex.structuredContent as {
        summary?: {
          routeCount?: number;
        };
      };
      const packageItems = readToolItems(packages.structuredContent);
      const overviewItems = readToolItems(overview.structuredContent);

      expect(search.isError).not.toBe(true);
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
        const ambiguousRoutes = await client.callTool({
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
        const ambiguousText = readToolText(ambiguousRoutes);

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
        expect(ambiguousRoutes.isError).toBe(true);
        expect(ambiguousText).toContain("workspaceId");
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

    const transport = new StdioClientTransport({
      command: "pnpm",
      args: ["exec", "node", "--import", "tsx", cliEntry, "mcp"],
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
    }
  }, 20_000);
});
