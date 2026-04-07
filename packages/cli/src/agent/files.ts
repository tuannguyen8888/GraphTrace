import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import type { RenderedAgentFile } from "./templates";

const MANAGED_BLOCK_START = "<!-- graphtrace:managed:start -->";
const MANAGED_BLOCK_END = "<!-- graphtrace:managed:end -->";
const AGENT_SETUP_STATE_PATH = join(".graphtrace", "agent", "setup-state.json");

export interface ApplyRenderedAgentFilesOptions {
  workspaceRoot?: string;
}

export interface RenderedAgentFileBackup {
  originalPath: string;
  backupPath: string;
}

export interface ApplyRenderedAgentFilesResult {
  backups: RenderedAgentFileBackup[];
  state: AgentSetupState;
  writtenFiles: string[];
}

export interface AgentSetupStateEntry {
  action: "created" | "updated";
  backupPath: string | null;
  path: string;
  toolId: RenderedAgentFile["toolId"];
}

export interface AgentSetupState {
  entries: AgentSetupStateEntry[];
  updatedAt: string;
  version: 1;
}

export async function applyRenderedAgentFiles(
  files: RenderedAgentFile[],
  options: ApplyRenderedAgentFilesOptions = {},
): Promise<ApplyRenderedAgentFilesResult> {
  const backups: RenderedAgentFileBackup[] = [];
  const stateEntries: AgentSetupStateEntry[] = [];
  const writtenFiles: string[] = [];
  const backupRunId = Date.now().toString();

  for (const file of files) {
    await mkdir(dirname(file.path), { recursive: true });

    const existing = await readOptionalFile(file.path);
    if (file.strategy === "managed_markdown") {
      const nextContent = reconcileManagedMarkdown(
        existing,
        file.managedContent ?? file.content,
      );
      if (existing === nextContent) {
        continue;
      }

      const backup = await maybeBackupFile(
        existing,
        file.path,
        options.workspaceRoot,
        backupRunId,
      );
      if (backup) {
        backups.push(backup);
      }

      await writeFile(file.path, nextContent, "utf8");
      stateEntries.push({
        action: existing ? "updated" : "created",
        backupPath: backup?.backupPath ?? null,
        path: file.path,
        toolId: file.toolId,
      });
      writtenFiles.push(file.path);
      continue;
    }

    if (existing === file.content) {
      continue;
    }

    const backup = await maybeBackupFile(
      existing,
      file.path,
      options.workspaceRoot,
      backupRunId,
    );
    if (backup) {
      backups.push(backup);
    }

    await writeFile(file.path, file.content, "utf8");
    stateEntries.push({
      action: existing ? "updated" : "created",
      backupPath: backup?.backupPath ?? null,
      path: file.path,
      toolId: file.toolId,
    });
    writtenFiles.push(file.path);
  }

  const state: AgentSetupState = {
    entries: stateEntries,
    updatedAt: new Date().toISOString(),
    version: 1,
  };

  if (options.workspaceRoot) {
    await writeAgentSetupState(options.workspaceRoot, state);
  }

  return {
    backups,
    state,
    writtenFiles,
  };
}

export async function loadAgentSetupState(
  workspaceRoot: string,
): Promise<AgentSetupState | null> {
  try {
    const content = await readFile(
      getAgentSetupStatePath(workspaceRoot),
      "utf8",
    );
    return JSON.parse(content) as AgentSetupState;
  } catch {
    return null;
  }
}

export async function restoreAgentSetupState(
  workspaceRoot: string,
  state: AgentSetupState,
  toolId?: RenderedAgentFile["toolId"],
): Promise<string[]> {
  const restoredPaths: string[] = [];
  const remainingEntries: AgentSetupStateEntry[] = [];

  for (const entry of [...state.entries].reverse()) {
    if (toolId && entry.toolId !== toolId) {
      remainingEntries.unshift(entry);
      continue;
    }

    if (entry.action === "updated" && entry.backupPath) {
      const backupContent = await readFile(entry.backupPath, "utf8");
      await mkdir(dirname(entry.path), { recursive: true });
      await writeFile(entry.path, backupContent, "utf8");
      restoredPaths.push(entry.path);
      continue;
    }

    if (entry.action === "created") {
      await rm(entry.path, { force: true });
      restoredPaths.push(entry.path);
    }
  }

  if (remainingEntries.length > 0) {
    await writeAgentSetupState(workspaceRoot, {
      entries: remainingEntries,
      updatedAt: new Date().toISOString(),
      version: 1,
    });
  } else {
    await rm(getAgentSetupStatePath(workspaceRoot), { force: true });
  }

  return restoredPaths;
}

export function reconcileManagedMarkdown(
  existingContent: string,
  managedContent: string,
): string {
  const managedBlock = [
    MANAGED_BLOCK_START,
    managedContent,
    MANAGED_BLOCK_END,
  ].join("\n");

  if (!existingContent.trim()) {
    return `${managedBlock}\n`;
  }

  const pattern = new RegExp(
    `${escapeRegExp(MANAGED_BLOCK_START)}[\\s\\S]*?${escapeRegExp(MANAGED_BLOCK_END)}`,
  );

  if (pattern.test(existingContent)) {
    return `${existingContent.replace(pattern, managedBlock)}\n`;
  }

  return `${existingContent.replace(/\s*$/, "")}\n\n${managedBlock}\n`;
}

async function readOptionalFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

async function maybeBackupFile(
  existingContent: string,
  targetPath: string,
  workspaceRoot: string | undefined,
  backupRunId: string,
): Promise<RenderedAgentFileBackup | null> {
  if (!existingContent || !workspaceRoot) {
    return null;
  }

  const backupPath = join(
    workspaceRoot,
    ".graphtrace",
    "backups",
    "agent-setup",
    backupRunId,
    relative(workspaceRoot, targetPath),
  );
  await mkdir(dirname(backupPath), { recursive: true });
  await writeFile(backupPath, existingContent, "utf8");

  return {
    originalPath: targetPath,
    backupPath,
  };
}

async function writeAgentSetupState(
  workspaceRoot: string,
  state: AgentSetupState,
): Promise<void> {
  const statePath = getAgentSetupStatePath(workspaceRoot);
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(
    `${statePath}`,
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8",
  );
}

function getAgentSetupStatePath(workspaceRoot: string): string {
  return join(workspaceRoot, AGENT_SETUP_STATE_PATH);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
