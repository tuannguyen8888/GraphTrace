import { spawnSync } from "node:child_process";
import type { Dirent } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import type {
  CliRunOptions,
  CliRunResult,
  DependencyDirection,
  GraphTraceStatus,
  IndexWorkspaceResult,
} from "@graphtrace/shared";
import type { WorkspaceRecord } from "@graphtrace/storage";

import { type SupportedAgentTool, planAgentBootstrap } from "./agent/bootstrap";
import {
  type AgentSetupWriteMode,
  applyRenderedAgentFiles,
  loadAgentSetupState,
  restoreAgentSetupState,
} from "./agent/files";
import { inspectAgentBootstrapStatus } from "./agent/status";
import { renderAgentBootstrapFiles } from "./agent/templates";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const IGNORED_NAMES = new Set([
  "node_modules",
  ".graphtrace",
  "dist",
  ".next",
  "coverage",
]);
const HELP_ALIASES = new Set(["--help", "-h", "help"]);
const VERSION_ALIASES = new Set(["--version", "-v", "version"]);
const CLI_PACKAGE_JSON_URL = new URL("../package.json", import.meta.url);

interface CliHelpOption {
  flags: string;
  description: string;
}

interface CliHelpCommand {
  name: string;
  heading: string;
  summary: string;
  usage: string;
  options?: CliHelpOption[];
  examples?: string[];
  notes?: string[];
  commands?: CliHelpCommand[];
}

