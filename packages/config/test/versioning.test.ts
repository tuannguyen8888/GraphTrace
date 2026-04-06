import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { readVersionTargets, syncWorkspaceVersions } from "../src/versioning";

describe("versioning", () => {
  test("syncWorkspaceVersions aligns the root, app, cli, and internal packages", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "graphtrace-version-sync-"),
    );

    await mkdir(join(workspaceRoot, "apps", "web"), { recursive: true });
    await mkdir(join(workspaceRoot, "packages", "cli"), { recursive: true });
    await mkdir(join(workspaceRoot, "packages", "config"), { recursive: true });

    await writeJson(join(workspaceRoot, "package.json"), {
      name: "graphtrace-workspace",
      version: "0.1.0",
      private: true,
    });
    await writeJson(join(workspaceRoot, "apps", "web", "package.json"), {
      name: "@graphtrace/web",
      version: "0.1.0",
      private: true,
    });
    await writeJson(join(workspaceRoot, "packages", "cli", "package.json"), {
      name: "graphtrace",
      version: "0.1.1",
      private: false,
    });
    await writeJson(join(workspaceRoot, "packages", "config", "package.json"), {
      name: "@graphtrace/config",
      version: "0.1.0",
      private: true,
    });

    await syncWorkspaceVersions(workspaceRoot, "0.2.0");

    const versions = await readVersionTargets(workspaceRoot);
    expect(versions).toEqual([
      { path: "package.json", name: "graphtrace-workspace", version: "0.2.0" },
      {
        path: "apps/web/package.json",
        name: "@graphtrace/web",
        version: "0.2.0",
      },
      {
        path: "packages/cli/package.json",
        name: "graphtrace",
        version: "0.2.0",
      },
      {
        path: "packages/config/package.json",
        name: "@graphtrace/config",
        version: "0.2.0",
      },
    ]);
  });
});

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
