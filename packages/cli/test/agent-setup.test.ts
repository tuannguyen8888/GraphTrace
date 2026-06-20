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

  test("plans user-scoped targets under the current user home", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-agent-"));
    const userHomeDir = await mkdtemp(join(tmpdir(), "graphtrace-agent-home-"));

    const plan = await planAgentBootstrap({
      scope: "user",
      userHomeDir,
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
              path: join(userHomeDir, ".codex", "config.toml"),
            }),
            expect.objectContaining({
              path: join(
                userHomeDir,
                ".codex",
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
              path: join(userHomeDir, ".claude.json"),
            }),
            expect.objectContaining({
              path: join(userHomeDir, ".claude", "CLAUDE.md"),
            }),
          ]),
        }),
        expect.objectContaining({
          id: "cursor",
          targets: expect.arrayContaining([
            expect.objectContaining({
              path: join(userHomeDir, ".cursor", "mcp.json"),
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

  test("renders Codex config with a shared GraphTrace MCP stdio entry instead of a repo-pinned cwd", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-agent-"));
    const plan = await planAgentBootstrap({ workspaceRoot });

    const renderedFiles = renderAgentBootstrapFiles(plan);
    const codexConfig = renderedFiles.find(
      (file) => file.path === join(workspaceRoot, ".codex", "config.toml"),
    );

    expect(codexConfig?.content).toContain("[mcp_servers.graphtrace]");
    expect(codexConfig?.content).toContain('command = "graphtrace"');
    expect(codexConfig?.content).toContain('args = ["mcp"]');
    expect(codexConfig?.content).not.toContain('cwd = "."');
  });

  test("renders the Codex skill as an operating guide with concrete query sequences", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-agent-"));
    const plan = await planAgentBootstrap({ workspaceRoot });

    const renderedFiles = renderAgentBootstrapFiles(plan);
    const codexSkill = renderedFiles.find(
      (file) =>
        file.path ===
        join(workspaceRoot, ".agents", "skills", "graphtrace", "SKILL.md"),
    );

    expect(codexSkill?.content).toContain("Decision tree");
    expect(codexSkill?.content).toContain("`get_status` -> `run_index`");
    expect(codexSkill?.content).toContain(
      "`get_routes` -> `search_code` -> `get_data_flow`",
    );
    expect(codexSkill?.content).toContain(
      "`get_impact_analysis` -> `get_dependencies`",
    );
    expect(codexSkill?.content).toContain(
      "`search_code` -> `get_symbol_context`",
    );
    expect(codexSkill?.content).toContain(
      "`list_packages` -> `get_package_overview`",
    );
    expect(codexSkill?.content).toContain("Fallback when GraphTrace is sparse");
    expect(codexSkill?.content).toContain(
      "Summarize the relevant findings instead of pasting raw JSON",
    );
    expect(codexSkill?.content).toContain(
      "Re-run `run_index` after significant workspace changes",
    );
    expect(codexSkill?.content).toContain("`list_workspaces`");
    expect(codexSkill?.content).toContain("Query splitting");
    expect(codexSkill?.content).toContain("one concept per query");
    expect(codexSkill?.content).toContain(
      "`get_status` -> focused `search_code` -> `get_symbol_context` -> `graphtrace_get_execution_context` / `graphtrace_get_symbol_impact` -> targeted source fallback",
    );
    expect(codexSkill?.content).toContain("Trust `proven`");
    expect(codexSkill?.content).toContain("Confirm `inferred-strong`");
    expect(codexSkill?.content).toContain("Treat `inferred-weak` as a lead");
    expect(codexSkill?.content).toContain("Split multi-concept prompts");
    expect(codexSkill?.content).toContain("Stop expanding GraphTrace");
    expect(codexSkill?.content).toContain("`workspaceId`");
  });

  test("documents the refreshed agent workflow in the README", async () => {
    const readme = await readFile(join(process.cwd(), "README.md"), "utf8");

    expect(readme).toContain("Agent workflow with GraphTrace");
    expect(readme).toContain(
      "status -> focused search -> symbol context -> impact/execution -> targeted fallback",
    );
    expect(readme).toContain("Split multi-concept requests into short queries");
    expect(readme).toContain(
      "Trust `proven`, confirm `inferred-strong`, and treat `inferred-weak` as a lead",
    );
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

  test("renders user-scoped files without requiring a Cursor project rule", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-agent-"));
    const userHomeDir = await mkdtemp(join(tmpdir(), "graphtrace-agent-home-"));
    const plan = await planAgentBootstrap({
      scope: "user",
      userHomeDir,
      workspaceRoot,
    });

    const renderedFiles = renderAgentBootstrapFiles(plan);

    expect(renderedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: join(userHomeDir, ".codex", "config.toml"),
        }),
        expect.objectContaining({
          path: join(userHomeDir, ".codex", "skills", "graphtrace", "SKILL.md"),
        }),
        expect.objectContaining({
          path: join(userHomeDir, ".claude.json"),
        }),
        expect.objectContaining({
          path: join(userHomeDir, ".claude", "CLAUDE.md"),
        }),
        expect.objectContaining({
          path: join(userHomeDir, ".cursor", "mcp.json"),
        }),
      ]),
    );
    expect(
      renderedFiles.some((file) => file.path.endsWith("graphtrace.mdc")),
    ).toBe(false);
  });

  test("merges the user-scoped Codex config without overwriting unrelated settings", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-agent-"));
    const userHomeDir = await mkdtemp(join(tmpdir(), "graphtrace-agent-home-"));
    const codexDir = join(userHomeDir, ".codex");
    const codexConfigPath = join(codexDir, "config.toml");
    const plan = await planAgentBootstrap({
      scope: "user",
      userHomeDir,
      workspaceRoot,
      tools: ["codex"],
    });
    const renderedFiles = renderAgentBootstrapFiles(plan);

    await mkdir(codexDir, { recursive: true });
    await writeFile(
      codexConfigPath,
      [
        'model_provider = "llmgate"',
        'model = "gpt-5.4"',
        "",
        "[features]",
        "collab = true",
        "",
        "[mcp_servers.playwright]",
        'command = "npx"',
        'args = ["@playwright/mcp@latest"]',
        "",
        '[projects."/Users/example/WorkSpace"]',
        'trust_level = "trusted"',
        "",
      ].join("\n"),
      "utf8",
    );

    await applyRenderedAgentFiles(renderedFiles, {
      workspaceRoot,
      storageRoot: userHomeDir,
      backupBaseDir: userHomeDir,
    });

    const nextConfig = await readFile(codexConfigPath, "utf8");

    expect(nextConfig).toContain('model_provider = "llmgate"');
    expect(nextConfig).toContain("[features]");
    expect(nextConfig).toContain("[mcp_servers.playwright]");
    expect(nextConfig).toContain('[projects."/Users/example/WorkSpace"]');
    expect(nextConfig).toContain("[mcp_servers.graphtrace]");
    expect(nextConfig).toContain('command = "graphtrace"');
    expect(nextConfig).toContain('args = ["mcp"]');
    expect(nextConfig).not.toContain('cwd = "."');
  });

  test("replaces a legacy Codex GraphTrace section instead of duplicating it", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-agent-"));
    const userHomeDir = await mkdtemp(join(tmpdir(), "graphtrace-agent-home-"));
    const codexDir = join(userHomeDir, ".codex");
    const codexConfigPath = join(codexDir, "config.toml");
    const plan = await planAgentBootstrap({
      scope: "user",
      userHomeDir,
      workspaceRoot,
      tools: ["codex"],
    });
    const renderedFiles = renderAgentBootstrapFiles(plan);

    await mkdir(codexDir, { recursive: true });
    await writeFile(
      codexConfigPath,
      [
        'model_provider = "llmgate"',
        "",
        "[mcp_servers.graphtrace]",
        'command = "graphtrace"',
        'args = ["mcp"]',
        'cwd = "."',
        "",
        "[features]",
        "collab = true",
        "",
      ].join("\n"),
      "utf8",
    );

    await applyRenderedAgentFiles(renderedFiles, {
      workspaceRoot,
      storageRoot: userHomeDir,
      backupBaseDir: userHomeDir,
    });

    const nextConfig = await readFile(codexConfigPath, "utf8");

    expect(nextConfig.match(/\[mcp_servers\.graphtrace\]/g)).toHaveLength(1);
    expect(nextConfig).not.toContain('cwd = "."');
    expect(nextConfig).toContain("[features]");
    expect(nextConfig).toContain("# graphtrace:managed:start");
    expect(nextConfig).toContain("# graphtrace:managed:end");
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
      expect(file.content).toContain("list_workspaces");
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
      expect(file.content).toContain("get_status");
      expect(file.content).toContain("run_index");
      expect(file.content).toMatch(
        /Do not paste large raw outputs|Summarize the relevant findings instead of pasting raw JSON/,
      );
    }
  });
});