const CLI_HELP_TREE: CliHelpCommand = {
  name: "graphtrace",
  heading: "GraphTrace CLI",
  summary: "Local-first code graph for JavaScript and TypeScript projects.",
  usage: "graphtrace <command> [options]",
  options: [
    {
      flags: "-h, --help",
      description: "Show help for graphtrace or a command",
    },
    {
      flags: "-v, --version",
      description: "Show the graphtrace CLI version",
    },
  ],
  examples: [
    "graphtrace doctor --units",
    "graphtrace index --full --explain",
    "graphtrace search listUsers --kind symbol",
    "graphtrace workspace add /absolute/path/to/repo --label my-repo",
    "graphtrace agent setup --tool codex",
  ],
  notes: ["Run 'graphtrace <command> --help' for command-specific help."],
  commands: [
    {
      name: "init",
      heading: "graphtrace init",
      summary: "Initialize repo-local GraphTrace state.",
      usage: "graphtrace init",
      examples: ["graphtrace init"],
    },
    {
      name: "doctor",
      heading: "graphtrace doctor",
      summary:
        "Inspect local environment details and detected workspace units.",
      usage: "graphtrace doctor [--units] [--plugins]",
      options: [
        {
          flags: "--units",
          description: "Print discovered units for the current workspace.",
        },
        {
          flags: "--plugins",
          description: "Print matched plugins for each discovered unit.",
        },
      ],
      examples: [
        "graphtrace doctor",
        "graphtrace doctor --units",
        "graphtrace doctor --plugins",
      ],
    },
    {
      name: "index",
      heading: "graphtrace index",
      summary: "Build or refresh the workspace graph index.",
      usage: "graphtrace index [--full] [--json] [--explain]",
      options: [
        {
          flags: "--full",
          description: "Run a full index instead of an incremental refresh.",
        },
        {
          flags: "--json",
          description: "Print the index result as JSON.",
        },
        {
          flags: "--explain",
          description: "Print discovered unit details instead of the summary.",
        },
      ],
      examples: [
        "graphtrace index --full",
        "graphtrace index --full --json",
        "graphtrace index --full --explain",
      ],
    },
    {
      name: "status",
      heading: "graphtrace status",
      summary: "Show current workspace graph and index status.",
      usage: "graphtrace status [--json]",
      options: [
        {
          flags: "--json",
          description: "Print the status payload as JSON.",
        },
      ],
      examples: ["graphtrace status", "graphtrace status --json"],
    },
    {
      name: "search",
      heading: "graphtrace search",
      summary: "Search symbols, routes, files, and packages.",
      usage: "graphtrace search <query> [--kind <symbol|route|file|package>]",
      options: [
        {
          flags: "--kind <kind>",
          description: "Limit results to one search kind.",
        },
      ],
      examples: [
        "graphtrace search listUsers --kind symbol",
        "graphtrace search users --kind route",
      ],
    },
    {
      name: "deps",
      heading: "graphtrace deps",
      summary: "Explore dependency edges for a target.",
      usage:
        "graphtrace deps <target> [--direction <in|out|both>] [--depth <n>]",
      options: [
        {
          flags: "--direction <dir>",
          description: "Choose inbound, outbound, or bidirectional traversal.",
        },
        {
          flags: "--depth <n>",
          description: "Limit traversal depth to a positive integer.",
        },
      ],
      examples: [
        'graphtrace deps "apps/api/src/routes/users.ts" --direction out --depth 2',
      ],
    },
    {
      name: "impact",
      heading: "graphtrace impact",
      summary: "Show downstream impact for a target.",
      usage: "graphtrace impact <target> [--depth <n>]",
      options: [
        {
          flags: "--depth <n>",
          description: "Limit impact traversal depth to a positive integer.",
        },
      ],
      examples: [
        "graphtrace impact apps/api/src/services/user-service.ts --depth 4",
      ],
    },
    {
      name: "flow",
      heading: "graphtrace flow",
      summary: "Show execution flow for a route or symbol.",
      usage: "graphtrace flow <target> [--depth <n>]",
      options: [
        {
          flags: "--depth <n>",
          description: "Limit flow traversal depth to a positive integer.",
        },
      ],
      examples: ['graphtrace flow "GET /users"'],
    },
    {
      name: "routes",
      heading: "graphtrace routes",
      summary: "List discovered routes.",
      usage: "graphtrace routes [--package <name>]",
      options: [
        {
          flags: "--package <name>",
          description: "Filter routes to a single package name.",
        },
      ],
      examples: [
        "graphtrace routes",
        "graphtrace routes --package @fixture/api",
      ],
    },
    {
      name: "watch",
      heading: "graphtrace watch",
      summary: "Watch source files and reindex on changes.",
      usage: "graphtrace watch [--json] [--debounce-ms <ms>]",
      options: [
        {
          flags: "--json",
          description: "Emit each watch cycle as JSON.",
        },
        {
          flags: "--debounce-ms <ms>",
          description: "Set the polling interval in milliseconds.",
        },
      ],
      examples: ["graphtrace watch --json --debounce-ms 250"],
      notes: ["Runs a full index once on startup and then stays alive."],
    },
    {
      name: "web",
      heading: "graphtrace web",
      summary: "Start the repo-local GraphTrace web UI.",
      usage: "graphtrace web [--port <port>]",
      options: [
        {
          flags: "--port <port>",
          description: "Choose the local HTTP port. Default: 4310.",
        },
      ],
      examples: ["graphtrace web --port 4310"],
    },
    {
      name: "serve",
      heading: "graphtrace serve",
      summary: "Start the multi-workspace GraphTrace daemon and web API.",
      usage: "graphtrace serve [--port <port>] [--home <path>]",
      options: [
        {
          flags: "--port <port>",
          description: "Choose the local HTTP port. Default: 4310.",
        },
        {
          flags: "--home <path>",
          description: "Override the GraphTrace home directory.",
        },
      ],
      examples: ["graphtrace serve --port 4310"],
    },
    {
      name: "workspace",
      heading: "graphtrace workspace",
      summary: "Manage registered GraphTrace workspaces.",
      usage: "graphtrace workspace <subcommand> [options]",
      commands: [
        {
          name: "add",
          heading: "graphtrace workspace add",
          summary: "Register a workspace root with the GraphTrace daemon.",
          usage:
            "graphtrace workspace add <root-path> [--label <label>] [--json] [--home <path>]",
          options: [
            {
              flags: "--label <label>",
              description: "Set a display label for the workspace.",
            },
            {
              flags: "--json",
              description: "Print the created workspace record as JSON.",
            },
            {
              flags: "--home <path>",
              description: "Override the GraphTrace home directory.",
            },
          ],
          examples: [
            "graphtrace workspace add /absolute/path/to/repo --label my-repo",
          ],
        },
        {
          name: "list",
          heading: "graphtrace workspace list",
          summary: "List registered workspaces.",
          usage: "graphtrace workspace list [--json] [--home <path>]",
          options: [
            {
              flags: "--json",
              description: "Print the workspace list as JSON.",
            },
            {
              flags: "--home <path>",
              description: "Override the GraphTrace home directory.",
            },
          ],
          examples: ["graphtrace workspace list --json"],
        },
        {
          name: "remove",
          heading: "graphtrace workspace remove",
          summary: "Remove a registered workspace.",
          usage: "graphtrace workspace remove <workspace-id> [--home <path>]",
          options: [
            {
              flags: "--home <path>",
              description: "Override the GraphTrace home directory.",
            },
          ],
          examples: ["graphtrace workspace remove graphtrace-123abc"],
        },
        {
          name: "reindex",
          heading: "graphtrace workspace reindex",
          summary: "Reindex a registered workspace.",
          usage:
            "graphtrace workspace reindex <workspace-id> [--json] [--home <path>]",
          options: [
            {
              flags: "--json",
              description: "Print the reindex result as JSON.",
            },
            {
              flags: "--home <path>",
              description: "Override the GraphTrace home directory.",
            },
          ],
          examples: ["graphtrace workspace reindex graphtrace-123abc --json"],
        },
      ],
      examples: [
        "graphtrace workspace add /absolute/path/to/repo --label my-repo",
        "graphtrace workspace list --json",
      ],
      notes: ["Run 'graphtrace workspace <subcommand> --help' for details."],
    },
    {
      name: "agent",
      heading: "graphtrace agent",
      summary: "Generate and manage project-local agent integration files.",
      usage: "graphtrace agent <subcommand> [options]",
      commands: [
        {
          name: "setup",
          heading: "graphtrace agent setup",
          summary: "Generate project-local MCP and instruction files.",
          usage:
            "graphtrace agent setup [--tool <codex|claude|cursor>] [--dry-run] [--write-mode <tracked|local>]",
          options: [
            {
              flags: "--tool <tool>",
              description: "Limit setup to one supported tool.",
            },
            {
              flags: "--dry-run",
              description: "Preview planned changes without writing files.",
            },
            {
              flags: "--write-mode <mode>",
              description:
                "Write generated files as tracked or local-only artifacts.",
            },
          ],
          examples: [
            "graphtrace agent setup",
            "graphtrace agent setup --dry-run",
            "graphtrace agent setup --tool codex",
          ],
        },
        {
          name: "status",
          heading: "graphtrace agent status",
          summary: "Inspect configured GraphTrace agent files.",
          usage:
            "graphtrace agent status [--tool <codex|claude|cursor>] [--json]",
          options: [
            {
              flags: "--tool <tool>",
              description: "Limit inspection to one supported tool.",
            },
            {
              flags: "--json",
              description: "Print status as structured JSON.",
            },
          ],
          examples: [
            "graphtrace agent status",
            "graphtrace agent status --json",
          ],
        },
        {
          name: "restore",
          heading: "graphtrace agent restore",
          summary: "Restore the most recent agent setup state.",
          usage: "graphtrace agent restore [--tool <codex|claude|cursor>]",
          options: [
            {
              flags: "--tool <tool>",
              description: "Restore only one supported tool.",
            },
          ],
          examples: [
            "graphtrace agent restore",
            "graphtrace agent restore --tool codex",
          ],
        },
      ],
      examples: [
        "graphtrace agent setup --tool codex",
        "graphtrace agent status",
        "graphtrace agent restore",
      ],
      notes: ["Run 'graphtrace agent <subcommand> --help' for details."],
    },
    {
      name: "mcp",
      heading: "graphtrace mcp",
      summary: "Start the GraphTrace MCP server on stdio.",
      usage: "graphtrace mcp",
      examples: ["graphtrace mcp"],
      notes: ["This command stays alive and serves MCP requests over stdio."],
    },
  ],
};

