import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";

import fg from "fast-glob";
import ts from "typescript";

import {
  defaultGraphTraceConfig,
  ensureWorkspaceInitialized,
  loadGraphTraceConfig,
} from "@graphtrace/config";
import {
  type DiscoveredUnit,
  GRAPHTRACE_DB_PATH,
  type GraphTraceConfig,
  type IndexWorkspaceOptions,
  type IndexWorkspaceResult,
  type PluginProvenance,
  type RouteItem,
  relativePath,
  toPosixPath,
} from "@graphtrace/shared";
import { openGraphStore } from "@graphtrace/storage";
import { extractExecutionFlow } from "./extract-execution-flow";
import { extractSymbols } from "./extract-symbols";
import { extractReferences } from "./extract-references";
import { buildInlineRouteHandlerId } from "./symbol-graph-types";
import { type WorkspacePackageInfo, inspectWorkspace } from "./workspace";

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

  const normalizedFilePaths = [...inspection.unitFiles.values()].flat();
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

  const program = ts.createProgram({
    rootNames: normalizedFilePaths.map((filePath) =>
      join(options.workspaceRoot, filePath),
    ),
    options: {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
      target: ts.ScriptTarget.Latest,
    },
  });
  const checker = program.getTypeChecker();

  for (const staleFile of staleFiles) {
    store.deleteFileArtifacts(staleFile);
  }

  for (const filePath of filesToIndex) {
    if (options.full === false) {
      store.deleteFileArtifacts(filePath);
    }

    const absolutePath = join(options.workspaceRoot, filePath);
    const sourceText = await readFile(absolutePath, "utf8");
    const hash = createHash("sha1").update(sourceText).digest("hex");
    const owningPackage = findOwningPackage(filePath, inspection.packages);
    const owningUnit = findOwningUnit(filePath, inspection.units);
    const fileId = `file:${toPosixPath(filePath)}`;
    store.upsertFile({
      id: fileId,
      path: toPosixPath(filePath),
      packageId: owningPackage?.id ?? "package:root",
      unitId: owningUnit?.id ?? "unit:root",
      hash,
    });

    const sourceFile =
      program.getSourceFile(absolutePath) ??
      ts.createSourceFile(
        absolutePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
      );
    const localImports = extractImports(
      sourceFile,
      options.workspaceRoot,
      absolutePath,
      inspection.packages,
    );

    for (const imported of localImports) {
      if (!imported.resolvedPath) {
        continue;
      }
      const sourcePath = toPosixPath(filePath);
      const targetPath = relativePath(
        options.workspaceRoot,
        imported.resolvedPath,
      );
      store.insertEdge({
        id: `edge:imports:${sourcePath}->${targetPath}`,
        type: "imports",
        sourceId: `file:${sourcePath}`,
        sourceKind: "file",
        targetId: `file:${targetPath}`,
        targetKind: "file",
        confidence: 1,
      });
    }

    const symbolMap = extractSymbols(sourceFile, filePath);
    for (const symbol of symbolMap) {
      store.upsertSymbol(symbol);
    }

    const matchedPluginIds = new Set(
      owningUnit?.pluginMatches
        .filter((match) => match.kind === "framework-plugin" && match.matched)
        .map((match) => match.pluginId) ?? [],
    );
    const routes = extractRoutes(
      options.workspaceRoot,
      sourceFile,
      sourceText,
      filePath,
      localImports,
      symbolMap,
      owningUnit?.id ?? "unit:root",
      matchedPluginIds,
    );
    for (const route of routes) {
      store.upsertRoute(route);
    }

    for (const edge of extractExecutionFlow({
      workspaceRoot: options.workspaceRoot,
      sourceFile,
      sourceText,
      filePath,
      checker,
      routes,
      symbols: symbolMap,
    })) {
      store.upsertSymbolEdge(edge);
    }

    for (const query of extractQueryHints(
      sourceText,
      filePath,
      owningUnit?.id ?? "unit:root",
      matchedPluginIds,
    )) {
      store.insertEdge(query);
    }

    for (const edge of extractReferences({
      workspaceRoot: options.workspaceRoot,
      sourceFile,
      filePath,
      checker,
    })) {
      store.upsertSymbolEdge(edge);
    }
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

function findOwningPackage(
  filePath: string,
  packages: WorkspacePackageInfo[],
): WorkspacePackageInfo | undefined {
  return packages
    .filter(
      (entry) =>
        entry.rootPath === "." ||
        filePath.startsWith(`${entry.rootPath}/`) ||
        filePath === entry.rootPath,
    )
    .sort((left, right) => right.rootPath.length - left.rootPath.length)[0];
}

function findOwningUnit(
  filePath: string,
  units: DiscoveredUnit[],
): DiscoveredUnit | undefined {
  return units
    .filter(
      (unit) =>
        unit.indexingMode === "full" &&
        (unit.rootPath === "." ||
          filePath === unit.rootPath ||
          filePath.startsWith(`${unit.rootPath}/`)),
    )
    .sort((left, right) => right.rootPath.length - left.rootPath.length)[0];
}

function extractImports(
  sourceFile: ts.SourceFile,
  workspaceRoot: string,
  absolutePath: string,
  packages: WorkspacePackageInfo[],
) {
  const imported: Array<{ localName: string; resolvedPath: string | null }> =
    [];

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }

    const moduleSpecifier = statement.moduleSpecifier.text;
    let localName = "";
    if (statement.importClause?.name) {
      localName = statement.importClause.name.text;
    }
    if (
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      for (const element of statement.importClause.namedBindings.elements) {
        imported.push({
          localName: element.name.text,
          resolvedPath: resolveImport(
            workspaceRoot,
            absolutePath,
            moduleSpecifier,
            packages,
          ),
        });
      }
    }
    imported.push({
      localName,
      resolvedPath: resolveImport(
        workspaceRoot,
        absolutePath,
        moduleSpecifier,
        packages,
      ),
    });
  }

  return imported.filter((entry) => entry.localName || entry.resolvedPath);
}

