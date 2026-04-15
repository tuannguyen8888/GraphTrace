import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);

describe("packaging", () => {
  test("root workspace npm pack excludes local artifact directories", async () => {
    const repoRoot = process.cwd();
    const outputArtifact = join(
      repoRoot,
      "output",
      "playwright",
      "packaging-fixture.txt",
    );
    const memoryArtifact = join(repoRoot, "memory", "packaging-fixture.md");

    await mkdir(join(repoRoot, "output", "playwright"), { recursive: true });
    await mkdir(join(repoRoot, "memory"), { recursive: true });
    await writeFile(outputArtifact, "artifact\n", "utf8");
    await writeFile(memoryArtifact, "artifact\n", "utf8");

    try {
      const result = await execFileAsync(
        "npm",
        ["pack", "--dry-run", "--json"],
        {
          cwd: repoRoot,
          maxBuffer: 1024 * 1024 * 20,
        },
      );
      const [payload] = JSON.parse(result.stdout) as Array<{
        files: Array<{ path: string }>;
      }>;
      const packedPaths = payload.files.map((entry) => entry.path);

      expect(packedPaths).not.toContain(
        "output/playwright/packaging-fixture.txt",
      );
      expect(packedPaths).not.toContain("memory/packaging-fixture.md");
      expect(packedPaths.some((entry) => entry.startsWith("memory/"))).toBe(
        false,
      );
      expect(packedPaths.some((entry) => entry.startsWith("output/"))).toBe(
        false,
      );
    } finally {
      await rm(outputArtifact, { force: true });
      await rm(memoryArtifact, { force: true });
    }
  }, 20_000);
});