let cachedCliVersion: string | undefined;

async function loadConfigModule() {
  return import("@graphtrace/config");
}

async function loadIndexerModule() {
  return import("@graphtrace/indexer");
}

async function loadMcpModule() {
  return import("@graphtrace/mcp");
}

async function loadQueryEngineModule() {
  return import("@graphtrace/query-engine");
}

async function loadServerModule() {
  return import("@graphtrace/server");
}

export async function runCli(
  argv: string[],
  options: CliRunOptions = {},
): Promise<CliRunResult> {
  const cwd = options.cwd ?? process.cwd();
  const [command, ...args] = argv;
  const emitStdout = options.emitStdout ?? (() => undefined);
  const emitStderr = options.emitStderr ?? (() => undefined);

  const helpResult = resolveHelpRequest(argv);
  if (helpResult) {
    return helpResult;
  }

  if (command && VERSION_ALIASES.has(command)) {
    return {
      exitCode: 0,
      stdout: await readCliVersion(),
      stderr: "",
    };
  }

  switch (command) {
    case "init": {
      const { ensureWorkspaceInitialized } = await loadConfigModule();
      const result = await ensureWorkspaceInitialized(cwd);
      return {
        exitCode: 0,
        stdout: `initialized:${result.configPath}`,
        stderr: "",
      };
    }
    case "doctor": {
      const { defaultGraphTraceConfig } = await loadConfigModule();
      const { inspectWorkspace } = await loadIndexerModule();

      if (args.includes("--units")) {
        const inspection = await inspectWorkspace(cwd, defaultGraphTraceConfig);
        return {
          exitCode: 0,
          stdout: JSON.stringify(inspection.units, null, 2),
          stderr: "",
        };
      }

      if (args.includes("--plugins")) {
        const inspection = await inspectWorkspace(cwd, defaultGraphTraceConfig);
        return {
          exitCode: 0,
          stdout: JSON.stringify(
            inspection.units.map((unit) => ({
              rootPath: unit.rootPath,
              plugins: unit.pluginMatches,
            })),
            null,
            2,
          ),
          stderr: "",
        };
      }

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
    case "agent": {
      const [subcommand, ...agentArgs] = args;
      const selectedTool = readAgentToolOption(agentArgs, "--tool");
      const writeMode = readAgentWriteModeOption(agentArgs, "--write-mode");

      switch (subcommand) {
        case "setup": {
          const plan = await planAgentBootstrap({
            workspaceRoot: cwd,
            tools: selectedTool ? [selectedTool] : undefined,
          });
          const renderedFiles = renderAgentBootstrapFiles(plan);
          const dryRun = agentArgs.includes("--dry-run");

          const applyResult = dryRun
            ? {
                backups: [],
                state: { entries: [], updatedAt: "", version: 1 as const },
                writtenFiles: [],
              }
            : await applyRenderedAgentFiles(renderedFiles, {
                workspaceRoot: cwd,
                writeMode,
              });

          return {
            exitCode: 0,
            stdout: formatAgentSetupResult(
              plan,
              dryRun
                ? renderedFiles.map((file) => file.path)
                : applyResult.writtenFiles,
              dryRun,
              applyResult.backups.map((backup) => backup.backupPath),
            ),
            stderr: "",
          };
        }
        case "status": {
          const plan = await planAgentBootstrap({
            workspaceRoot: cwd,
            tools: selectedTool ? [selectedTool] : undefined,
          });
          const statuses = await inspectAgentBootstrapStatus(plan);
          return {
            exitCode: 0,
            stdout: agentArgs.includes("--json")
              ? JSON.stringify({ tools: statuses }, null, 2)
              : formatAgentStatusResult(statuses),
            stderr: "",
          };
        }
        case "restore": {
          const state = await loadAgentSetupState(cwd);
          if (!state) {
            return {
              exitCode: 1,
              stdout: "",
              stderr: "no agent setup state found to restore",
            };
          }

          const restoredFiles = await restoreAgentSetupState(
            cwd,
            state,
            selectedTool,
          );
          return {
            exitCode: 0,
            stdout: formatAgentRestoreResult(restoredFiles),
            stderr: "",
          };
        }
        default:
          return {
            exitCode: 1,
            stdout: "",
            stderr: formatUnknownCommandError(
              "agent",
              subcommand,
              "graphtrace agent --help",
            ),
          };
      }
    }
    case "index": {
      const { runWorkspaceIndex } = await loadQueryEngineModule();
      const asJson = args.includes("--json");
      const explain = args.includes("--explain");
      const result = await runWorkspaceIndex({
        workspaceRoot: cwd,
        mode: args.includes("--full") ? "full" : "incremental",
      });
      return {
        exitCode: 0,
        stdout: explain
          ? JSON.stringify(result.explain, null, 2)
          : asJson
            ? JSON.stringify(result, null, 2)
            : formatIndexResult(result),
        stderr: "",
      };
    }
    case "status": {
      const { withWorkspaceQueryEngine } = await loadQueryEngineModule();
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
      const { withWorkspaceQueryEngine } = await loadQueryEngineModule();
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
      const { startGraphTraceServer } = await loadServerModule();
      const port = readPortOption(args, "--port") ?? 4310;
      const server = await startGraphTraceServer({ workspaceRoot: cwd, port });
      return {
        exitCode: 0,
        stdout: `web:${server.address}`,
        stderr: "",
        keepAlive: true,
        cleanup: async () => {
          await server.close();
        },
      };
    }
    case "serve": {
      const { createGraphTraceDaemon, startGraphTraceServer } =
        await loadServerModule();
      const daemon = createGraphTraceDaemon({
        homeDir: readHomeOption(args),
      });
      const port = readPortOption(args, "--port") ?? 4310;
      const server = await startGraphTraceServer({ daemon, port });
      return {
        exitCode: 0,
        stdout: `serve:${server.address}`,
        stderr: "",
        keepAlive: true,
        cleanup: async () => {
          await server.close();
          daemon.close();
        },
      };
    }
    case "workspace": {
      const { createGraphTraceDaemon } = await loadServerModule();
      const [subcommand, ...workspaceArgs] = args;
      const daemon = createGraphTraceDaemon({
        homeDir: readHomeOption(workspaceArgs),
      });

      try {
        switch (subcommand) {
          case "add": {
            const rawRoot = workspaceArgs[0];
            if (!rawRoot) {
              return {
                exitCode: 1,
                stdout: "",
                stderr: "workspace add requires a root path",
              };
            }

            const workspace = await daemon.addWorkspace(
              resolveWorkspaceArg(cwd, rawRoot),
              {
                label: readOption(workspaceArgs, "--label"),
              },
            );
            return {
              exitCode: 0,
              stdout: workspaceArgs.includes("--json")
                ? JSON.stringify(workspace, null, 2)
                : formatWorkspaceRecord(workspace),
              stderr: "",
            };
          }
          case "list": {
            const items = daemon.listWorkspaces();
            return {
              exitCode: 0,
              stdout: workspaceArgs.includes("--json")
                ? JSON.stringify({ items }, null, 2)
                : formatWorkspaceList(items),
              stderr: "",
            };
          }
          case "remove": {
            const workspaceId = workspaceArgs[0];
            if (!workspaceId) {
              return {
                exitCode: 1,
                stdout: "",
                stderr: "workspace remove requires a workspace id",
              };
            }

            daemon.removeWorkspace(workspaceId);
            return {
              exitCode: 0,
              stdout: `removed:${workspaceId}`,
              stderr: "",
            };
          }
          case "reindex": {
            const workspaceId = workspaceArgs[0];
            if (!workspaceId) {
              return {
                exitCode: 1,
                stdout: "",
                stderr: "workspace reindex requires a workspace id",
              };
            }

            const workspace = await daemon.reindexWorkspace(workspaceId);
            const status = daemon.status(workspaceId);
            return {
              exitCode: 0,
              stdout: workspaceArgs.includes("--json")
                ? JSON.stringify(
                    {
                      workspace,
                      summary: status.counts,
                    },
                    null,
                    2,
                  )
                : [
                    "workspace reindexed",
                    formatWorkspaceRecord(workspace),
                    `packages:${status.counts.packageCount}`,
                    `files:${status.counts.fileCount}`,
                    `symbols:${status.counts.symbolCount}`,
                    `routes:${status.counts.routeCount}`,
                    `query_edges:${status.counts.queryEdgeCount}`,
                  ].join("\n"),
              stderr: "",
            };
          }
          default:
            return {
              exitCode: 1,
              stdout: "",
              stderr: formatUnknownCommandError(
                "workspace",
                subcommand,
                "graphtrace workspace --help",
              ),
            };
        }
      } finally {
        daemon.close();
      }
    }
    case "mcp": {
      const { createGraphTraceMcpServer } = await loadMcpModule();
      await createGraphTraceMcpServer({ workspaceRoot: cwd });
      return {
        exitCode: 0,
        stdout: "",
        stderr: "",
        keepAlive: true,
      };
    }
    case "watch": {
      const { runWorkspaceIndex } = await loadQueryEngineModule();
      const debounceMs = readNumberOption(args, "--debounce-ms") ?? 250;
      const asJson = args.includes("--json");
      const startup = await runWorkspaceIndex({
        workspaceRoot: cwd,
        mode: "full",
      });
      let snapshot = await collectWorkspaceSnapshot(cwd);
      let processing = false;
      let queued = false;
      let stopped = false;
      let currentCycle: Promise<void> | null = null;

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
        if (stopped) {
          return;
        }

        if (processing) {
          queued = true;
          return;
        }

        processing = true;
        currentCycle = (async () => {
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
            currentCycle = null;
            if (queued && !stopped) {
              queued = false;
              void executeCycle();
            }
          }
        })();

        await currentCycle;
      };

      const interval = setInterval(() => {
        void executeCycle();
      }, debounceMs);
      const stop = async () => {
        stopped = true;
        queued = false;
        clearInterval(interval);
        process.off("SIGINT", handleSigInt);
        process.off("SIGTERM", handleSigTerm);
        while (currentCycle) {
          await currentCycle;
        }
      };

      const handleSigInt = () => {
        void stop();
      };
      const handleSigTerm = () => {
        void stop();
      };

      process.once("SIGINT", handleSigInt);
      process.once("SIGTERM", handleSigTerm);

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
        stderr: formatUnknownCommandError(
          "command",
          command,
          "graphtrace --help",
        ),
      };
  }
}

