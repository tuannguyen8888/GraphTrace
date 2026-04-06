import { spawnSync } from "node:child_process";
import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { ensureWorkspaceInitialized } from "@graphtrace/config";
import { createGraphTraceMcpServer } from "@graphtrace/mcp";
import {
  runWorkspaceIndex,
  withWorkspaceQueryEngine,
} from "@graphtrace/query-engine";
import { startGraphTraceServer } from "@graphtrace/server";
import type {
  CliRunOptions,
  CliRunResult,
  DependencyDirection,
  GraphTraceStatus,
  IndexWorkspaceResult,
} from "@graphtrace/shared";

const WATCH_ROOTS = ["apps", "packages", "services"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const IGNORED_NAMES = new Set([
  "node_modules",
  ".graphtrace",
  "dist",
  ".next",
  "coverage",
]);

export async function runCli(
  argv: string[],
  options: CliRunOptions = {},
): Promise<CliRunResult> {
  const cwd = options.cwd ?? process.cwd();
  const [command, ...args] = argv;
  const emitStdout = options.emitStdout ?? (() => undefined);
  const emitStderr = options.emitStderr ?? (() => undefined);

  switch (command) {
    case "init": {
      const result = await ensureWorkspaceInitialized(cwd);
      return {
        exitCode: 0,
        stdout: `initialized:${result.configPath}`,
        stderr: "",
      };
    }
    case "doctor": {
      const pnpmVersion = spawnSync("pnpm", ["-v"], { encoding: "utf8" });
      return {
        exitCode: 0,
        stdout: [
          `cwd:${cwd}`,
          `node:${process.version}`,
          `pnpm:${pnpmVersion.stdout.trim() || "unknown"}`,
        ].join("\n"),
        stderr: "",
      };
    }
    case "index": {
      const asJson = args.includes("--json");
      const result = await runWorkspaceIndex({
        workspaceRoot: cwd,
        mode: args.includes("--full") ? "full" : "incremental",
      });
      return {
        exitCode: 0,
        stdout: asJson
          ? JSON.stringify(result, null, 2)
          : formatIndexResult(result),
        stderr: "",
      };
    }
    case "status": {
      const asJson = args.includes("--json");
      const output = withWorkspaceQueryEngine(cwd, (queryEngine, dbPath) =>
        queryEngine.status(cwd, dbPath),
      );

      return {
        exitCode: 0,
        stdout: asJson ? JSON.stringify(output, null, 2) : formatStatus(output),
        stderr: "",
      };
    }
    case "search":
    case "deps":
    case "impact":
    case "flow":
    case "routes": {
      const query = args[0] ?? "";
      const output = withWorkspaceQueryEngine(cwd, (queryEngine) =>
        command === "search"
          ? queryEngine.search(query, readOption(args, "--kind"))
          : command === "deps"
            ? queryEngine.dependencies(
                query,
                readDirectionOption(args, "--direction"),
                readNumberOption(args, "--depth") ?? 1,
              )
            : command === "impact"
              ? queryEngine.impact(
                  query,
                  readNumberOption(args, "--depth") ?? undefined,
                )
              : command === "flow"
                ? queryEngine.flow(
                    query,
                    readNumberOption(args, "--depth") ?? undefined,
                  )
                : queryEngine.routes(readOption(args, "--package")),
      );
      return {
        exitCode: 0,
        stdout: JSON.stringify(output, null, 2),
        stderr: "",
      };
    }
    case "web": {
      const portFlagIndex = args.indexOf("--port");
      const port = portFlagIndex >= 0 ? Number(args[portFlagIndex + 1]) : 4310;
      const server = await startGraphTraceServer({ workspaceRoot: cwd, port });
      return {
        exitCode: 0,
        stdout: `web:${server.address}`,
        stderr: "",
        keepAlive: true,
      };
    }
    case "mcp": {
      await createGraphTraceMcpServer({ workspaceRoot: cwd });
      return {
        exitCode: 0,
        stdout: "",
        stderr: "",
        keepAlive: true,
      };
    }
    case "watch": {
      const debounceMs = readNumberOption(args, "--debounce-ms") ?? 250;
      const asJson = args.includes("--json");
      const startup = await runWorkspaceIndex({
        workspaceRoot: cwd,
        mode: "full",
      });
      let snapshot = await collectWorkspaceSnapshot(cwd);
      let processing = false;
      let queued = false;

      emitStdout(
        formatWatchCycle(
          {
            trigger: "startup",
            changedFiles: [],
            removedFiles: [],
            result: startup,
          },
          asJson,
        ),
      );

      const executeCycle = async () => {
        if (processing) {
          queued = true;
          return;
        }

        processing = true;
        try {
          const nextSnapshot = await collectWorkspaceSnapshot(cwd);
          const { changedFiles, removedFiles } = diffWorkspaceSnapshots(
            snapshot,
            nextSnapshot,
          );

          if (changedFiles.length > 0 || removedFiles.length > 0) {
            const result = await runWorkspaceIndex({
              workspaceRoot: cwd,
              mode: "incremental",
              changedFiles,
              removedFiles,
            });
            snapshot = nextSnapshot;
            emitStdout(
              formatWatchCycle(
                {
                  trigger: "change",
                  changedFiles,
                  removedFiles,
                  result,
                },
                asJson,
              ),
            );
          } else {
            snapshot = nextSnapshot;
          }
        } catch (error) {
          emitStderr(
            error instanceof Error
              ? error.message
              : `watch failed: ${String(error)}`,
          );
        } finally {
          processing = false;
          if (queued) {
            queued = false;
            void executeCycle();
          }
        }
      };

      const interval = setInterval(() => {
        void executeCycle();
      }, debounceMs);
      const stop = () => {
        clearInterval(interval);
      };

      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);

      return {
        exitCode: 0,
        stdout: "",
        stderr: "",
        keepAlive: true,
        cleanup: stop,
      };
    }
    default:
      return {
        exitCode: 1,
        stdout: "",
        stderr: `unknown command: ${command ?? "<none>"}`,
      };
  }
}

