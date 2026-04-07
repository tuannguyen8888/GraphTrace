import { readFile } from "node:fs/promises";

import type {
  AgentBootstrapPlan,
  AgentBootstrapToolPlan,
  SupportedAgentTool,
} from "./bootstrap";
import { reconcileManagedMarkdown } from "./files";
import { type RenderedAgentFile, renderAgentBootstrapFiles } from "./templates";

export interface AgentToolStatus {
  configuredTargets: number;
  expectedTargets: number;
  id: SupportedAgentTool;
  status: "configured" | "missing" | "partial";
}

export async function inspectAgentBootstrapStatus(
  plan: AgentBootstrapPlan,
): Promise<AgentToolStatus[]> {
  const renderedFiles = renderAgentBootstrapFiles(plan);

  return Promise.all(
    plan.tools.map(async (tool) =>
      inspectToolStatus(
        tool,
        renderedFiles.filter((file) => file.toolId === tool.id),
      ),
    ),
  );
}

async function inspectToolStatus(
  tool: AgentBootstrapToolPlan,
  files: RenderedAgentFile[],
): Promise<AgentToolStatus> {
  let configuredTargets = 0;

  for (const file of files) {
    const existingContent = await readOptionalFile(file.path);
    if (!existingContent) {
      continue;
    }

    if (file.strategy === "managed_markdown") {
      if (
        reconcileManagedMarkdown(
          existingContent,
          file.managedContent ?? file.content,
        ).trimEnd() === existingContent.trimEnd()
      ) {
        configuredTargets += 1;
      }
      continue;
    }

    if (existingContent === file.content) {
      configuredTargets += 1;
    }
  }

  return {
    configuredTargets,
    expectedTargets: tool.targets.length,
    id: tool.id,
    status:
      configuredTargets === 0
        ? "missing"
        : configuredTargets === tool.targets.length
          ? "configured"
          : "partial",
  };
}

async function readOptionalFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}
