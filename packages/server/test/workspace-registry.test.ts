import { access, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  createWorkspaceRegistry,
  deriveWorkspaceIdentity,
} from "@graphtrace/storage";

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
});
