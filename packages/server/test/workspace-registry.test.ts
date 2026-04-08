import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, test } from "vitest";

import {
  createWorkspaceRegistry,
  deriveWorkspaceIdentity,
} from "@graphtrace/storage";

const execFileAsync = promisify(execFile);

describe("workspace registry", () => {
  test("derives a stable workspace id and managed db path from a root path", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-home-"));
    const tempRoot = await mkdtemp(join(tmpdir(), "graphtrace-workspace-"));
    const workspaceRoot = join(tempRoot, "GraphTrace");
    await mkdir(workspaceRoot);

    const workspace = deriveWorkspaceIdentity(workspaceRoot, homeDir);

    expect(workspace.slug).toBe("graphtrace");
    expect(workspace.id).toMatch(/^graphtrace-[a-z0-9]{6,}$/);
    expect(workspace.dbPath).toBe(
      join(homeDir, ".graphtrace", "workspaces", workspace.id, "index.db"),
    );
  });

  test("creates, lists, and removes managed workspaces without touching repo files", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-home-"));
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-tawaco-"));
    const registry = createWorkspaceRegistry(homeDir);

    try {
      const created = registry.addWorkspace(workspaceRoot, { label: "tawaco" });

      expect(registry.listWorkspaces()).toEqual([
        expect.objectContaining({ id: created.id, label: "tawaco" }),
      ]);
      await expect(access(join(workspaceRoot, ".graphtrace"))).rejects.toThrow();

      registry.removeWorkspace(created.id);
      expect(registry.listWorkspaces()).toEqual([]);
    } finally {
      registry.close();
    }
  });

  test("allows concurrent workspace adds from separate processes", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-home-"));
    const workspaceRootA = await mkdtemp(join(tmpdir(), "graphtrace-concurrent-a-"));
    const workspaceRootB = await mkdtemp(join(tmpdir(), "graphtrace-concurrent-b-"));
    const scriptPath = join(homeDir, "add-workspace.mts");

    await writeFile(
      scriptPath,
      `
        import { createWorkspaceRegistry } from ${JSON.stringify(
          join(process.cwd(), "packages", "storage", "src", "index.ts"),
        )};

        const [homeDir, workspaceRoot, label] = process.argv.slice(2);
        const registry = createWorkspaceRegistry(homeDir);

        try {
          const workspace = registry.addWorkspace(workspaceRoot, { label });
          console.log(workspace.id);
        } finally {
          registry.close();
        }
      `,
      "utf8",
    );

    const runAdd = (workspaceRoot: string, label: string) =>
      execFileAsync(
        "pnpm",
        ["exec", "tsx", scriptPath, homeDir, workspaceRoot, label],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            FORCE_COLOR: "0",
          },
        },
      );

    await expect(
      Promise.all([
        runAdd(workspaceRootA, "workspace-a"),
        runAdd(workspaceRootB, "workspace-b"),
      ]),
    ).resolves.toHaveLength(2);

    const registry = createWorkspaceRegistry(homeDir);

    try {
      expect(registry.listWorkspaces()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: "workspace-a" }),
          expect.objectContaining({ label: "workspace-b" }),
        ]),
      );
    } finally {
      registry.close();
    }
  }, 20_000);
});
