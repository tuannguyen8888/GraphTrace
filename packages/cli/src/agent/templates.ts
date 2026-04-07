import type { AgentBootstrapPlan, SupportedAgentTool } from "./bootstrap";

export interface RenderedAgentFile {
  path: string;
  content: string;
  toolId: SupportedAgentTool;
  strategy: "replace" | "managed_markdown";
  managedContent?: string;
}

export function renderAgentBootstrapFiles(
  plan: AgentBootstrapPlan,
): RenderedAgentFile[] {
  return plan.tools.flatMap((tool) => renderToolFiles(tool.id, tool.targets));
}

function renderToolFiles(
  tool: SupportedAgentTool,
  targets: Array<{ path: string }>,
): RenderedAgentFile[] {
  switch (tool) {
    case "codex":
      return [
        {
          path: targets[0].path,
          content: [
            "[mcp_servers.graphtrace]",
            'command = "graphtrace"',
            'args = ["mcp"]',
            "",
          ].join("\n"),
          toolId: tool,
          strategy: "replace",
        },
        {
          path: targets[1].path,
          content: renderCodexSkill(),
          toolId: tool,
          strategy: "replace",
        },
      ];
    case "claude": {
      const managedContent = renderSharedGuidance("Claude Code");
      return [
        {
          path: targets[0].path,
          content: JSON.stringify(
            {
              mcpServers: {
                graphtrace: {
                  command: "graphtrace",
                  args: ["mcp"],
                },
              },
            },
            null,
            2,
          ).concat("\n"),
          toolId: tool,
          strategy: "replace",
        },
        {
          path: targets[1].path,
          content: wrapManagedMarkdownBlock(managedContent),
          managedContent,
          toolId: tool,
          strategy: "managed_markdown",
        },
      ];
    }
    case "cursor":
      return [
        {
          path: targets[0].path,
          content: JSON.stringify(
            {
              mcpServers: {
                graphtrace: {
                  command: "graphtrace",
                  args: ["mcp"],
                },
              },
            },
            null,
            2,
          ).concat("\n"),
          toolId: tool,
          strategy: "replace",
        },
        {
          path: targets[1].path,
          content: renderCursorRule(),
          toolId: tool,
          strategy: "replace",
        },
      ];
  }
}

export function wrapManagedMarkdownBlock(content: string): string {
  return [
    "<!-- graphtrace:managed:start -->",
    content,
    "<!-- graphtrace:managed:end -->",
    "",
  ].join("\n");
}

function renderCodexSkill(): string {
  return [
    "---",
    "name: graphtrace",
    "description: Use GraphTrace MCP tools to inspect code, impact, routes, packages, and status before broad scans.",
    "---",
    "",
    renderSharedGuidance("Codex"),
  ].join("\n");
}

function renderCursorRule(): string {
  return [
    "---",
    "description: GraphTrace usage",
    "globs:",
    "alwaysApply: false",
    "---",
    "",
    renderSharedGuidance("Cursor"),
  ].join("\n");
}

function renderSharedGuidance(toolName: string): string {
  return [
    `Use GraphTrace from ${toolName} when the task needs repository structure or semantic code context.`,
    "",
    "- Prefer narrow queries first before broad scans or large dumps.",
    "- Use GraphTrace before filesystem-wide grep when you need semantic code context or dependency insight.",
    "- Call `get_status` before `run_index` when you suspect stale graph data.",
    "- Use `search_code` and `get_symbol_context` for targeted symbol lookups.",
    "- Use `get_dependencies` for dependency tracing.",
    "- Use `get_impact_analysis` for blast-radius checks before edits.",
    "- Use `get_routes` and `get_data_flow` for route and request flow questions.",
    "- Do not paste large raw outputs when a short summary answers the task.",
  ].join("\n");
}