function resolveImport(
  workspaceRoot: string,
  absolutePath: string,
  moduleSpecifier: string,
  packages: WorkspacePackageInfo[],
): string | null {
  if (moduleSpecifier.startsWith(".")) {
    return resolveRelativeImport(workspaceRoot, absolutePath, moduleSpecifier);
  }

  return resolveWorkspacePackageImport(
    workspaceRoot,
    moduleSpecifier,
    packages,
  );
}

function resolveRelativeImport(
  workspaceRoot: string,
  absolutePath: string,
  moduleSpecifier: string,
): string | null {
  const sourceDir = posix.dirname(
    toPosixPath(relativePath(workspaceRoot, absolutePath)),
  );
  const base = posix.normalize(posix.join(sourceDir, moduleSpecifier));
  return resolveImportCandidate(workspaceRoot, base);
}

function resolveWorkspacePackageImport(
  workspaceRoot: string,
  moduleSpecifier: string,
  packages: WorkspacePackageInfo[],
): string | null {
  const matchingPackage = packages
    .filter(
      (entry) =>
        moduleSpecifier === entry.name ||
        moduleSpecifier.startsWith(`${entry.name}/`),
    )
    .sort((left, right) => right.name.length - left.name.length)[0];

  if (!matchingPackage) {
    return null;
  }

  const subpath = moduleSpecifier
    .slice(matchingPackage.name.length)
    .replace(/^\/+/, "");
  const bases = subpath
    ? [
        posix.join(matchingPackage.rootPath, "src", subpath),
        posix.join(matchingPackage.rootPath, subpath),
      ]
    : [
        posix.join(matchingPackage.rootPath, "src", "index"),
        posix.join(matchingPackage.rootPath, "index"),
      ];

  for (const base of bases) {
    const resolvedPath = resolveImportCandidate(workspaceRoot, base);
    if (resolvedPath) {
      return resolvedPath;
    }
  }

  return null;
}

function resolveImportCandidate(
  workspaceRoot: string,
  base: string,
): string | null {
  const sourceDir = posix.dirname(base);
  const name = posix.basename(base);
  const parentDir = sourceDir === "." ? "" : `${sourceDir}/`;
  const baseWithoutExtension = `${parentDir}${name}`.replace(
    /\.(js|jsx|ts|tsx)$/,
    "",
  );
  const candidates = [
    `${baseWithoutExtension}.ts`,
    `${baseWithoutExtension}.tsx`,
    `${baseWithoutExtension}.js`,
    `${baseWithoutExtension}.jsx`,
    `${baseWithoutExtension}/index.ts`,
    `${baseWithoutExtension}/index.tsx`,
    `${baseWithoutExtension}/index.js`,
    `${baseWithoutExtension}/index.jsx`,
  ];
  for (const candidate of candidates) {
    const filePath = join(workspaceRoot, candidate);
    const content = ts.sys.readFile(filePath);
    if (typeof content === "string") {
      return filePath;
    }
  }
  return null;
}

