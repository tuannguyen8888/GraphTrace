import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { runCli } from "../src/index";

describe("cli", () => {
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
});
