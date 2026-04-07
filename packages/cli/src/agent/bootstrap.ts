import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";

export type SupportedAgentTool = "codex" | "claude" | "cursor";

export interface AgentBootstrapTarget {
  path: string;
}

export interface AgentToolDetection {
  executablePath: string | null;
  status: "available" | "not_installed";
}

export interface AgentBootstrapToolPlan {
  id: SupportedAgentTool;
  detection: AgentToolDetection;
  targets: AgentBootstrapTarget[];
}

export interface AgentBootstrapPlan {
  tools: AgentBootstrapToolPlan[];
}

export interface PlanAgentBootstrapOptions {
  workspaceRoot: string;
  tools?: SupportedAgentTool[];
  findExecutable?: (name: string) => Promise<string | null>;
}

const TOOL_EXECUTABLES: Record<SupportedAgentTool, string[]> = {
  codex: ["codex"],
  claude: ["claude"],
  cursor: ["cursor-agent", "cursor"],
};

export async function planAgentBootstrap(
  options: PlanAgentBootstrapOptions,
): Promise<AgentBootstrapPlan> {
  const findExecutable = options.findExecutable ?? findExecutableOnPath;

  const selectedTools =
    options.tools ?? (Object.keys(TOOL_EXECUTABLES) as SupportedAgentTool[]);

  const tools = await Promise.all(
    selectedTools.map(async (id) => ({
      id,
      detection: await detectTool(id, findExecutable),
      targets: listTargets(options.workspaceRoot, id),
    })),
  );

  return { tools };
}

async function detectTool(
  tool: SupportedAgentTool,
  findExecutable: (name: string) => Promise<string | null>,
): Promise<AgentToolDetection> {
  for (const executable of TOOL_EXECUTABLES[tool]) {
    const executablePath = await findExecutable(executable);
    if (executablePath) {
      return {
        executablePath,
        status: "available",
      };
    }
  }

  return {
    executablePath: null,
    status: "not_installed",
  };
}

function listTargets(
  workspaceRoot: string,
  tool: SupportedAgentTool,
): AgentBootstrapTarget[] {
  switch (tool) {
    case "codex":
      return [
        { path: join(workspaceRoot, ".codex", "config.toml") },
        {
          path: join(
            workspaceRoot,
            ".agents",
            "skills",
            "graphtrace",
            "SKILL.md",
          ),
        },
      ];
    case "claude":
      return [
        { path: join(workspaceRoot, ".mcp.json") },
        { path: join(workspaceRoot, ".claude", "CLAUDE.md") },
      ];
    case "cursor":
      return [
        { path: join(workspaceRoot, ".cursor", "mcp.json") },
        { path: join(workspaceRoot, ".cursor", "rules", "graphtrace.mdc") },
      ];
  }
}

async function findExecutableOnPath(name: string): Promise<string | null> {
  const pathValue = process.env.PATH;
  if (!pathValue) {
    return null;
  }

  for (const directory of pathValue.split(":")) {
    if (!directory) {
      continue;
    }

    const candidate = join(directory, name);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue searching PATH entries until an executable is found.
    }
  }

  return null;
}
