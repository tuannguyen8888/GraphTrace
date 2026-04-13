import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type SupportedAgentTool = "codex" | "claude" | "cursor";
export type AgentBootstrapScope = "project" | "user";
export type AgentBootstrapTargetKind =
  | "instructions"
  | "mcp_config"
  | "rule"
  | "skill";

export interface AgentBootstrapTarget {
  kind: AgentBootstrapTargetKind;
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
  scope: AgentBootstrapScope;
  tools: AgentBootstrapToolPlan[];
}

export interface PlanAgentBootstrapOptions {
  scope?: AgentBootstrapScope;
  userHomeDir?: string;
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
  const scope = options.scope ?? "project";
  const workspaceRoot = resolve(options.workspaceRoot);
  const userHomeDir = resolve(options.userHomeDir ?? homedir());

  const selectedTools =
    options.tools ?? (Object.keys(TOOL_EXECUTABLES) as SupportedAgentTool[]);

  const tools = await Promise.all(
    selectedTools.map(async (id) => ({
      id,
      detection: await detectTool(id, findExecutable),
      targets: listTargets({
        scope,
        tool: id,
        userHomeDir,
        workspaceRoot,
      }),
    })),
  );

  return { scope, tools };
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

function listTargets(options: {
  scope: AgentBootstrapScope;
  tool: SupportedAgentTool;
  userHomeDir: string;
  workspaceRoot: string;
}): AgentBootstrapTarget[] {
  if (options.scope === "user") {
    return listUserScopeTargets(options.userHomeDir, options.tool);
  }

  return listProjectScopeTargets(options.workspaceRoot, options.tool);
}

function listProjectScopeTargets(
  workspaceRoot: string,
  tool: SupportedAgentTool,
): AgentBootstrapTarget[] {
  switch (tool) {
    case "codex":
      return [
        {
          kind: "mcp_config",
          path: join(workspaceRoot, ".codex", "config.toml"),
        },
        {
          kind: "skill",
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
        {
          kind: "mcp_config",
          path: join(workspaceRoot, ".mcp.json"),
        },
        {
          kind: "instructions",
          path: join(workspaceRoot, ".claude", "CLAUDE.md"),
        },
      ];
    case "cursor":
      return [
        {
          kind: "mcp_config",
          path: join(workspaceRoot, ".cursor", "mcp.json"),
        },
        {
          kind: "rule",
          path: join(workspaceRoot, ".cursor", "rules", "graphtrace.mdc"),
        },
      ];
  }
}

function listUserScopeTargets(
  userHomeDir: string,
  tool: SupportedAgentTool,
): AgentBootstrapTarget[] {
  switch (tool) {
    case "codex":
      return [
        {
          kind: "mcp_config",
          path: join(userHomeDir, ".codex", "config.toml"),
        },
        {
          kind: "skill",
          path: join(userHomeDir, ".codex", "skills", "graphtrace", "SKILL.md"),
        },
      ];
    case "claude":
      return [
        {
          kind: "mcp_config",
          path: join(userHomeDir, ".claude.json"),
        },
        {
          kind: "instructions",
          path: join(userHomeDir, ".claude", "CLAUDE.md"),
        },
      ];
    case "cursor":
      return [
        {
          kind: "mcp_config",
          path: join(userHomeDir, ".cursor", "mcp.json"),
        },
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