function formatIndexResult(result: IndexWorkspaceResult): string {
  return [
    "Index completed",
    `db:${result.dbPath}`,
    `packages:${result.summary.packageCount}`,
    `files:${result.summary.fileCount}`,
    `symbols:${result.summary.symbolCount}`,
    `routes:${result.summary.routeCount}`,
    `query_edges:${result.summary.queryEdgeCount}`,
  ].join("\n");
}

function formatStatus(status: GraphTraceStatus): string {
  return [
    "GraphTrace status",
    `workspace:${status.workspaceRoot}`,
    `db:${status.dbPath}`,
    `last_index_mode:${status.lastIndexRun?.mode ?? "never"}`,
    `last_index_completed_at:${status.lastIndexRun?.completedAt ?? "never"}`,
    `packages:${status.counts.packageCount}`,
    `files:${status.counts.fileCount}`,
    `symbols:${status.counts.symbolCount}`,
    `routes:${status.counts.routeCount}`,
    `query_edges:${status.counts.queryEdgeCount}`,
  ].join("\n");
}

function formatWatchCycle(
  cycle: {
    trigger: "startup" | "change";
    changedFiles: string[];
    removedFiles: string[];
    result: IndexWorkspaceResult;
  },
  asJson: boolean,
): string {
  if (asJson) {
    return JSON.stringify({
      trigger: cycle.trigger,
      changedFiles: cycle.changedFiles,
      removedFiles: cycle.removedFiles,
      ...cycle.result,
    });
  }

  return [
    `watch:${cycle.trigger}`,
    `changed:${cycle.changedFiles.join(",") || "-"}`,
    `removed:${cycle.removedFiles.join(",") || "-"}`,
    formatIndexResult(cycle.result),
  ].join("\n");
}

async function collectWorkspaceSnapshot(workspaceRoot: string) {
  const snapshot = new Map<string, string>();
  for (const root of WATCH_ROOTS) {
    await walkWorkspace(join(workspaceRoot, root), workspaceRoot, snapshot);
  }
  return snapshot;
}

async function walkWorkspace(
  currentPath: string,
  workspaceRoot: string,
  snapshot: Map<string, string>,
): Promise<void> {
  let entries: Dirent[];

  try {
    entries = await readdir(currentPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (IGNORED_NAMES.has(entry.name)) {
      continue;
    }

    const absolutePath = join(currentPath, entry.name);
    if (entry.isDirectory()) {
      await walkWorkspace(absolutePath, workspaceRoot, snapshot);
      continue;
    }

    if (!entry.isFile() || !matchesSourceExtension(entry.name)) {
      continue;
    }

    const fileStat = await stat(absolutePath);
    const relativePath = absolutePath
      .slice(workspaceRoot.length + 1)
      .replaceAll("\\", "/");
    snapshot.set(relativePath, `${fileStat.mtimeMs}:${fileStat.size}`);
  }
}

function matchesSourceExtension(fileName: string): boolean {
  return [...SOURCE_EXTENSIONS].some((extension) =>
    fileName.endsWith(extension),
  );
}

function diffWorkspaceSnapshots(
  previousSnapshot: Map<string, string>,
  nextSnapshot: Map<string, string>,
) {
  const changedFiles: string[] = [];
  const removedFiles: string[] = [];

  for (const [filePath, signature] of nextSnapshot.entries()) {
    if (previousSnapshot.get(filePath) !== signature) {
      changedFiles.push(filePath);
    }
  }

  for (const filePath of previousSnapshot.keys()) {
    if (!nextSnapshot.has(filePath)) {
      removedFiles.push(filePath);
    }
  }

  return { changedFiles, removedFiles };
}

function readOption(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }

  return argv[index + 1];
}

function readNumberOption(argv: string[], name: string): number | undefined {
  const raw = readOption(argv, name);
  if (!raw) {
    return undefined;
  }

  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function readDirectionOption(
  argv: string[],
  name: string,
): DependencyDirection | undefined {
  const raw = readOption(argv, name);
  if (raw === "in" || raw === "out" || raw === "both") {
    return raw;
  }

  return undefined;
}
