import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface PackageManifest {
  name?: string;
  version?: string;
}

export interface VersionTarget {
  path: string;
  name: string;
  version: string;
}

export async function readVersionTargets(
  workspaceRoot: string,
): Promise<VersionTarget[]> {
  const manifestPaths = await collectVersionManifestPaths(workspaceRoot);
  const targets = await Promise.all(
    manifestPaths.map(async (manifestPath) => {
      const manifest = await readManifest(join(workspaceRoot, manifestPath));
      return {
        path: manifestPath,
        name: manifest.name ?? manifestPath,
        version: manifest.version ?? "0.0.0",
      };
    }),
  );

  return targets.sort((left, right) =>
    compareManifestPaths(left.path, right.path),
  );
}

export async function syncWorkspaceVersions(
  workspaceRoot: string,
  version: string,
): Promise<void> {
  const manifestPaths = await collectVersionManifestPaths(workspaceRoot);

  await Promise.all(
    manifestPaths.map(async (manifestPath) => {
      const absolutePath = join(workspaceRoot, manifestPath);
      const manifest = await readManifest(absolutePath);
      manifest.version = version;
      await writeFile(absolutePath, `${JSON.stringify(manifest, null, 2)}\n`);
    }),
  );
}

async function collectVersionManifestPaths(
  workspaceRoot: string,
): Promise<string[]> {
  const paths = ["package.json"];

  for (const parent of ["apps", "packages"]) {
    const parentPath = join(workspaceRoot, parent);
    let entries: string[] = [];

    try {
      entries = await readdir(parentPath);
    } catch {
      continue;
    }

    for (const entry of entries) {
      paths.push(`${parent}/${entry}/package.json`);
    }
  }

  const manifests: string[] = [];
  for (const path of paths) {
    try {
      await readFile(join(workspaceRoot, path), "utf8");
      manifests.push(path);
    } catch {}
  }

  return manifests;
}

async function readManifest(path: string): Promise<PackageManifest> {
  return JSON.parse(await readFile(path, "utf8")) as PackageManifest;
}

function compareManifestPaths(left: string, right: string): number {
  const leftRank = manifestPathRank(left);
  const rightRank = manifestPathRank(right);

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return left.localeCompare(right);
}

function manifestPathRank(path: string): number {
  if (path === "package.json") {
    return 0;
  }

  if (path.startsWith("apps/")) {
    return 1;
  }

  return 2;
}
