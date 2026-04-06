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
          ? queryEngine.search(query)
          : command === "deps"
            ? queryEngine.dependencies(query)
            : command === "impact"
              ? queryEngine.impact(query)
              : command === "flow"
                ? queryEngine.flow(query)
                : queryEngine.routes();
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
      };
    }
    case "mcp": {
      await createGraphTraceMcpServer({ workspaceRoot: cwd });
      return {
        exitCode: 0,
        stdout: "",
        stderr: "",
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
