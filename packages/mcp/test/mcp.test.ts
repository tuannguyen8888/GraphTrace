import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, test } from "vitest";

import { ensureWorkspaceInitialized } from "@graphtrace/config";
import { indexWorkspace } from "@graphtrace/indexer";

const repoRoot = process.cwd();
const fixtureRoot = join(repoRoot, "fixtures", "express-prisma-workspace");
const cliEntry = join(repoRoot, "packages", "cli", "src", "bin.ts");

interface ToolGraphItem {
  id?: string;
  kind?: string;
  label?: string;
  path?: string;
  method?: string;
}

function readToolItems(payload: unknown): ToolGraphItem[] {
  return (payload as { items?: ToolGraphItem[] } | undefined)?.items ?? [];
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
        "get_data_flow",
        "get_dependencies",
        "get_impact_analysis",
        "get_package_overview",
        "get_routes",
        "get_status",
        "get_symbol_context",
        "list_packages",
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
});
