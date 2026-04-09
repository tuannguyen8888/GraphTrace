import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

import { ensureWorkspaceInitialized } from "@graphtrace/config";
import { indexWorkspace } from "@graphtrace/indexer";

import { runCli } from "../src/index";

const execFileAsync = promisify(execFile);

function runCliProcess(
  cwd: string,
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      "pnpm",
      [
        "exec",
        "tsx",
        join(process.cwd(), "packages", "cli", "src", "bin.ts"),
        ...args,
      ],
      {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          FORCE_COLOR: "0",
        },
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

describe("cli", () => {
  const fixtureRoot = join(
    process.cwd(),
    "fixtures",
    "express-prisma-workspace",
  );

  test("init creates the .graphtrace workspace", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-cli-"));

    const result = await runCli(["init"], { cwd: workspaceRoot });

    const configStat = await stat(
      join(workspaceRoot, ".graphtrace", "config.json"),
    );
    expect(result.exitCode).toBe(0);
    expect(configStat.isFile()).toBe(true);
  });

  test("doctor reports local environment details", async () => {
    const result = await runCli(["doctor"], { cwd: process.cwd() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("node:");
    expect(result.stdout).toContain("pnpm:");
  });

  test("agent setup creates project-local files for codex, claude, and cursor", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "graphtrace-cli-agent-"),
    );

    const result = await runCli(["agent", "setup"], { cwd: workspaceRoot });

    expect(result.exitCode).toBe(0);
    await expect(
      access(join(workspaceRoot, ".codex", "config.toml")),
    ).resolves.toBeUndefined();
    await expect(
      access(
        join(workspaceRoot, ".agents", "skills", "graphtrace", "SKILL.md"),
      ),
    ).resolves.toBeUndefined();
    await expect(
      access(join(workspaceRoot, ".mcp.json")),
    ).resolves.toBeUndefined();
    await expect(
      access(join(workspaceRoot, ".claude", "CLAUDE.md")),
    ).resolves.toBeUndefined();
    await expect(
      access(join(workspaceRoot, ".cursor", "mcp.json")),
    ).resolves.toBeUndefined();
    await expect(
      access(join(workspaceRoot, ".cursor", "rules", "graphtrace.mdc")),
    ).resolves.toBeUndefined();
  });

  test("agent setup --dry-run previews changes without writing files", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "graphtrace-cli-agent-"),
    );

    const result = await runCli(["agent", "setup", "--dry-run"], {
      cwd: workspaceRoot,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent setup preview");
    await expect(
      access(join(workspaceRoot, ".codex", "config.toml")),
    ).rejects.toThrow();
  });

  test("agent setup --tool codex only writes Codex targets", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "graphtrace-cli-agent-"),
    );

    const result = await runCli(["agent", "setup", "--tool", "codex"], {
      cwd: workspaceRoot,
    });

    expect(result.exitCode).toBe(0);
    await expect(
      access(join(workspaceRoot, ".codex", "config.toml")),
    ).resolves.toBeUndefined();
    await expect(
      access(
        join(workspaceRoot, ".agents", "skills", "graphtrace", "SKILL.md"),
      ),
    ).resolves.toBeUndefined();
    await expect(access(join(workspaceRoot, ".mcp.json"))).rejects.toThrow();
    await expect(
      access(join(workspaceRoot, ".cursor", "mcp.json")),
    ).rejects.toThrow();
  });

  test("agent setup --write-mode local keeps generated files out of git status", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "graphtrace-cli-agent-local-"),
    );

    await writeFile(
      join(workspaceRoot, "package.json"),
      JSON.stringify({
        name: "graphtrace-agent-local",
        private: true,
        type: "module",
      }),
      "utf8",
    );
    await writeFile(join(workspaceRoot, ".gitignore"), ".graphtrace\n", "utf8");
    await execFileAsync("git", ["init"], { cwd: workspaceRoot });
    await execFileAsync("git", ["config", "user.name", "GraphTrace Test"], {
      cwd: workspaceRoot,
    });
    await execFileAsync(
      "git",
      ["config", "user.email", "graphtrace@example.com"],
      {
        cwd: workspaceRoot,
      },
    );
    await execFileAsync("git", ["add", "package.json", ".gitignore"], {
      cwd: workspaceRoot,
    });
    await execFileAsync("git", ["commit", "-m", "init"], {
      cwd: workspaceRoot,
    });
    await ensureWorkspaceInitialized(workspaceRoot);
    await execFileAsync("git", ["status", "--short"], { cwd: workspaceRoot });

    const result = await runCli(
      ["agent", "setup", "--tool", "codex", "--write-mode", "local"],
      {
        cwd: workspaceRoot,
      },
    );
    const status = await execFileAsync("git", ["status", "--short"], {
      cwd: workspaceRoot,
    });
    const exclude = await readFile(
      join(workspaceRoot, ".git", "info", "exclude"),
      "utf8",
    );

    expect(result.exitCode).toBe(0);
    expect(status.stdout.trim()).toBe("");
    expect(exclude).toContain("/.codex/config.toml");
    expect(exclude).toContain("/.agents/skills/graphtrace/SKILL.md");
  });

  test("agent restore removes git exclude entries created by local write mode", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "graphtrace-cli-agent-local-restore-"),
    );

    await writeFile(
      join(workspaceRoot, "package.json"),
      JSON.stringify({
        name: "graphtrace-agent-local-restore",
        private: true,
        type: "module",
      }),
      "utf8",
    );
    await writeFile(join(workspaceRoot, ".gitignore"), ".graphtrace\n", "utf8");
    await execFileAsync("git", ["init"], { cwd: workspaceRoot });
    await execFileAsync("git", ["config", "user.name", "GraphTrace Test"], {
      cwd: workspaceRoot,
    });
    await execFileAsync(
      "git",
      ["config", "user.email", "graphtrace@example.com"],
      {
        cwd: workspaceRoot,
      },
    );
    await execFileAsync("git", ["add", "package.json", ".gitignore"], {
      cwd: workspaceRoot,
    });
    await execFileAsync("git", ["commit", "-m", "init"], {
      cwd: workspaceRoot,
    });
    await ensureWorkspaceInitialized(workspaceRoot);

    await runCli(
      ["agent", "setup", "--tool", "codex", "--write-mode", "local"],
      {
        cwd: workspaceRoot,
      },
    );

    const setupExclude = await readFile(
      join(workspaceRoot, ".git", "info", "exclude"),
      "utf8",
    );
    const restoreResult = await runCli(
      ["agent", "restore", "--tool", "codex"],
      {
        cwd: workspaceRoot,
      },
    );
    const restoredExclude = await readFile(
      join(workspaceRoot, ".git", "info", "exclude"),
      "utf8",
    );

    expect(setupExclude).toContain("/.codex/config.toml");
    expect(setupExclude).toContain("/.agents/skills/graphtrace/SKILL.md");
    expect(restoreResult.exitCode).toBe(0);
    expect(restoredExclude).not.toContain("/.codex/config.toml");
    expect(restoredExclude).not.toContain(
      "/.agents/skills/graphtrace/SKILL.md",
    );
  });

  test("agent setup reports detected tools, changed files, and manual approval note", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "graphtrace-cli-agent-"),
    );

    const result = await runCli(["agent", "setup"], { cwd: workspaceRoot });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("tool:codex");
    expect(result.stdout).toContain("tool:claude");
    expect(result.stdout).toContain("tool:cursor");
    expect(result.stdout).toContain("file:");
    expect(result.stdout).toContain("approve GraphTrace MCP");
  });

  test("agent status reports configured tools after setup", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "graphtrace-cli-agent-status-"),
    );

    await runCli(["agent", "setup"], { cwd: workspaceRoot });
    const result = await runCli(["agent", "status"], { cwd: workspaceRoot });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("agent status");
    expect(result.stdout).toContain("tool:codex:configured");
    expect(result.stdout).toContain("tool:claude:configured");
    expect(result.stdout).toContain("tool:cursor:configured");
  });

  test("agent status --json returns structured tool status", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "graphtrace-cli-agent-status-json-"),
    );

    await runCli(["agent", "setup"], { cwd: workspaceRoot });
    const result = await runCli(["agent", "status", "--json"], {
      cwd: workspaceRoot,
    });

    const payload = JSON.parse(result.stdout) as {
      tools: Array<{
        id: string;
        status: string;
        configuredTargets: number;
        expectedTargets: number;
      }>;
    };

    expect(result.exitCode).toBe(0);
    expect(payload.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "codex",
          status: "configured",
          configuredTargets: 2,
          expectedTargets: 2,
        }),
        expect.objectContaining({
          id: "claude",
          status: "configured",
          configuredTargets: 2,
          expectedTargets: 2,
        }),
        expect.objectContaining({
          id: "cursor",
          status: "configured",
          configuredTargets: 2,
          expectedTargets: 2,
        }),
      ]),
    );
  });

  test("agent restore removes created files and restores overwritten content", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "graphtrace-cli-agent-restore-"),
    );
    const claudePath = join(workspaceRoot, ".claude", "CLAUDE.md");

    await ensureWorkspaceInitialized(workspaceRoot);
    await mkdir(join(workspaceRoot, ".claude"), { recursive: true });
    await writeFile(claudePath, "# existing claude memory\n", "utf8");

    await runCli(["agent", "setup"], { cwd: workspaceRoot });
    const restoreResult = await runCli(["agent", "restore"], {
      cwd: workspaceRoot,
    });

    expect(restoreResult.exitCode).toBe(0);
    expect(await readFile(claudePath, "utf8")).toBe(
      "# existing claude memory\n",
    );
    await expect(
      access(join(workspaceRoot, ".codex", "config.toml")),
    ).rejects.toThrow();
    await expect(access(join(workspaceRoot, ".mcp.json"))).rejects.toThrow();
    await expect(
      access(join(workspaceRoot, ".cursor", "mcp.json")),
    ).rejects.toThrow();
  });

  test("agent restore --tool codex only rolls back Codex files", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "graphtrace-cli-agent-restore-tool-"),
    );

    await runCli(["agent", "setup"], { cwd: workspaceRoot });
    const restoreResult = await runCli(
      ["agent", "restore", "--tool", "codex"],
      {
        cwd: workspaceRoot,
      },
    );

    expect(restoreResult.exitCode).toBe(0);
    await expect(
      access(join(workspaceRoot, ".codex", "config.toml")),
    ).rejects.toThrow();
    await expect(
      access(
        join(workspaceRoot, ".agents", "skills", "graphtrace", "SKILL.md"),
      ),
    ).rejects.toThrow();
    await expect(
      access(join(workspaceRoot, ".mcp.json")),
    ).resolves.toBeUndefined();
    await expect(
      access(join(workspaceRoot, ".claude", "CLAUDE.md")),
    ).resolves.toBeUndefined();
    await expect(
      access(join(workspaceRoot, ".cursor", "mcp.json")),
    ).resolves.toBeUndefined();
  });

  test("doctor --units reports discovered units for non-standard layouts", async () => {
    const result = await runCli(["doctor", "--units"], {
      cwd: join(process.cwd(), "fixtures", "backend-frontend-workspace"),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"rootPath": "backend"');
    expect(result.stdout).toContain('"rootPath": "frontend"');
  });

  test("doctor --plugins reports matched plugins for discovered units", async () => {
    const result = await runCli(["doctor", "--plugins"], {
      cwd: join(process.cwd(), "fixtures", "next-api-workspace"),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"pluginId": "framework:next"');
    expect(result.stdout).toContain('"pluginId": "language:js-ts"');
  });

  test("index supports --json and status reports workspace/index metadata", async () => {
    await ensureWorkspaceInitialized(fixtureRoot);

    const indexed = await runCli(["index", "--full", "--json"], {
      cwd: fixtureRoot,
    });
    const status = await runCli(["status", "--json"], {
      cwd: fixtureRoot,
    });

    const indexedPayload = JSON.parse(indexed.stdout) as {
      dbPath: string;
      summary: {
        packageCount: number;
      };
    };
    const statusPayload = JSON.parse(status.stdout) as {
      workspaceRoot: string;
      dbPath: string;
      units: Array<{ rootPath: string }>;
      counts: {
        packageCount: number;
        fileCount: number;
        symbolCount: number;
        routeCount: number;
        queryEdgeCount: number;
      };
      lastIndexRun: {
        mode: string;
        completedAt: string | null;
      } | null;
    };

    expect(indexed.exitCode).toBe(0);
    expect(indexedPayload.summary.packageCount).toBeGreaterThanOrEqual(2);

    expect(status.exitCode).toBe(0);
    expect(statusPayload.workspaceRoot).toBe(fixtureRoot);
    expect(statusPayload.dbPath).toBe(indexedPayload.dbPath);
    expect(statusPayload.counts.packageCount).toBeGreaterThanOrEqual(2);
    expect(statusPayload.counts.fileCount).toBeGreaterThan(0);
    expect(statusPayload.units.length).toBeGreaterThan(0);
    expect(statusPayload.lastIndexRun?.mode).toBe("full");
    expect(statusPayload.lastIndexRun?.completedAt).toBeTruthy();
  });

  test("index --explain returns discovered unit details", async () => {
    const result = await runCli(["index", "--full", "--explain"], {
      cwd: join(process.cwd(), "fixtures", "mixed-workspace"),
    });

    const payload = JSON.parse(result.stdout) as {
      units: Array<{ rootPath: string; indexingMode: string }>;
    };

    expect(result.exitCode).toBe(0);
    expect(payload.units).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rootPath: "services/api",
          indexingMode: "full",
        }),
        expect.objectContaining({
          rootPath: "workers/python",
          indexingMode: "shallow",
        }),
      ]),
    );
  });

  test("routes filters by package when --package is provided", async () => {
    await ensureWorkspaceInitialized(fixtureRoot);
    await indexWorkspace({ workspaceRoot: fixtureRoot, full: true });

    const matching = await runCli(["routes", "--package", "@fixture/api"], {
      cwd: fixtureRoot,
    });
    const missing = await runCli(["routes", "--package", "@fixture/missing"], {
      cwd: fixtureRoot,
    });

    expect(JSON.parse(matching.stdout).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/users",
        }),
      ]),
    );
    expect(JSON.parse(missing.stdout).items).toEqual([]);
  });

  test("search filters by kind when --kind is provided", async () => {
    await ensureWorkspaceInitialized(fixtureRoot);
    await indexWorkspace({ workspaceRoot: fixtureRoot, full: true });

    const routeOnly = await runCli(["search", "users", "--kind", "route"], {
      cwd: fixtureRoot,
    });
    const packageOnly = await runCli(
      ["search", "fixture", "--kind", "package"],
      {
        cwd: fixtureRoot,
      },
    );

    expect(JSON.parse(routeOnly.stdout).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "route",
          id: "GET /users",
        }),
      ]),
    );
    expect(
      JSON.parse(routeOnly.stdout).items.every(
        (item: { kind: string }) => item.kind === "route",
      ),
    ).toBe(true);
    expect(
      JSON.parse(packageOnly.stdout).items.every(
        (item: { kind: string }) => item.kind === "package",
      ),
    ).toBe(true);
  });

  test("deps honors --direction and --depth", async () => {
    await ensureWorkspaceInitialized(fixtureRoot);
    await indexWorkspace({ workspaceRoot: fixtureRoot, full: true });

    const inbound = await runCli(
      [
        "deps",
        "apps/api/src/services/user-service.ts",
        "--direction",
        "in",
        "--depth",
        "2",
      ],
      { cwd: fixtureRoot },
    );
    const outbound = await runCli(
      [
        "deps",
        "apps/api/src/routes/users.ts",
        "--direction",
        "out",
        "--depth",
        "2",
      ],
      { cwd: fixtureRoot },
    );

    const inboundItems = JSON.parse(inbound.stdout).items as Array<{
      path?: string;
    }>;
    const outboundItems = JSON.parse(outbound.stdout).items as Array<{
      path?: string;
    }>;

    expect(
      inboundItems.some((item) => item.path?.includes("routes/users.ts")),
    ).toBe(true);
    expect(inboundItems.some((item) => item.path?.includes("server.ts"))).toBe(
      true,
    );
    expect(
      inboundItems.some((item) => item.path?.includes("db/client.ts")),
    ).toBe(false);

    expect(
      outboundItems.some((item) => item.path?.includes("user-service.ts")),
    ).toBe(true);
    expect(
      outboundItems.some((item) => item.path?.includes("db/client.ts")),
    ).toBe(true);
    expect(outboundItems.some((item) => item.path?.includes("server.ts"))).toBe(
      false,
    );
  });

  test("concurrent query commands do not hit SQLITE_BUSY", async () => {
    const workspaceRoot = process.cwd();
    await ensureWorkspaceInitialized(workspaceRoot);
    await indexWorkspace({ workspaceRoot, full: true });

    const results = await Promise.all([
      runCliProcess(workspaceRoot, ["status", "--json"]),
      runCliProcess(workspaceRoot, ["routes"]),
      runCliProcess(workspaceRoot, ["flow", "GET /api/impact"]),
      runCliProcess(workspaceRoot, [
        "deps",
        "packages/server/src/index.ts",
        "--direction",
        "out",
        "--depth",
        "2",
      ]),
      runCliProcess(workspaceRoot, [
        "impact",
        "packages/server/src/index.ts",
        "--depth",
        "4",
      ]),
      runCliProcess(workspaceRoot, ["search", "runCli", "--kind", "symbol"]),
    ]);

    expect(results).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 0 })]),
    );
    expect(results.every((result) => result.code === 0)).toBe(true);
    expect(
      results.every((result) => !result.stderr.includes("database is locked")),
    ).toBe(true);
  }, 30_000);

  test("impact honors --depth", async () => {
    await ensureWorkspaceInitialized(fixtureRoot);
    await indexWorkspace({ workspaceRoot: fixtureRoot, full: true });

    const shallow = await runCli(
      ["impact", "apps/api/src/services/user-service.ts", "--depth", "1"],
      { cwd: fixtureRoot },
    );
    const deep = await runCli(
      ["impact", "apps/api/src/services/user-service.ts", "--depth", "6"],
      { cwd: fixtureRoot },
    );

    const shallowItems = JSON.parse(shallow.stdout).items as Array<{
      path?: string;
      id: string;
    }>;
    const deepItems = JSON.parse(deep.stdout).items as Array<{
      path?: string;
      id: string;
    }>;

    expect(shallowItems.some((item) => item.id === "GET /users")).toBe(true);
    expect(shallowItems.some((item) => item.path?.includes("server.ts"))).toBe(
      false,
    );
    expect(deepItems.some((item) => item.path?.includes("server.ts"))).toBe(
      true,
    );
  });

  test("workspace commands add, list, reindex, and remove managed workspaces", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-daemon-home-"));
    const added = await runCli(
      [
        "workspace",
        "add",
        fixtureRoot,
        "--label",
        "fixture",
        "--json",
        "--home",
        homeDir,
      ],
      {
        cwd: process.cwd(),
      },
    );

    const addedPayload = JSON.parse(added.stdout) as {
      id: string;
      label: string;
      dbPath: string;
    };
    const listed = await runCli(
      ["workspace", "list", "--json", "--home", homeDir],
      {
        cwd: process.cwd(),
      },
    );
    const listedPayload = JSON.parse(listed.stdout) as {
      items: Array<{
        id: string;
        label: string;
        dbPath: string;
      }>;
    };
    const reindexed = await runCli(
      ["workspace", "reindex", addedPayload.id, "--json", "--home", homeDir],
      {
        cwd: process.cwd(),
      },
    );
    const reindexedPayload = JSON.parse(reindexed.stdout) as {
      summary: {
        routeCount: number;
      };
    };
    const removed = await runCli(
      ["workspace", "remove", addedPayload.id, "--home", homeDir],
      {
        cwd: process.cwd(),
      },
    );
    const listedAfterRemoval = await runCli(
      ["workspace", "list", "--json", "--home", homeDir],
      {
        cwd: process.cwd(),
      },
    );

    expect(added.exitCode).toBe(0);
    expect(addedPayload.label).toBe("fixture");
    expect(addedPayload.dbPath).toContain(join(".graphtrace", "workspaces"));
    expect(listed.exitCode).toBe(0);
    expect(listedPayload.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: addedPayload.id,
          label: "fixture",
        }),
      ]),
    );
    expect(reindexed.exitCode).toBe(0);
    expect(reindexedPayload.summary.routeCount).toBeGreaterThan(0);
    expect(removed.exitCode).toBe(0);
    expect(JSON.parse(listedAfterRemoval.stdout).items).toEqual([]);
  });

  test("concurrent workspace add commands do not hit SQLITE_BUSY", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-daemon-home-"));
    const fixtureA = join(
      process.cwd(),
      "fixtures",
      "express-prisma-workspace",
    );
    const fixtureB = join(process.cwd(), "fixtures", "fastify-workspace");

    const [addA, addB] = await Promise.all([
      runCliProcess(process.cwd(), [
        "workspace",
        "add",
        fixtureA,
        "--label",
        "fixture-a",
        "--home",
        homeDir,
      ]),
      runCliProcess(process.cwd(), [
        "workspace",
        "add",
        fixtureB,
        "--label",
        "fixture-b",
        "--home",
        homeDir,
      ]),
    ]);

    const listed = await runCli(
      ["workspace", "list", "--json", "--home", homeDir],
      {
        cwd: process.cwd(),
      },
    );
    const listedPayload = JSON.parse(listed.stdout) as {
      items: Array<{ label: string }>;
    };

    expect(addA.code).toBe(0);
    expect(addB.code).toBe(0);
    expect(addA.stderr).not.toContain("database is locked");
    expect(addB.stderr).not.toContain("database is locked");
    expect(listedPayload.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "fixture-a" }),
        expect.objectContaining({ label: "fixture-b" }),
      ]),
    );
  }, 20_000);

  test("serve starts a multi-workspace daemon web server", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "graphtrace-daemon-home-"));
    const added = await runCli(
      [
        "workspace",
        "add",
        fixtureRoot,
        "--label",
        "fixture",
        "--json",
        "--home",
        homeDir,
      ],
      {
        cwd: process.cwd(),
      },
    );
    expect(added.exitCode).toBe(0);

    const server = await runCli(["serve", "--port", "0", "--home", homeDir], {
      cwd: process.cwd(),
    });

    expect(server.exitCode).toBe(0);
    expect(server.keepAlive).toBe(true);
    expect(server.stdout).toContain("serve:http://127.0.0.1:");

    const response = await fetch(
      `${server.stdout.replace("serve:", "")}/api/workspaces`,
    );
    const payload = (await response.json()) as {
      items: Array<{ label: string }>;
    };

    expect(response.ok).toBe(true);
    expect(payload.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "fixture" })]),
    );

    await server.cleanup?.();
  });
});
