import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface AgentDoctorOptions {
  binaryPath: string;
  cliVersion: string;
  graphTraceHome: string;
  userHomeDir?: string;
  workspaceRoot: string;
}

export interface AgentDoctorConfigStatus {
  args: string[];
  command: string | null;
  exists: boolean;
  path: string;
  scope: "project" | "user";
}

export interface AgentDoctorReport {
  binaryPath: string;
  cliVersion: string;
  configs: AgentDoctorConfigStatus[];
  graphTraceHome: string;
  recommendations: string[];
  workspaceRoot: string;
}

export async function inspectAgentDoctor(
  options: AgentDoctorOptions,
): Promise<AgentDoctorReport> {
  const userHomeDir = options.userHomeDir ?? homedir();
  const configs = await Promise.all([
    inspectConfig(
      "project",
      join(options.workspaceRoot, ".codex", "config.toml"),
    ),
    inspectConfig("user", join(userHomeDir, ".codex", "config.toml")),
  ]);

  return {
    binaryPath: options.binaryPath,
    cliVersion: options.cliVersion,
    configs,
    graphTraceHome: options.graphTraceHome,
    recommendations: buildRecommendations(configs),
    workspaceRoot: options.workspaceRoot,
  };
}

export function formatAgentDoctorResult(report: AgentDoctorReport): string {
  return [
    "GraphTrace Agent Doctor",
    `cli_version:${report.cliVersion}`,
    `binary:${report.binaryPath}`,
    `workspace_root:${report.workspaceRoot}`,
    `graphtrace_home:${report.graphTraceHome}`,
    ...report.configs.flatMap((config) => [
      `mcp_config:${config.scope}:${config.exists ? "present" : "missing"}:${config.path}`,
      `mcp_command:${config.scope}:${config.command ?? "unknown"}`,
      `mcp_args:${config.scope}:${config.args.length > 0 ? config.args.join(" ") : "unknown"}`,
    ]),
    ...report.recommendations.map(
      (recommendation) => `recommendation:${recommendation}`,
    ),
  ].join("\n");
}

async function inspectConfig(
  scope: AgentDoctorConfigStatus["scope"],
  path: string,
): Promise<AgentDoctorConfigStatus> {
  const content = await readOptionalFile(path);

  return {
    args: content ? readTomlStringArray(content, "args") : [],
    command: content ? readTomlString(content, "command") : null,
    exists: content !== null,
    path,
    scope,
  };
}

function buildRecommendations(configs: AgentDoctorConfigStatus[]): string[] {
  const presentConfigs = configs.filter((config) => config.exists);
  if (presentConfigs.length === 0) {
    return ["run graphtrace agent setup --tool codex before using MCP"];
  }

  const graphTraceConfigs = presentConfigs.filter(
    (config) => config.command === "graphtrace",
  );
  if (graphTraceConfigs.length === 0) {
    return ["configure mcp_servers.graphtrace command to use graphtrace"];
  }

  if (
    graphTraceConfigs.some(
      (config) =>
        config.args.includes("mcp") && !config.args.includes("--home"),
    )
  ) {
    return [
      "include --home in graphtrace MCP args for stable shared workspace resolution",
    ];
  }

  return [
    "GraphTrace MCP config detected; run graphtrace status to verify the selected workspace",
  ];
}

async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function readTomlString(content: string, key: string): string | null {
  const match = content.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m"));
  return match?.[1] ?? null;
}

function readTomlStringArray(content: string, key: string): string[] {
  const match = content.match(
    new RegExp(`^${key}\\s*=\\s*\\[([^\\]]*)\\]`, "m"),
  );
  if (!match) {
    return [];
  }

  return [...match[1].matchAll(/"([^"]*)"/g)].map((item) => item[1]);
}
