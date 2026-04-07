import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { planAgentBootstrap } from "../src/agent/bootstrap";
import {
  applyRenderedAgentFiles,
  reconcileManagedMarkdown,
} from "../src/agent/files";
import { renderAgentBootstrapFiles } from "../src/agent/templates";

describe("agent bootstrap", () => {
  test("plans project-local targets for codex, claude, and cursor", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-agent-"));

    const plan = await planAgentBootstrap({
      workspaceRoot,
    });

    expect(plan.tools.map((tool) => tool.id)).toEqual([
      "codex",
      "claude",
      "cursor",
    ]);

    expect(plan.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "codex",
          targets: expect.arrayContaining([
            expect.objectContaining({
              path: join(workspaceRoot, ".codex", "config.toml"),
            }),
            expect.objectContaining({
              path: join(
                workspaceRoot,
                ".agents",
                "skills",
                "graphtrace",
                "SKILL.md",
              ),
            }),
          ]),
        }),
        expect.objectContaining({
          id: "claude",
          targets: expect.arrayContaining([
            expect.objectContaining({
              path: join(workspaceRoot, ".mcp.json"),
            }),
            expect.objectContaining({
              path: join(workspaceRoot, ".claude", "CLAUDE.md"),
            }),
          ]),
        }),
        expect.objectContaining({
          id: "cursor",
          targets: expect.arrayContaining([
            expect.objectContaining({
              path: join(workspaceRoot, ".cursor", "mcp.json"),
            }),
            expect.objectContaining({
              path: join(workspaceRoot, ".cursor", "rules", "graphtrace.mdc"),
            }),
          ]),
        }),
      ]),
    );
  });

  test("keeps planning files even when tool executables are not installed", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-agent-"));

    const plan = await planAgentBootstrap({
      workspaceRoot,
      findExecutable: async () => null,
    });

    expect(plan.tools.map((tool) => tool.detection.status)).toEqual([
      "not_installed",
      "not_installed",
      "not_installed",
    ]);

    expect(plan.tools.every((tool) => tool.targets.length > 0)).toBe(true);
  });

  test("renders Codex config with a GraphTrace MCP stdio entry", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-agent-"));
    const plan = await planAgentBootstrap({ workspaceRoot });

    const renderedFiles = renderAgentBootstrapFiles(plan);
    const codexConfig = renderedFiles.find(
      (file) => file.path === join(workspaceRoot, ".codex", "config.toml"),
    );

    expect(codexConfig?.content).toContain("[mcp_servers.graphtrace]");
    expect(codexConfig?.content).toContain('command = "graphtrace"');
    expect(codexConfig?.content).toContain('args = ["mcp"]');
  });

  test("renders Claude config and managed CLAUDE.md guidance", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-agent-"));
    const plan = await planAgentBootstrap({ workspaceRoot });

    const renderedFiles = renderAgentBootstrapFiles(plan);
    const mcpConfig = renderedFiles.find(
      (file) => file.path === join(workspaceRoot, ".mcp.json"),
    );
    const claudeMemory = renderedFiles.find(
      (file) => file.path === join(workspaceRoot, ".claude", "CLAUDE.md"),
    );

    expect(mcpConfig?.content).toContain('"mcpServers"');
    expect(mcpConfig?.content).toContain('"graphtrace"');
    expect(mcpConfig?.content).toContain('"command": "graphtrace"');
    expect(claudeMemory?.content).toContain(
      "<!-- graphtrace:managed:start -->",
    );
    expect(claudeMemory?.content).toContain("<!-- graphtrace:managed:end -->");
  });

  test("renders Cursor config and a dedicated GraphTrace rule", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-agent-"));
    const plan = await planAgentBootstrap({ workspaceRoot });

    const renderedFiles = renderAgentBootstrapFiles(plan);
    const mcpConfig = renderedFiles.find(
      (file) => file.path === join(workspaceRoot, ".cursor", "mcp.json"),
    );
    const cursorRule = renderedFiles.find(
      (file) =>
        file.path === join(workspaceRoot, ".cursor", "rules", "graphtrace.mdc"),
    );

    expect(mcpConfig?.content).toContain('"mcpServers"');
    expect(mcpConfig?.content).toContain('"graphtrace"');
    expect(cursorRule?.content).toContain("description: GraphTrace usage");
    expect(cursorRule?.content).toContain("search_code");
  });

  test("re-running file reconciliation does not duplicate GraphTrace entries", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-agent-"));
    const plan = await planAgentBootstrap({ workspaceRoot });

    const renderedFiles = renderAgentBootstrapFiles(plan);

    await applyRenderedAgentFiles(renderedFiles);
    await applyRenderedAgentFiles(renderedFiles);

    const codexConfig = await readFile(
      join(workspaceRoot, ".codex", "config.toml"),
      "utf8",
    );
    const claudeMemory = await readFile(
      join(workspaceRoot, ".claude", "CLAUDE.md"),
      "utf8",
    );
    const cursorRule = await readFile(
      join(workspaceRoot, ".cursor", "rules", "graphtrace.mdc"),
      "utf8",
    );

    expect(codexConfig.match(/\[mcp_servers\.graphtrace\]/g)).toHaveLength(1);
    expect(
      claudeMemory.match(/<!-- graphtrace:managed:start -->/g),
    ).toHaveLength(1);
    expect(cursorRule.match(/description: GraphTrace usage/g)).toHaveLength(1);
  });

  test("reconciles a managed markdown block without disturbing surrounding content", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-agent-"));
    const targetPath = join(workspaceRoot, ".claude", "CLAUDE.md");

    await mkdir(join(workspaceRoot, ".claude"), { recursive: true });
    await writeFile(
      targetPath,
      [
        "# Team memory",
        "",
        "Keep release notes concise.",
        "",
        "<!-- graphtrace:managed:start -->",
        "Old GraphTrace block",
        "<!-- graphtrace:managed:end -->",
        "",
        "Do not remove this note.",
      ].join("\n"),
      "utf8",
    );

    const reconciled = reconcileManagedMarkdown(
      await readFile(targetPath, "utf8"),
      [
        "Use GraphTrace before broad scans.",
        "Check status before run_index.",
      ].join("\n"),
    );

    expect(reconciled).toContain("# Team memory");
    expect(reconciled).toContain("Do not remove this note.");
    expect(reconciled).toContain("Use GraphTrace before broad scans.");
    expect(reconciled.match(/<!-- graphtrace:managed:start -->/g)).toHaveLength(
      1,
    );
  });

  test("creates backups before overwriting existing repo files", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-agent-"));
    const plan = await planAgentBootstrap({ workspaceRoot });
    const renderedFiles = renderAgentBootstrapFiles(plan);
    const codexConfigPath = join(workspaceRoot, ".codex", "config.toml");

    await mkdir(join(workspaceRoot, ".codex"), { recursive: true });
    await writeFile(codexConfigPath, "# previous config\n", "utf8");

    const result = await applyRenderedAgentFiles(renderedFiles, {
      workspaceRoot,
    });

    expect(result.backups).toHaveLength(1);
    expect(result.backups[0]?.originalPath).toBe(codexConfigPath);
    expect(await readFile(result.backups[0].backupPath, "utf8")).toBe(
      "# previous config\n",
    );
  });

  test("generated instructions include the full GraphTrace tool mapping", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-agent-"));
    const plan = await planAgentBootstrap({ workspaceRoot });
    const renderedFiles = renderAgentBootstrapFiles(plan);

    const instructionFiles = renderedFiles.filter(
      (file) =>
        file.path.endsWith("SKILL.md") ||
        file.path.endsWith("CLAUDE.md") ||
        file.path.endsWith("graphtrace.mdc"),
    );

    for (const file of instructionFiles) {
      expect(file.content).toContain("search_code");
      expect(file.content).toContain("get_symbol_context");
      expect(file.content).toContain("get_dependencies");
      expect(file.content).toContain("get_impact_analysis");
      expect(file.content).toContain("get_data_flow");
      expect(file.content).toContain("get_routes");
      expect(file.content).toContain("get_status");
      expect(file.content).toContain("run_index");
    }
  });

  test("generated instructions steer agents away from broad filesystem scans", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-agent-"));
    const plan = await planAgentBootstrap({ workspaceRoot });
    const renderedFiles = renderAgentBootstrapFiles(plan);

    const instructionFiles = renderedFiles.filter(
      (file) =>
        file.path.endsWith("SKILL.md") ||
        file.path.endsWith("CLAUDE.md") ||
        file.path.endsWith("graphtrace.mdc"),
    );

    for (const file of instructionFiles) {
      expect(file.content).toContain("Prefer narrow queries first");
      expect(file.content).toContain("before filesystem-wide grep");
      expect(file.content).toContain("get_status` before `run_index");
      expect(file.content).toContain("Do not paste large raw outputs");
    }
  });
});