function formatIndexResult(result: IndexWorkspaceResult): string {
  return [
    "Index completed",
    `db:${result.dbPath}`,
    `units:${result.units.length}`,
    `packages:${result.summary.packageCount}`,
    `files:${result.summary.fileCount}`,
    `symbols:${result.summary.symbolCount}`,
    `routes:${result.summary.routeCount}`,
    `query_edges:${result.summary.queryEdgeCount}`,
  ].join("\n");
}

async function readCliVersion(): Promise<string> {
  if (cachedCliVersion) {
    return cachedCliVersion;
  }

  const manifest = JSON.parse(await readFile(CLI_PACKAGE_JSON_URL, "utf8")) as {
    version?: string;
  };
  cachedCliVersion = manifest.version ?? "0.0.0";
  return cachedCliVersion;
}

function resolveHelpRequest(argv: string[]): CliRunResult | undefined {
  if (argv.length === 0) {
    return undefined;
  }

  const [command, ...args] = argv;
  if (command === "help") {
    return {
      exitCode: 0,
      stdout: renderHelp(resolveHelpNode(args)),
      stderr: "",
    };
  }

  const lastArg = argv.at(-1);
  if (!lastArg || !HELP_ALIASES.has(lastArg)) {
    return undefined;
  }

  return {
    exitCode: 0,
    stdout: renderHelp(resolveHelpNode(argv.slice(0, -1))),
    stderr: "",
  };
}