function extractRoutes(
  workspaceRoot: string,
  sourceFile: ts.SourceFile,
  sourceText: string,
  filePath: string,
  imports: Array<{ localName: string; resolvedPath: string | null }>,
  symbols: Array<{ id: string; name: string }>,
  unitId: string,
  matchedPluginIds: Set<string>,
): RouteItem[] {
  const routes: RouteItem[] = [];
  for (const pluginId of matchedPluginIds) {
    if (pluginId === "framework:express" || pluginId === "framework:fastify") {
      routes.push(
        ...extractHttpRoutes(
          workspaceRoot,
          filePath,
          sourceText,
          imports,
          symbols,
          unitId,
          pluginId === "framework:fastify" ? "fastify" : "express",
        ),
      );
    }
    if (pluginId === "framework:next") {
      routes.push(...extractNextRoutes(sourceText, filePath, unitId));
    }
    if (pluginId === "framework:nest") {
      routes.push(...extractNestRoutes(sourceFile, filePath, unitId));
    }
  }
  return dedupeRoutes(routes);
}

function extractHttpRoutes(
  workspaceRoot: string,
  filePath: string,
  sourceText: string,
  imports: Array<{ localName: string; resolvedPath: string | null }>,
  symbols: Array<{ id: string; name: string }>,
  unitId: string,
  framework: "express" | "fastify",
): RouteItem[] {
  const routes: RouteItem[] = [];
  const routerMatches = [
    ...sourceText.matchAll(
      /\b([A-Za-z0-9_]+)\.(get|post|put|patch|delete)\(\s*["'`](.*?)["'`]\s*,\s*([A-Za-z0-9_]+)/g,
    ),
  ];
  const inlineMatches = [
    ...sourceText.matchAll(
      /\b([A-Za-z0-9_]+)\.(get|post|put|patch|delete)\(\s*["'`](.*?)["'`]\s*,\s*(?:async\s+)?\(/g,
    ),
  ];

  for (const match of routerMatches) {
    const receiver = match[1];
    if (
      framework === "fastify" &&
      !receiver.toLowerCase().includes("fastify") &&
      receiver !== "app"
    ) {
      continue;
    }
    const method = match[2].toUpperCase();
    const path = match[3];
    const handlerName = match[4];
    const importedHandler = imports.find(
      (entry) => entry.localName === handlerName && entry.resolvedPath,
    );
    const localHandler = symbols.find((entry) => entry.name === handlerName);
    const handlerSymbolId = importedHandler?.resolvedPath
      ? `symbol:${toPosixPath(relativePath(workspaceRoot, importedHandler.resolvedPath))}#${handlerName}`
      : (localHandler?.id ?? `symbol:${toPosixPath(filePath)}#${handlerName}`);

    routes.push({
      id: `${method} ${path}`,
      method,
      path,
      handlerName,
      handlerSymbolId,
      filePath: toPosixPath(filePath),
      framework,
      unitId,
      confidence: 0.95,
      provenance: buildProvenance(`framework:${framework}`, 0.95),
    });
  }

  for (const match of inlineMatches) {
    const receiver = match[1];
    if (
      framework === "fastify" &&
      !receiver.toLowerCase().includes("fastify") &&
      receiver !== "app"
    ) {
      continue;
    }

    const method = match[2].toUpperCase();
    const path = match[3];
    routes.push({
      id: `${method} ${path}`,
      method,
      path,
      handlerName: `${receiver}.${method.toLowerCase()}.${path.replace(/^\/+/, "") || "root"}`,
      handlerSymbolId: buildInlineRouteHandlerId(
        filePath,
        receiver,
        method,
        path,
      ),
      filePath: toPosixPath(filePath),
      framework,
      unitId,
      confidence: 0.9,
      provenance: buildProvenance(`framework:${framework}`, 0.9),
    });
  }

  return routes;
}

function extractNextRoutes(
  sourceText: string,
  filePath: string,
  unitId: string,
): RouteItem[] {
  const routes: RouteItem[] = [];
  const nextMatch =
    filePath.match(/(?:^|\/)app\/api\/(.*)\/route\.ts$/) ??
    filePath.match(/src\/app\/api\/(.*)\/route\.ts$/);
  if (!nextMatch) {
    return routes;
  }

  const routePath = `/${nextMatch[1]}`;
  const routeMethods = [
    ...sourceText.matchAll(
      /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/g,
    ),
  ];
  for (const routeMethod of routeMethods) {
    routes.push({
      id: `${routeMethod[1]} ${routePath}`,
      method: routeMethod[1],
      path: routePath,
      handlerName: routeMethod[1],
      handlerSymbolId: `symbol:${toPosixPath(filePath)}#${routeMethod[1]}`,
      filePath: toPosixPath(filePath),
      framework: "next",
      unitId,
      confidence: 0.95,
      provenance: buildProvenance("framework:next", 0.95),
    });
  }

  return routes;
}

function extractNestRoutes(
  sourceFile: ts.SourceFile,
  filePath: string,
  unitId: string,
): RouteItem[] {
  const routes: RouteItem[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement) || !statement.name) {
      continue;
    }

    const controllerPath = readDecoratorPath(statement, "Controller");
    if (controllerPath === null) {
      continue;
    }

    for (const member of statement.members) {
      if (
        !ts.isMethodDeclaration(member) ||
        !member.name ||
        !ts.isIdentifier(member.name)
      ) {
        continue;
      }

      const routeDecorator = readRouteDecorator(member);
      if (!routeDecorator) {
        continue;
      }

      const fullPath = joinRouteSegments(controllerPath, routeDecorator.path);
      routes.push({
        id: `${routeDecorator.method} ${fullPath}`,
        method: routeDecorator.method,
        path: fullPath,
        handlerName: member.name.text,
        handlerSymbolId: `symbol:${toPosixPath(filePath)}#${member.name.text}`,
        filePath: toPosixPath(filePath),
        framework: "nest",
        unitId,
        confidence: 0.93,
        provenance: buildProvenance("framework:nest", 0.93),
      });
    }
  }

  return routes;
}

function readRouteDecorator(
  node: ts.Node,
): { method: string; path: string } | null {
  for (const method of ["Get", "Post", "Put", "Patch", "Delete"] as const) {
    const path = readDecoratorPath(node, method);
    if (path !== null) {
      return {
        method: method.toUpperCase(),
        path,
      };
    }
  }

  return null;
}

function readDecoratorPath(
  node: ts.Node,
  decoratorName: string,
): string | null {
  const decorators = ts.canHaveDecorators(node)
    ? ts.getDecorators(node)
    : undefined;

  for (const decorator of decorators ?? []) {
    if (!ts.isCallExpression(decorator.expression)) {
      continue;
    }
    if (!ts.isIdentifier(decorator.expression.expression)) {
      continue;
    }
    if (decorator.expression.expression.text !== decoratorName) {
      continue;
    }

    const [firstArgument] = decorator.expression.arguments;
    if (!firstArgument) {
      return "";
    }
    if (
      ts.isStringLiteral(firstArgument) ||
      ts.isNoSubstitutionTemplateLiteral(firstArgument)
    ) {
      return firstArgument.text;
    }

    return "";
  }

  return null;
}

function joinRouteSegments(controllerPath: string, methodPath: string): string {
  const segments = [controllerPath, methodPath]
    .map((value) => value.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);

  return `/${segments.join("/")}`;
}

function extractQueryHints(
  sourceText: string,
  filePath: string,
  unitId: string,
  matchedPluginIds: Set<string>,
): Array<{
  id: string;
  type: string;
  sourceId: string;
  sourceKind: string;
  targetId: string;
  targetKind: string;
  confidence: number;
  metadata: {
    label: string;
    filePath: string;
    unitId: string;
    pluginId: string;
    pluginVersion: string;
  };
}> {
  const edges = [];
  const fileId = `file:${toPosixPath(filePath)}`;
  const matchers = [
    {
      pluginId: "framework:prisma",
      pattern: /prisma\.\w+\.(findMany|findFirst|findUnique)\(/g,
    },
    {
      pluginId: "framework:drizzle",
      pattern: /db\.select\(\)\.from\(/g,
    },
  ].filter((entry) => matchedPluginIds.has(entry.pluginId));

  for (const matcher of matchers) {
    for (const match of sourceText.matchAll(matcher.pattern)) {
      const label = match[0];
      edges.push({
        id: `edge:query:${toPosixPath(filePath)}:${label}`,
        type: "queries",
        sourceId: fileId,
        sourceKind: "file",
        targetId: `query:${toPosixPath(filePath)}#${label}`,
        targetKind: "query",
        confidence: 0.9,
        metadata: {
          label,
          filePath: toPosixPath(filePath),
          unitId,
          pluginId: matcher.pluginId,
          pluginVersion: "internal",
        },
      });
    }
  }

  return edges;
}

function dedupeRoutes(routes: RouteItem[]): RouteItem[] {
  const seen = new Set<string>();
  return routes.filter((route) => {
    const key = `${route.id}:${route.framework}:${route.filePath}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildProvenance(
  pluginId: string,
  confidence: number,
): PluginProvenance {
  return {
    pluginId,
    pluginVersion: "internal",
    confidence,
  };
}
