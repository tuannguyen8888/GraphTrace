import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { ensureWorkspaceInitialized, loadGraphTraceConfig } from "../src/index";

describe("config", () => {
  test("ensureWorkspaceInitialized creates graphtrace directories and default config", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "graphtrace-config-"));

    const created = await ensureWorkspaceInitialized(workspaceRoot);

    const config = JSON.parse(await readFile(created.configPath, "utf8"));
    const cacheStat = await stat(created.cacheDir);
    const logsStat = await stat(created.logsDir);

    expect(config.workspaceGlobs).toEqual([
      "apps/*",
      "packages/*",
      "services/*",
    ]);
    expect(config.search.embeddingsProvider).toBe("none");
    expect(cacheStat.isDirectory()).toBe(true);
    expect(logsStat.isDirectory()).toBe(true);
  });

  test("loadGraphTraceConfig merges defaults with partial file config", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "graphtrace-config-load-"),
    );
    const initialized = await ensureWorkspaceInitialized(workspaceRoot, {
      web: { port: 9999 },
    });

    const loaded = await loadGraphTraceConfig(initialized.rootDir);

    expect(loaded.web.port).toBe(9999);
    expect(loaded.frameworks).toContain("express");
    expect(loaded.exclude).toContain("**/dist/**");
  });
});
