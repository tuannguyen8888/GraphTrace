import type {
  AgentBootstrapPlan,
  AgentBootstrapTarget,
  AgentBootstrapTargetKind,
  SupportedAgentTool,
} from "./bootstrap";

export interface RenderedAgentFile {
  path: string;
  content: string;
  toolId: SupportedAgentTool;
  strategy: "replace" | "managed_markdown" | "managed_toml";
  managedContent?: string;
}

export function renderAgentBootstrapFiles(
  plan: AgentBootstrapPlan,
): RenderedAgentFile[] {
  return plan.tools.flatMap((tool) => renderToolFiles(tool.id, tool.targets));
}

function renderToolFiles(
  tool: SupportedAgentTool,
  targets: AgentBootstrapTarget[],
): RenderedAgentFile[] {
  const configPath = findTargetPath(targets, "mcp_config");

  switch (tool) {
    case "codex": {
      const skillPath = findTargetPath(targets, "skill");
      const skillFile: RenderedAgentFile | null = skillPath
        ? {
            path: skillPath,
            content: renderCodexSkill(),
            toolId: tool,
            strategy: "replace",
          }
        : null;
      return [renderCodexConfigFile(configPath), skillFile].filter(
        isRenderedAgentFile,
      );
    }
    case "claude": {
      const instructionsPath = findTargetPath(targets, "instructions");
      const managedContent = renderSharedGuidance("Claude Code");
      const instructionsFile: RenderedAgentFile | null = instructionsPath
        ? {
            path: instructionsPath,
            content: wrapManagedMarkdownBlock(managedContent),
            managedContent,
            toolId: tool,
            strategy: "managed_markdown",
          }
        : null;
      return [renderMcpConfigFile(tool, configPath), instructionsFile].filter(
        isRenderedAgentFile,
      );
    }
    case "cursor": {
      const rulePath = findTargetPath(targets, "rule");
      const ruleFile: RenderedAgentFile | null = rulePath
        ? {
            path: rulePath,
            content: renderCursorRule(),
            toolId: tool,
            strategy: "replace",
          }
        : null;
      return [renderMcpConfigFile(tool, configPath), ruleFile].filter(
        isRenderedAgentFile,
      );
    }
  }
}

function renderMcpConfigFile(
  toolId: SupportedAgentTool,
  path: string | undefined,
): RenderedAgentFile | null {
  if (!path) {
    return null;
  }

  return {
    path,
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
    toolId,
    strategy: "replace",
  };
}

function renderCodexConfigFile(
  path: string | undefined,
): RenderedAgentFile | null {
  if (!path) {
    return null;
  }

  return {
    path,
    content: [
      "[mcp_servers.graphtrace]",
      'command = "graphtrace"',
      'args = ["mcp"]',
      "",
    ].join("\n"),
    toolId: "codex",
    strategy: "managed_toml",
  };
}

function findTargetPath(
  targets: AgentBootstrapTarget[],
  kind: AgentBootstrapTargetKind,
): string | undefined {
  return targets.find((target) => target.kind === kind)?.path;
}

function isRenderedAgentFile(
  value: RenderedAgentFile | null,
): value is RenderedAgentFile {
  return value !== null;
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
    "One GraphTrace MCP entry can serve every workspace registered in the shared GraphTrace home.",
    "",
    "## Decision tree",
    "- If you are unsure whether the graph is fresh, start with `get_status` -> `run_index` and only re-index when the last run is missing, stale, or the workspace changed significantly.",
    "- If you need to change a route or trace a request path, use `get_routes` -> `search_code` -> `get_data_flow` before opening files broadly.",
    "- If you need blast radius before editing a file, use `get_impact_analysis` -> `get_dependencies` and inspect both callers and downstream dependencies before patching.",
    "- If you need to locate a symbol or package quickly, use `search_code` -> `get_symbol_context` for symbols and `list_packages` -> `get_package_overview` for package-level orientation.",
    "- If multiple workspaces are registered and the tool call is ambiguous, use `list_workspaces` first and pass `workspaceId` on the next call.",
    "",
    "## Common sequences",
    "- Change a route: start with `get_routes` to confirm the route, use `search_code` to find the owning file or handler, then run `get_data_flow` to understand request-to-query flow before editing.",
    "- Blast radius before editing a file: run `get_impact_analysis` first for the broad impact set, then `get_dependencies` with a narrow depth to verify important inbound or outbound edges.",
    "- Locate a symbol or package quickly: use `search_code` for the first hit, `get_symbol_context` when multiple matches need disambiguation, and `list_packages` or `get_package_overview` when the question is architectural rather than file-local.",
    "- Check whether the graph is stale: call `get_status`; if the index is missing or clearly behind recent workspace changes, run `run_index` before trusting dependency or flow results.",
    "- Resolve workspace ambiguity: call `list_workspaces`, pick the matching `workspaceId`, then retry `search_code`, `get_routes`, `get_dependencies`, or the symbol tools with that `workspaceId`.",
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
    "- Call `list_workspaces` and pass `workspaceId` when multiple registered workspaces could match the same question.",
    "- Use `search_code` and `get_symbol_context` for targeted symbol lookups.",
    "- Use `get_dependencies` for dependency tracing.",
    "- Use `get_impact_analysis` for blast-radius checks before edits.",
    "- Use `get_routes` and `get_data_flow` for route and request flow questions.",
    "- Do not paste large raw outputs when a short summary answers the task.",
  ].join("\n");
}
