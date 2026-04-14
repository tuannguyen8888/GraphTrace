import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { ensureWorkspaceInitialized } from "@graphtrace/config";
import { runCli } from "../src/index";

const fixtureRoot = join(process.cwd(), "fixtures", "express-prisma-workspace");

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("watch", () => {
  test("reindexes add, change, and delete events and prints JSON cycle summaries", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "graphtrace-watch-"));
    const workspaceRoot = join(tempRoot, "workspace");
    tempRoots.push(tempRoot);
    await cp(fixtureRoot, workspaceRoot, { recursive: true });
    await rm(join(workspaceRoot, ".graphtrace"), {
      recursive: true,
      force: true,
    });
    await ensureWorkspaceInitialized(workspaceRoot);

    let stdout = "";
    let stderr = "";
    const watchResult = await runCli(
      ["watch", "--json", "--debounce-ms", "25"],
      {
        cwd: workspaceRoot,
        emitStdout: (line) => {
          stdout += `${line}\n`;
        },
        emitStderr: (line) => {
          stderr += `${line}\n`;
        },
      },
    );

    const readCycles = async (count: number) => {
      const start = Date.now();

      while (Date.now() - start < 15_000) {
        const lines = stdout
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as { trigger?: string });

        if (lines.length >= count) {
          return lines;
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      throw new Error(
        `Timed out waiting for ${count} watch cycles.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
      );
    };

    try {
      expect(watchResult.keepAlive).toBe(true);

      const addedFile = join(
        workspaceRoot,
        "apps",
        "api",
        "src",
        "routes",
        "admins.ts",
      );
      const editedFile = join(
        workspaceRoot,
        "apps",
        "api",
        "src",
        "services",
        "user-service.ts",
      );

      const initialCycles = await readCycles(1);
      expect(initialCycles[0]?.trigger).toBe("startup");

      await writeFile(
        addedFile,
        [
          'import { Router } from "express";',
          'import { listAdmins } from "../services/user-service.js";',
          "",
          "export function createAdminRouter() {",
          "  const router = Router();",
          '  router.get("/admins", listAdmins);',
          "  return router;",
          "}",
          "",
        ].join("\n"),
        "utf8",
      );

      await writeFile(
        editedFile,
        `${await readFile(editedFile, "utf8")}\nexport async function listAdmins(_request: unknown, reply: { send: (payload: unknown) => void }) {\n  const admins = await prisma.user.findMany();\n  reply.send(admins);\n}\n`,
        "utf8",
      );

      const addedCycles = await readCycles(2);
      expect(addedCycles[1]?.trigger).toBe("change");

      let status = await runCli(["status", "--json"], { cwd: workspaceRoot });
      let search = await runCli(["search", "admins", "--kind", "route"], {
        cwd: workspaceRoot,
      });

      expect(JSON.parse(status.stdout).counts.routeCount).toBe(2);
      expect(JSON.parse(search.stdout).items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "GET /admins",
          }),
        ]),
      );

      await rm(addedFile, { force: true });

      const deletedCycles = await readCycles(3);
      expect(deletedCycles[2]?.trigger).toBe("change");

      status = await runCli(["status", "--json"], { cwd: workspaceRoot });
      search = await runCli(["search", "admins", "--kind", "route"], {
        cwd: workspaceRoot,
      });

      expect(JSON.parse(status.stdout).counts.routeCount).toBe(1);
      expect(JSON.parse(search.stdout).items).toEqual([]);
    } finally {
      await watchResult.cleanup?.();
    }
  }, 20_000);

  test("detects added, changed, and removed php files in watch snapshots", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "graphtrace-watch-php-"));
    const workspaceRoot = join(tempRoot, "workspace");
    tempRoots.push(tempRoot);
    await cp(fixtureRoot, workspaceRoot, { recursive: true });
    await rm(join(workspaceRoot, ".graphtrace"), {
      recursive: true,
      force: true,
    });
    await ensureWorkspaceInitialized(workspaceRoot);

    let stdout = "";
    let stderr = "";
    const watchResult = await runCli(
      ["watch", "--json", "--debounce-ms", "25"],
      {
        cwd: workspaceRoot,
        emitStdout: (line) => {
          stdout += `${line}\n`;
        },
        emitStderr: (line) => {
          stderr += `${line}\n`;
        },
      },
    );

    const readCycles = async (count: number) => {
      const start = Date.now();

      while (Date.now() - start < 15_000) {
        const lines = stdout
          .trim()
          .split("\n")
          .filter(Boolean)
          .map(
            (line) =>
              JSON.parse(line) as {
                trigger?: string;
                changedFiles?: string[];
                removedFiles?: string[];
              },
          );

        if (lines.length >= count) {
          return lines;
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      throw new Error(
        `Timed out waiting for ${count} watch cycles.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
      );
    };

    try {
      expect(watchResult.keepAlive).toBe(true);

      const phpFile = join(
        workspaceRoot,
        "apps",
        "api",
        "src",
        "routes",
        "admins.php",
      );
      const phpRelativePath = "apps/api/src/routes/admins.php";

      const startupCycles = await readCycles(1);
      expect(startupCycles[0]?.trigger).toBe("startup");

      await writeFile(
        phpFile,
        "<?php\n\nfunction list_admins() {\n    return ['alice'];\n}\n",
        "utf8",
      );

      const addCycles = await readCycles(2);
      expect(addCycles[1]?.changedFiles).toContain(phpRelativePath);

      await writeFile(
        phpFile,
        "<?php\n\nfunction list_admins() {\n    return ['alice', 'bob'];\n}\n",
        "utf8",
      );

      const editCycles = await readCycles(3);
      expect(editCycles[2]?.changedFiles).toContain(phpRelativePath);

      await rm(phpFile, { force: true });

      const removeCycles = await readCycles(4);
      expect(removeCycles[3]?.removedFiles).toContain(phpRelativePath);
    } finally {
      await watchResult.cleanup?.();
    }
  }, 20_000);
});
