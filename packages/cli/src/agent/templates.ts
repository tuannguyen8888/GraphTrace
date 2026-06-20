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
    "description: Use when investigating repository structure, symbol context, route flow, impact, dependencies, package ownership, or GraphTrace MCP freshness before broad source scans.",
    "---",
    "",
    "# GraphTrace",
    "",
    "Use GraphTrace as a fast first pass for repository context, then confirm in source when confidence, freshness, or coverage is not strong enough for an edit.",
    "One GraphTrace MCP entry can serve every workspace registered in the shared GraphTrace home.",
    "",
    "## Decision tree",
    "- Main path: `get_status` -> focused `search_code` -> `get_symbol_context` -> `graphtrace_get_execution_context` / `graphtrace_get_symbol_impact` -> targeted source fallback.",
    "- Freshness: start with `get_status` -> `run_index` when the index is missing, stale, or the workspace changed significantly.",
    "- Route flow: use `get_routes` -> `search_code` -> `get_data_flow` before opening route, controller, service, or query files broadly.",
    "- File blast radius: use `get_impact_analysis` -> `get_dependencies`, then inspect important inbound and outbound dependencies before patching.",
    "- Symbol lookup: use `search_code` -> `get_symbol_context`; once a symbol is clear, prefer `graphtrace_get_execution_context` or `graphtrace_get_symbol_impact` over another broad search.",
    "- Package orientation: use `list_packages` -> `get_package_overview` when the question is architectural rather than file-local.",
    "- Workspace ambiguity: call `list_workspaces`, pick the matching `workspaceId`, then retry the focused query with that `workspaceId`.",
    "",
    "## Query splitting",
    "- Split multi-concept prompts into short focused queries; use one concept per query such as a route path, symbol name, file path, package name, or framework term.",
    "- Avoid long searches like `React form state Next route Laravel permission business flow`; run separate searches such as `handleSubmit`, `/api/users`, `AdminUsersController`, and `PermissionService`.",
    "- Stop after the first useful hits, resolve the exact symbol or route, then switch to graph tools instead of making another broad search.",
    "",
    "## Trust and fallback",
    "- Trust `proven` edges for orientation, but still read source before risky edits.",
    "- Confirm `inferred-strong` edges in source when they affect the implementation, test plan, or user-facing claim.",
    "- Treat `inferred-weak` as a lead, not evidence; use `graphtrace_explain_edge` or read the file before relying on it.",
    "- If results are empty, partial, stale, or truncated, check `get_status`, re-index when appropriate, then retry one narrower query.",
    "- Stop expanding GraphTrace when one or two targeted file reads would answer the remaining question faster.",
    "",
    "## Common sequences",
    "- Change a route: `get_routes` to confirm the route, `search_code` to find the owning handler, then `get_data_flow` for request-to-query flow.",
    "- Blast radius before editing a file: `get_impact_analysis` first, then `get_dependencies` with narrow depth for key inbound/outbound edges.",
    "- Locate a symbol quickly: `search_code` for the first hit, `get_symbol_context` to disambiguate, then symbol execution or impact graph.",
    "- Check stale graph data: `get_status`; if missing or stale, `run_index`; if still sparse, document the gap and fall back to targeted source inspection.",
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
    "- Split multi-concept requests into short focused queries before using graph tools.",
    "- Use `search_code` and `get_symbol_context` for targeted symbol lookups; switch to execution or impact graph after the first useful hit.",
    "- Trust `proven`, confirm `inferred-strong`, and treat `inferred-weak` as a lead before making implementation claims.",
    "- Use `get_dependencies` for dependency tracing.",
    "- Use `get_impact_analysis` for blast-radius checks before edits.",
    "- Use `get_routes` and `get_data_flow` for route and request flow questions.",
    "- Do not paste large raw outputs when a short summary answers the task.",
  ].join("\n");
}
