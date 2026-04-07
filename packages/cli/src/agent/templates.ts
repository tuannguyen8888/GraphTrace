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
    "Use GraphTrace from Codex when the task needs repository structure, semantic code context, or a fast first pass on dependencies before broad filesystem scans.",
    "",
    "## Decision tree",
    "- If you are unsure whether the graph is fresh, start with `get_status` -> `run_index` and only re-index when the last run is missing, stale, or the workspace changed significantly.",
    "- If you need to change a route or trace a request path, use `get_routes` -> `search_code` -> `get_data_flow` before opening files broadly.",
    "- If you need blast radius before editing a file, use `get_impact_analysis` -> `get_dependencies` and inspect both callers and downstream dependencies before patching.",
    "- If you need to locate a symbol or package quickly, use `search_code` -> `get_symbol_context` for symbols and `list_packages` -> `get_package_overview` for package-level orientation.",
    "",
    "## Common sequences",
    "- Change a route: start with `get_routes` to confirm the route, use `search_code` to find the owning file or handler, then run `get_data_flow` to understand request-to-query flow before editing.",
    "- Blast radius before editing a file: run `get_impact_analysis` first for the broad impact set, then `get_dependencies` with a narrow depth to verify important inbound or outbound edges.",
    "- Locate a symbol or package quickly: use `search_code` for the first hit, `get_symbol_context` when multiple matches need disambiguation, and `list_packages` or `get_package_overview` when the question is architectural rather than file-local.",
    "- Check whether the graph is stale: call `get_status`; if the index is missing or clearly behind recent workspace changes, run `run_index` before trusting dependency or flow results.",
    "",
    "## Fallback when GraphTrace is sparse",
    "- If GraphTrace returns partial or empty results, verify freshness with `get_status` and re-run `run_index` before assuming the code truly has no edges.",
    "- If results stay sparse after re-indexing, switch to targeted filesystem inspection such as `rg` on the exact file, symbol, or route you already narrowed down with GraphTrace.",
    "- Say explicitly what GraphTrace did and did not find so the next step is evidence-based rather than guesswork.",
    "",
    "## Working rules",
    "- Prefer narrow queries first before broad scans or large dumps.",
    "- Summarize the relevant findings instead of pasting raw JSON unless the exact payload is necessary for the task.",
    "- Re-run `run_index` after significant workspace changes or before a second pass on impact, dependency, or route-flow analysis.",
    "- Use GraphTrace before filesystem-wide grep when you need semantic code context or dependency insight, then fall back to grep only for the specific gap GraphTrace exposed.",
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
