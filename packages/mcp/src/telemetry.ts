import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { buildManagedStorageRoot } from "@graphtrace/storage";

export interface McpTelemetryEvent {
  toolName: string;
  ok: boolean;
  durationMs: number;
  workspaceId?: string;
  workspaceRoot?: string;
  error?: string;
}

export interface McpTelemetry {
  enabled: boolean;
  logPath: string;
  record(event: McpTelemetryEvent): void;
}

export function createMcpTelemetry(options: {
  homeDir: string;
  env?: NodeJS.ProcessEnv;
}): McpTelemetry {
  const env = options.env ?? process.env;
  const logPath = join(
    buildManagedStorageRoot(options.homeDir),
    "mcp-telemetry.jsonl",
  );
  const enabled = isTelemetryEnabled(env.GRAPHTRACE_MCP_TELEMETRY);

  return {
    enabled,
    logPath,
    record(event) {
      if (!enabled) {
        return;
      }

      try {
        mkdirSync(dirname(logPath), { recursive: true });
        appendFileSync(
          logPath,
          `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`,
          "utf8",
        );
      } catch {}
    },
  };
}

function isTelemetryEnabled(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}