function resolveHelpNode(pathTokens: string[]): CliHelpCommand {
  let node = CLI_HELP_TREE;

  for (const token of pathTokens) {
    if (token.startsWith("-")) {
      break;
    }

    const nextNode = node.commands?.find((command) => command.name === token);
    if (!nextNode) {
      break;
    }

    node = nextNode;
  }

  return node;
}

function renderHelp(command: CliHelpCommand): string {
  const lines = [command.heading];

  if (command.heading === CLI_HELP_TREE.heading) {
    lines.push("");
  } else {
    lines.push(command.summary, "");
  }

  lines.push("Usage", `  ${command.usage}`);

  if (command.commands && command.commands.length > 0) {
    lines.push("", "Commands", ...formatHelpRows(command.commands));
  }

  if (command.options && command.options.length > 0) {
    lines.push("", "Options", ...formatOptionRows(command.options));
  }

  if (command.examples && command.examples.length > 0) {
    lines.push(
      "",
      "Examples",
      ...command.examples.map((example) => `  ${example}`),
    );
  }

  if (command.notes && command.notes.length > 0) {
    lines.push("", "Notes", ...command.notes.map((note) => `  ${note}`));
  }

  return lines.join("\n");
}

function formatHelpRows(commands: CliHelpCommand[]): string[] {
  const width = Math.max(...commands.map((command) => command.name.length), 0);
  return commands.map(
    (command) => `  ${command.name.padEnd(width, " ")}  ${command.summary}`,
  );
}

