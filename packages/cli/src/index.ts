import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { ensureWorkspaceInitialized } from "@graphtrace/config";
import { indexWorkspace } from "@graphtrace/indexer";
import { createGraphTraceMcpServer } from "@graphtrace/mcp";
import { createQueryEngine } from "@graphtrace/query-engine";
import { startGraphTraceServer } from "@graphtrace/server";
import {
  type CliRunOptions,
  type CliRunResult,
  type DependencyDirection,
  GRAPHTRACE_DB_PATH,
} from "@graphtrace/shared";
import { openGraphStore } from "@graphtrace/storage";

export async function runCli(
  argv: string[],
  options: CliRunOptions = {},
): Promise<CliRunResult> {
  const cwd = options.cwd ?? process.cwd();
  const [command, ...args] = argv;

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
      const result = await indexWorkspace({
        workspaceRoot: cwd,
        full: args.includes("--full") || args.includes("--json"),
      });
      return {
        exitCode: 0,
        stdout: JSON.stringify(result, null, 2),
        stderr: "",
      };
    }
    case "search":
    case "deps":
    case "impact":
    case "flow":
    case "routes": {
      const store = openGraphStore(join(cwd, GRAPHTRACE_DB_PATH));
      const queryEngine = createQueryEngine(store);
      const query = args[0] ?? "";
      const output =
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
                ? queryEngine.flow(query)
                : queryEngine.routes(readOption(args, "--package"));
      store.close();
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
      await indexWorkspace({ workspaceRoot: cwd, full: false });
      return {
        exitCode: 0,
        stdout: "watch:stubbed",
        stderr: "",
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
