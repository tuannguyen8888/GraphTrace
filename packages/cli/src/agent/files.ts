import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import type { RenderedAgentFile } from "./templates";

const MANAGED_BLOCK_START = "<!-- graphtrace:managed:start -->";
const MANAGED_BLOCK_END = "<!-- graphtrace:managed:end -->";
const AGENT_SETUP_STATE_PATH = join(".graphtrace", "agent", "setup-state.json");

export interface ApplyRenderedAgentFilesOptions {
  backupBaseDir?: string;
  storageRoot?: string;
  workspaceRoot?: string;
  writeMode?: AgentSetupWriteMode;
}

export type AgentSetupWriteMode = "tracked" | "local";

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
  ignoreEntries?: string[];
  updatedAt: string;
  version: 2;
}

export async function applyRenderedAgentFiles(
  files: RenderedAgentFile[],
  options: ApplyRenderedAgentFilesOptions = {},
): Promise<ApplyRenderedAgentFilesResult> {
  const storageRoot = options.storageRoot ?? options.workspaceRoot;
  const backupBaseDir = options.backupBaseDir ?? options.workspaceRoot;
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
        storageRoot,
        backupBaseDir,
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
      storageRoot,
      backupBaseDir,
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

  const ignoreEntries =
    options.writeMode === "local" && options.workspaceRoot
      ? await ensureGitInfoExcludeEntries(options.workspaceRoot, writtenFiles)
      : [];

  const state: AgentSetupState = {
    entries: stateEntries,
    ignoreEntries,
    updatedAt: new Date().toISOString(),
    version: 2,
  };

  if (storageRoot) {
    await writeAgentSetupState(storageRoot, state);
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
  const toolIgnoreEntries = toolId
    ? new Set(
        state.entries
          .filter((entry) => entry.toolId === toolId)
          .map((entry) => toGitIgnoreEntry(workspaceRoot, entry.path)),
      )
    : new Set<string>();
  const remainingIgnoreEntries =
    toolId && state.ignoreEntries?.length
      ? state.ignoreEntries.filter((entry) => !toolIgnoreEntries.has(entry))
      : [];

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

  const ignoreEntriesToRemove =
    toolId && state.ignoreEntries?.length
      ? state.ignoreEntries.filter((entry) => toolIgnoreEntries.has(entry))
      : (state.ignoreEntries ?? []);

  if (ignoreEntriesToRemove.length > 0) {
    await removeGitInfoExcludeEntries(workspaceRoot, ignoreEntriesToRemove);
  }

  if (remainingEntries.length > 0) {
    await writeAgentSetupState(workspaceRoot, {
      entries: remainingEntries,
      ignoreEntries: remainingIgnoreEntries,
      updatedAt: new Date().toISOString(),
      version: 2,
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
  storageRoot: string | undefined,
  backupBaseDir: string | undefined,
  backupRunId: string,
): Promise<RenderedAgentFileBackup | null> {
  if (!existingContent || !storageRoot || !backupBaseDir) {
    return null;
  }

  const backupPath = join(
    storageRoot,
    ".graphtrace",
    "backups",
    "agent-setup",
    backupRunId,
    toBackupRelativePath(backupBaseDir, targetPath),
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

async function ensureGitInfoExcludeEntries(
  workspaceRoot: string,
  writtenFiles: string[],
): Promise<string[]> {
  const excludePath = await resolveGitInfoExcludePath(workspaceRoot);
  if (!excludePath || writtenFiles.length === 0) {
    return [];
  }

  await mkdir(dirname(excludePath), { recursive: true });
  const existing = await readOptionalFile(excludePath);
  const existingEntries = new Set(
    existing
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const entries = writtenFiles.map((filePath) =>
    toGitIgnoreEntry(workspaceRoot, filePath),
  );
  const nextEntries = [...existingEntries];
  let changed = false;

  for (const entry of entries) {
    if (existingEntries.has(entry)) {
      continue;
    }
    nextEntries.push(entry);
    changed = true;
  }

  if (changed) {
    await writeFile(`${excludePath}`, `${nextEntries.join("\n")}\n`, "utf8");
  }

  return entries;
}

async function removeGitInfoExcludeEntries(
  workspaceRoot: string,
  ignoreEntries: string[],
): Promise<void> {
  const excludePath = await resolveGitInfoExcludePath(workspaceRoot);
  if (!excludePath || ignoreEntries.length === 0) {
    return;
  }

  const existing = await readOptionalFile(excludePath);
  if (!existing) {
    return;
  }

  const entriesToRemove = new Set(ignoreEntries);
  const filtered = existing
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line && !entriesToRemove.has(line));

  await writeFile(`${excludePath}`, `${filtered.join("\n")}\n`, "utf8");
}

async function resolveGitInfoExcludePath(
  workspaceRoot: string,
): Promise<string | null> {
  const gitPath = join(workspaceRoot, ".git");

  try {
    const gitStat = await stat(gitPath);
    if (gitStat.isDirectory()) {
      return join(gitPath, "info", "exclude");
    }
  } catch {
    return null;
  }

  const pointer = await readOptionalFile(gitPath);
  const match = pointer.match(/^gitdir:\s*(.+)\s*$/im);
  if (!match?.[1]) {
    return null;
  }

  return join(resolve(workspaceRoot, match[1]), "info", "exclude");
}

function getAgentSetupStatePath(workspaceRoot: string): string {
  return join(workspaceRoot, AGENT_SETUP_STATE_PATH);
}

function toBackupRelativePath(baseDir: string, targetPath: string): string {
  const relativePath = relative(baseDir, targetPath);
  if (
    relativePath &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${pathSeparator()}`)
  ) {
    return relativePath;
  }

  return join("__absolute__", ...splitAbsolutePath(targetPath));
}

function toGitIgnoreEntry(workspaceRoot: string, targetPath: string): string {
  return `/${relative(workspaceRoot, targetPath).replaceAll("\\", "/")}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitAbsolutePath(targetPath: string): string[] {
  const normalized = resolve(targetPath)
    .replaceAll("\\", "/")
    .replace(/^[A-Za-z]:/, (value) => value.slice(0, -1).toLowerCase())
    .replace(/^\/+/, "");
  return normalized.split("/").filter(Boolean);
}

function pathSeparator(): string {
  return process.platform === "win32" ? "\\" : "/";
}