function formatOptionRows(options: CliHelpOption[]): string[] {
  const width = Math.max(...options.map((option) => option.flags.length), 0);
  return options.map(
    (option) => `  ${option.flags.padEnd(width, " ")}  ${option.description}`,
  );
}

function formatUnknownCommandError(
  scope: string,
  value: string | undefined,
  helpCommand: string,
): string {
  return [
    `unknown ${scope}: ${value ?? "<none>"}`,
    `Run '${helpCommand}' for usage.`,
  ].join("\n");
}

function formatStatus(status: GraphTraceStatus): string {
  return [
    "GraphTrace status",
    `workspace:${status.workspaceRoot}`,
    `db:${status.dbPath}`,
    `last_index_mode:${status.lastIndexRun?.mode ?? "never"}`,
    `last_index_completed_at:${status.lastIndexRun?.completedAt ?? "never"}`,
    `units:${status.units.length}`,
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

function formatWorkspaceRecord(workspace: WorkspaceRecord): string {
  return [
    `workspace:${workspace.id}`,
    `label:${workspace.label}`,
    `root:${workspace.canonicalRootPath}`,
    `status:${workspace.status}`,
    `db:${workspace.dbPath}`,
  ].join("\n");
}

function formatWorkspaceList(workspaces: WorkspaceRecord[]): string {
  if (workspaces.length === 0) {
    return "workspaces:0";
  }

  return [
    `workspaces:${workspaces.length}`,
    ...workspaces.map(
      (workspace) =>
        `${workspace.id}\t${workspace.label}\t${workspace.status}\t${workspace.canonicalRootPath}`,
    ),
  ].join("\n");
}

async function collectWorkspaceSnapshot(workspaceRoot: string) {
  const snapshot = new Map<string, string>();
  const config = await loadRuntimeConfig(workspaceRoot);
  const { inspectWorkspace } = await loadIndexerModule();
  const inspection = await inspectWorkspace(workspaceRoot, config);
  const roots = inspection.units
    .filter((unit) => unit.indexingMode === "full")
    .flatMap((unit) =>
      unit.sourceRoots.length > 0 ? unit.sourceRoots : [unit.rootPath],
    );

  for (const root of roots) {
    await walkWorkspace(join(workspaceRoot, root), workspaceRoot, snapshot);
  }
  return snapshot;
}

async function loadRuntimeConfig(workspaceRoot: string) {
  try {
    const { loadGraphTraceConfig } = await loadConfigModule();
    return await loadGraphTraceConfig(workspaceRoot);
  } catch {
    const { defaultGraphTraceConfig } = await loadConfigModule();
    return defaultGraphTraceConfig;
  }
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

function readHomeOption(argv: string[]): string {
  return readOption(argv, "--home") ?? homedir();
}

function resolveWorkspaceArg(cwd: string, value: string): string {
  return resolve(cwd, value);
}

function readNumberOption(argv: string[], name: string): number | undefined {
  const raw = readOption(argv, name);
  if (!raw) {
    return undefined;
  }

  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function readPortOption(argv: string[], name: string): number | undefined {
  const raw = readOption(argv, name);
  if (!raw) {
    return undefined;
  }

  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
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

function readAgentToolOption(
  argv: string[],
  name: string,
): SupportedAgentTool | undefined {
  const raw = readOption(argv, name);
  if (raw === "codex" || raw === "claude" || raw === "cursor") {
    return raw;
  }

  return undefined;
}

function readAgentWriteModeOption(
  argv: string[],
  name: string,
): AgentSetupWriteMode | undefined {
  const raw = readOption(argv, name);
  if (raw === "tracked" || raw === "local") {
    return raw;
  }

  return undefined;
}

function formatAgentSetupResult(
  plan: Awaited<ReturnType<typeof planAgentBootstrap>>,
  changedFiles: string[],
  dryRun: boolean,
  backups: string[],
): string {
  const header = dryRun ? "agent setup preview" : "agent setup complete";
  return [
    header,
    ...plan.tools.map(
      (tool) =>
        `tool:${tool.id}:${tool.detection.status}:${tool.targets.length}`,
    ),
    ...changedFiles.map((file) => `file:${file}`),
    ...backups.map((file) => `backup:${file}`),
    "manual: approve GraphTrace MCP in the target tool UI if prompted.",
  ].join("\n");
}

function formatAgentStatusResult(
  statuses: Awaited<ReturnType<typeof inspectAgentBootstrapStatus>>,
): string {
  return [
    "agent status",
    ...statuses.map(
      (tool) =>
        `tool:${tool.id}:${tool.status}:${tool.configuredTargets}/${tool.expectedTargets}`,
    ),
  ].join("\n");
}

function formatAgentRestoreResult(restoredFiles: string[]): string {
  return [
    "agent restore complete",
    ...restoredFiles.map((file) => `file:${file}`),
  ].join("\n");
}
