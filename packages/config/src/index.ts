import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import {
  GRAPHTRACE_CONFIG_PATH,
  GRAPHTRACE_DB_PATH,
  GRAPHTRACE_DIR,
  type GraphTraceConfig,
} from "@graphtrace/shared";

const configSchema = z.object({
  workspaceGlobs: z
    .array(z.string())
    .default(["apps/*", "packages/*", "services/*"]),
  exclude: z
    .array(z.string())
    .default(["**/dist/**", "**/.next/**", "**/coverage/**"]),
  frameworks: z
    .array(z.string())
    .default(["express", "fastify", "nest", "next", "prisma", "drizzle"]),
  search: z
    .object({
      embeddingsProvider: z.enum(["none", "ollama", "openai"]).default("none"),
      embeddingsModel: z.string().nullable().default(null),
    })
    .default({
      embeddingsProvider: "none",
      embeddingsModel: null,
    }),
  web: z
    .object({
      port: z.number().int().positive().default(4310),
    })
    .default({
      port: 4310,
    }),
});

export const defaultGraphTraceConfig: GraphTraceConfig = configSchema.parse({});

export interface InitializedWorkspace {
  rootDir: string;
  graphtraceDir: string;
  configPath: string;
  dbPath: string;
  cacheDir: string;
  logsDir: string;
}

export async function ensureWorkspaceInitialized(
  workspaceRoot: string,
  overrides: Partial<GraphTraceConfig> = {},
): Promise<InitializedWorkspace> {
  const graphtraceDir = join(workspaceRoot, GRAPHTRACE_DIR);
  const cacheDir = join(graphtraceDir, "cache");
  const logsDir = join(graphtraceDir, "logs");
  const configPath = join(workspaceRoot, GRAPHTRACE_CONFIG_PATH);
  const dbPath = join(workspaceRoot, GRAPHTRACE_DB_PATH);
  const currentConfig = configSchema.parse({
    ...defaultGraphTraceConfig,
    ...overrides,
    search: {
      ...defaultGraphTraceConfig.search,
      ...overrides.search,
    },
    web: {
      ...defaultGraphTraceConfig.web,
      ...overrides.web,
    },
  });

  await mkdir(cacheDir, { recursive: true });
  await mkdir(logsDir, { recursive: true });
  await writeFile(
    configPath,
    `${JSON.stringify(currentConfig, null, 2)}\n`,
    "utf8",
  );

  return {
    rootDir: workspaceRoot,
    graphtraceDir,
    configPath,
    dbPath,
    cacheDir,
    logsDir,
  };
}

export async function loadGraphTraceConfig(
  workspaceRoot: string,
): Promise<GraphTraceConfig> {
  const configPath = join(workspaceRoot, GRAPHTRACE_CONFIG_PATH);
  const content = await readFile(configPath, "utf8");
  const raw = JSON.parse(content) as Partial<GraphTraceConfig>;
  return configSchema.parse({
    ...defaultGraphTraceConfig,
    ...raw,
    search: {
      ...defaultGraphTraceConfig.search,
      ...raw.search,
    },
    web: {
      ...defaultGraphTraceConfig.web,
      ...raw.web,
    },
  });
}
