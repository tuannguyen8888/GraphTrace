import { join } from "node:path";

import {
  defaultGraphTraceConfig,
  ensureWorkspaceInitialized,
  loadGraphTraceConfig,
} from "@graphtrace/config";
import {
  GRAPHTRACE_DB_PATH,
  type GraphTraceConfig,
  type IndexWorkspaceOptions,
  type IndexWorkspaceResult,
  type UnitLanguage,
  toPosixPath,
} from "@graphtrace/shared";
import { openGraphStore } from "@graphtrace/storage";
import {
  type JsTsFileArtifacts,
  analyzeJsTsWorkspace,
} from "./languages/js-ts/analyzer";
import { analyzePhpWorkspace } from "./languages/php/analyzer";
import { inspectWorkspace } from "./workspace";

export { inspectWorkspace } from "./workspace";

export async function indexWorkspace(
  options: IndexWorkspaceOptions,
): Promise<IndexWorkspaceResult> {
  const persistWorkspaceArtifacts =
    options.persistWorkspaceArtifacts ?? !options.dbPath;
  const config = await resolveWorkspaceConfig(
    options.workspaceRoot,
    persistWorkspaceArtifacts,
    options.configOverrides,
  );
  const dbPath =
    options.dbPath ?? join(options.workspaceRoot, GRAPHTRACE_DB_PATH);

  const store = openGraphStore(dbPath);
  const inspection = await inspectWorkspace(options.workspaceRoot, config);

  if (options.full !== false) {
    store.reset();
  }

  const indexRunId = store.beginIndexRun(
    options.full === false ? "incremental" : "full",
  );

  for (const unit of inspection.units) {
    store.upsertUnit(unit);
  }

  for (const entry of inspection.packages) {
    store.upsertPackage(entry);
  }

  const indexedFilesByLanguage = collectIndexedFilesByLanguage(inspection);
  const normalizedFilePaths = [...indexedFilesByLanguage.values()].flat();
  const filePathSet = new Set(normalizedFilePaths);
  const filesToIndex =
    options.full === false &&
    options.changedFiles &&
    options.changedFiles.length > 0
      ? options.changedFiles
          .map(toPosixPath)
          .filter((filePath) => filePathSet.has(filePath))
      : normalizedFilePaths;

  const staleFiles = new Set<string>(
    options.full === false ? store.listIndexedFilePaths() : [],
  );
  for (const filePath of normalizedFilePaths) {
    staleFiles.delete(filePath);
  }
  for (const removedFile of options.removedFiles ?? []) {
    staleFiles.add(toPosixPath(removedFile));
  }

  for (const staleFile of staleFiles) {
    store.deleteFileArtifacts(staleFile);
  }

  const languageAnalyzers: Partial<
    Record<UnitLanguage, typeof analyzeJsTsWorkspace>
  > = {
    "js-ts": analyzeJsTsWorkspace,
    php: analyzePhpWorkspace,
  };

  for (const [language, allFiles] of indexedFilesByLanguage) {
    const analyzer = languageAnalyzers[language];
    if (!analyzer) {
      continue;
    }

    const fileSet = new Set(allFiles);
    const languageFilesToIndex = filesToIndex.filter((filePath) =>
      fileSet.has(filePath),
    );

    if (languageFilesToIndex.length === 0) {
      continue;
    }

    const analyzedFiles = await analyzer({
      workspaceRoot: options.workspaceRoot,
      inspection,
      allFiles,
      filesToIndex: languageFilesToIndex,
    });
    persistAnalyzedFiles(store, analyzedFiles, options.full === false);
  }

  const summary = store.stats();
  store.completeIndexRun(indexRunId, summary);
  store.close();

  return {
    dbPath,
    summary,
    units: inspection.units,
    explain: {
      units: inspection.units,
    },
  };
}

async function resolveWorkspaceConfig(
  workspaceRoot: string,
  persistWorkspaceArtifacts: boolean,
  overrides: Partial<GraphTraceConfig> | undefined,
): Promise<GraphTraceConfig> {
  if (persistWorkspaceArtifacts) {
    await ensureWorkspaceInitialized(workspaceRoot, overrides ?? {});
  }

  let baseConfig = defaultGraphTraceConfig;

  try {
    baseConfig = await loadGraphTraceConfig(workspaceRoot);
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  return mergeGraphTraceConfig(baseConfig, overrides);
}

function mergeGraphTraceConfig(
  baseConfig: GraphTraceConfig,
  overrides: Partial<GraphTraceConfig> | undefined,
): GraphTraceConfig {
  return {
    ...baseConfig,
    ...overrides,
    detection: {
      ...baseConfig.detection,
      ...overrides?.detection,
    },
    plugins: {
      ...baseConfig.plugins,
      ...overrides?.plugins,
    },
    search: {
      ...baseConfig.search,
      ...overrides?.search,
    },
    web: {
      ...baseConfig.web,
      ...overrides?.web,
    },
  };
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function collectIndexedFilesByLanguage(
  inspection: Awaited<ReturnType<typeof inspectWorkspace>>,
): Map<UnitLanguage, string[]> {
  const filesByLanguage = new Map<UnitLanguage, Set<string>>();

  for (const unit of inspection.units) {
    const files = inspection.unitFiles.get(unit.id);
    if (!files?.length) {
      continue;
    }

    const existing = filesByLanguage.get(unit.language) ?? new Set<string>();
    for (const filePath of files) {
      existing.add(filePath);
    }
    filesByLanguage.set(unit.language, existing);
  }

  return new Map(
    [...filesByLanguage.entries()].map(([language, files]) => [
      language,
      [...files],
    ]),
  );
}

function persistAnalyzedFiles(
  store: ReturnType<typeof openGraphStore>,
  analyzedFiles: JsTsFileArtifacts[],
  incremental: boolean,
): void {
  for (const analyzedFile of analyzedFiles) {
    if (incremental) {
      store.deleteFileArtifacts(analyzedFile.file.path);
    }

    store.upsertFile(analyzedFile.file);

    for (const edge of analyzedFile.importEdges) {
      store.insertEdge(edge);
    }

    for (const symbol of analyzedFile.symbols) {
      store.upsertSymbol(symbol);
    }

    for (const route of analyzedFile.routes) {
      store.upsertRoute(route);
    }

    for (const edge of analyzedFile.queryEdges) {
      store.insertEdge(edge);
    }

    for (const edge of analyzedFile.symbolEdges) {
      store.upsertSymbolEdge(edge);
    }
  }
}
