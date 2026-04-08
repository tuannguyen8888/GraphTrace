import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

import { GRAPHTRACE_DIR } from "@graphtrace/shared";

export interface WorkspaceIdentity {
  id: string;
  slug: string;
  rootPath: string;
  canonicalRootPath: string;
  dbPath: string;
}

export function canonicalizeWorkspaceRoot(rootPath: string): string {
  return resolve(rootPath);
}

export function buildManagedStorageRoot(homeDir = homedir()): string {
  return join(resolve(homeDir), GRAPHTRACE_DIR);
}

export function buildRegistryDbPath(homeDir = homedir()): string {
  return join(buildManagedStorageRoot(homeDir), "registry.sqlite");
}

export function buildManagedWorkspaceDbPath(
  workspaceId: string,
  homeDir = homedir(),
): string {
  return join(
    buildManagedStorageRoot(homeDir),
    "workspaces",
    workspaceId,
    "index.db",
  );
}

export function deriveWorkspaceIdentity(
  rootPath: string,
  homeDir = homedir(),
): WorkspaceIdentity {
  const canonicalRootPath = canonicalizeWorkspaceRoot(rootPath);
  const slug = slugifyWorkspaceName(basename(canonicalRootPath));
  const hash = createHash("sha1")
    .update(canonicalRootPath)
    .digest("hex")
    .slice(0, 8);
  const id = `${slug}-${hash}`;

  return {
    id,
    slug,
    rootPath,
    canonicalRootPath,
    dbPath: buildManagedWorkspaceDbPath(id, homeDir),
  };
}

function slugifyWorkspaceName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "workspace";
}
