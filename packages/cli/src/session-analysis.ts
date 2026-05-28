import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface SessionAnalysisSummary {
  files: number;
  graphtraceCalls: number;
  graphtraceErrors: number;
  fallbackMentions: number;
  toolCounts: Record<string, { calls: number; errors: number }>;
  topErrors: Array<{ message: string; count: number }>;
}

export async function analyzeGraphTraceSessions(
  targetPath: string,
): Promise<SessionAnalysisSummary> {
  const files = await listJsonlFiles(resolve(targetPath));
  const summary: SessionAnalysisSummary = {
    files: files.length,
    graphtraceCalls: 0,
    graphtraceErrors: 0,
    fallbackMentions: 0,
    toolCounts: {},
    topErrors: [],
  };
  const errors = new Map<string, number>();

  for (const filePath of files) {
    const lines = (await readFile(filePath, "utf8")).split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const event = parseJsonLine(line);
      if (!event) {
        continue;
      }

      if (isFallbackMention(event)) {
        summary.fallbackMentions += 1;
      }

      const call = readGraphTraceMcpCall(event);
      if (!call) {
        continue;
      }

      summary.graphtraceCalls += 1;
      if (!summary.toolCounts[call.toolName]) {
        summary.toolCounts[call.toolName] = {
          calls: 0,
          errors: 0,
        };
      }
      const tool = summary.toolCounts[call.toolName];
      tool.calls += 1;

      if (call.isError) {
        summary.graphtraceErrors += 1;
        tool.errors += 1;
        const message = firstLine(call.errorMessage || "unknown error");
        errors.set(message, (errors.get(message) ?? 0) + 1);
      }
    }
  }

  summary.topErrors = [...errors]
    .map(([message, count]) => ({ message, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.message.localeCompare(right.message),
    )
    .slice(0, 10);

  return summary;
}

export function formatSessionAnalysis(summary: SessionAnalysisSummary): string {
  const lines = [
    "GraphTrace Session Analysis",
    `files:${summary.files}`,
    `graphtrace_calls:${summary.graphtraceCalls}`,
    `graphtrace_errors:${summary.graphtraceErrors}`,
    `fallback_mentions:${summary.fallbackMentions}`,
  ];

  const tools = Object.entries(summary.toolCounts).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (tools.length > 0) {
    lines.push("tools:");
    for (const [toolName, counts] of tools) {
      lines.push(
        `- ${toolName}: calls=${counts.calls} errors=${counts.errors}`,
      );
    }
  }

  if (summary.topErrors.length > 0) {
    lines.push("top_errors:");
    for (const error of summary.topErrors) {
      lines.push(`- ${error.message} (${error.count})`);
    }
  }

  return lines.join("\n");
}

async function listJsonlFiles(targetPath: string): Promise<string[]> {
  const targetStats = await stat(targetPath);
  if (targetStats.isFile()) {
    return targetPath.endsWith(".jsonl") ? [targetPath] : [];
  }

  const entries = await readdir(targetPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = join(targetPath, entry.name);
      return entry.isDirectory()
        ? listJsonlFiles(entryPath)
        : Promise.resolve(entry.name.endsWith(".jsonl") ? [entryPath] : []);
    }),
  );
  return nested.flat().sort();
}

function parseJsonLine(line: string): unknown | null {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return null;
  }
}

function readGraphTraceMcpCall(event: unknown): {
  toolName: string;
  isError: boolean;
  errorMessage: string;
} | null {
  const record = asRecord(event);
  if (!record) {
    return null;
  }

  const invocation = asRecord(record.invocation) ?? asRecord(record.tool_call);
  const server = readString(invocation?.server ?? record.server);
  if (server !== "graphtrace") {
    return null;
  }

  const toolName =
    readString(invocation?.tool ?? invocation?.toolName ?? record.tool) ??
    "unknown";
  const result = asRecord(record.result);
  const okResult = asRecord(result?.Ok ?? result?.ok);
  const isError = Boolean(
    okResult?.isError ?? result?.isError ?? record.isError,
  );
  const errorMessage = collectStrings(result ?? record)
    .filter((text) => text !== "graphtrace" && text !== toolName)
    .join(" ")
    .trim();

  return {
    toolName,
    isError,
    errorMessage,
  };
}

function isFallbackMention(event: unknown): boolean {
  const text = collectStrings(event).join("\n").toLowerCase();
  return (
    text.includes("graphtrace") &&
    (text.includes("fallback") ||
      text.includes("falling back") ||
      text.includes("ripgrep") ||
      /\brg\b/.test(text))
  );
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, output);
    }
    return output;
  }
  const record = asRecord(value);
  if (record) {
    for (const nested of Object.values(record)) {
      collectStrings(nested, output);
    }
  }
  return output;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function firstLine(value: string): string {
  return value.split(/\r?\n/)[0]?.trim() || "unknown error";
}
