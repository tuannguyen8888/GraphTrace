import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";

import fg from "fast-glob";
import ts from "typescript";

import {
  ensureWorkspaceInitialized,
  loadGraphTraceConfig,
} from "@graphtrace/config";
import {
  type IndexWorkspaceOptions,
  type IndexWorkspaceResult,
  type RouteItem,
  relativePath,
  toPosixPath,
} from "@graphtrace/shared";
import { openGraphStore } from "@graphtrace/storage";

interface PackageInfo {
  id: string;
  name: string;
  rootPath: string;
}

export async function indexWorkspace(
  options: IndexWorkspaceOptions,
): Promise<IndexWorkspaceResult> {
  const initialized = await ensureWorkspaceInitialized(options.workspaceRoot);
  const config = await loadGraphTraceConfig(options.workspaceRoot);
  const store = openGraphStore(initialized.dbPath);

  if (options.full !== false) {
    store.reset();
  }

  const indexRunId = store.beginIndexRun(
    options.full === false ? "incremental" : "full",
  );

  const packages = await discoverPackages(
    options.workspaceRoot,
    config.workspaceGlobs,
  );
  for (const entry of packages) {
    store.upsertPackage(entry);
  }

  const filePaths = await fg(
    [
      "apps/**/*.{ts,tsx,js,jsx}",
      "packages/**/*.{ts,tsx,js,jsx}",
      "services/**/*.{ts,tsx,js,jsx}",
    ],
    {
      cwd: options.workspaceRoot,
      ignore: [...config.exclude, "**/node_modules/**", "**/.graphtrace/**"],
      onlyFiles: true,
    },
  );

  for (const filePath of filePaths) {
    const absolutePath = join(options.workspaceRoot, filePath);
    const sourceText = await readFile(absolutePath, "utf8");
    const hash = createHash("sha1").update(sourceText).digest("hex");
    const owningPackage = findOwningPackage(filePath, packages);
    const fileId = `file:${toPosixPath(filePath)}`;
    store.upsertFile({
      id: fileId,
      path: toPosixPath(filePath),
      packageId: owningPackage?.id ?? "package:root",
      hash,
    });

    const sourceFile = ts.createSourceFile(
      absolutePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
    );
    const localImports = extractImports(
      sourceFile,
      options.workspaceRoot,
      absolutePath,
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

    for (const route of extractRoutes(
      options.workspaceRoot,
      sourceText,
      filePath,
      localImports,
      symbolMap,
    )) {
      store.upsertRoute(route);
    }

    for (const query of extractQueryHints(sourceText, filePath)) {
      store.insertEdge(query);
    }
  }

  const summary = store.stats();
  store.completeIndexRun(indexRunId, summary);
  store.close();

  return {
    dbPath: initialized.dbPath,
    summary,
  };
}

async function discoverPackages(
  workspaceRoot: string,
  workspaceGlobs: string[],
): Promise<PackageInfo[]> {
  const packageJsonPaths = await fg(
    workspaceGlobs.map((globPattern) => `${globPattern}/package.json`),
    {
      cwd: workspaceRoot,
      onlyFiles: true,
    },
  );

  const results: PackageInfo[] = [];
  for (const packageJsonPath of packageJsonPaths) {
    const content = JSON.parse(
      await readFile(join(workspaceRoot, packageJsonPath), "utf8"),
    ) as { name?: string };
    const rootPath = toPosixPath(posix.dirname(packageJsonPath));
    results.push({
      id: `package:${rootPath}`,
      name: content.name ?? rootPath,
      rootPath,
    });
  }
  return results;
}

function findOwningPackage(
  filePath: string,
  packages: PackageInfo[],
): PackageInfo | undefined {
  return packages
    .filter(
      (entry) =>
        filePath.startsWith(`${entry.rootPath}/`) ||
        filePath === entry.rootPath,
    )
    .sort((left, right) => right.rootPath.length - left.rootPath.length)[0];
}

function extractSymbols(sourceFile: ts.SourceFile, filePath: string) {
  const symbols: Array<{
    id: string;
    name: string;
    kind: string;
    fileId: string;
    filePath: string;
    exported: boolean;
  }> = [];

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      symbols.push({
        id: `symbol:${toPosixPath(filePath)}#${node.name.text}`,
        name: node.name.text,
        kind: "function",
        fileId: `file:${toPosixPath(filePath)}`,
        filePath: toPosixPath(filePath),
        exported: (node.modifiers ?? []).some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        ),
      });
    }
    if (ts.isVariableStatement(node)) {
      const exported = (node.modifiers ?? []).some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      );
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          symbols.push({
            id: `symbol:${toPosixPath(filePath)}#${declaration.name.text}`,
            name: declaration.name.text,
            kind: "variable",
            fileId: `file:${toPosixPath(filePath)}`,
            filePath: toPosixPath(filePath),
            exported,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);
  return symbols;
}

function extractImports(
  sourceFile: ts.SourceFile,
  workspaceRoot: string,
  absolutePath: string,
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
          resolvedPath: resolveLocalImport(
            workspaceRoot,
            absolutePath,
            moduleSpecifier,
          ),
        });
      }
    }
    imported.push({
      localName,
      resolvedPath: resolveLocalImport(
        workspaceRoot,
        absolutePath,
        moduleSpecifier,
      ),
    });
  }

  return imported.filter((entry) => entry.localName || entry.resolvedPath);
}

function resolveLocalImport(
  workspaceRoot: string,
  absolutePath: string,
  moduleSpecifier: string,
): string | null {
  if (!moduleSpecifier.startsWith(".")) {
    return null;
  }

  const sourceDir = posix.dirname(
    toPosixPath(relativePath(workspaceRoot, absolutePath)),
  );
  const base = posix.normalize(posix.join(sourceDir, moduleSpecifier));
  const baseWithoutExtension = base.replace(/\.(js|jsx|ts|tsx)$/, "");
  const candidates = [
    `${baseWithoutExtension}.ts`,
    `${baseWithoutExtension}.tsx`,
    `${baseWithoutExtension}.js`,
    `${baseWithoutExtension}.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
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
  sourceText: string,
  filePath: string,
  imports: Array<{ localName: string; resolvedPath: string | null }>,
  symbols: Array<{ id: string; name: string }>,
): RouteItem[] {
  const routes: RouteItem[] = [];
  const expressMatches = [
    ...sourceText.matchAll(
      /\b\w+\.(get|post|put|patch|delete)\(\s*["'`](.*?)["'`]\s*,\s*([A-Za-z0-9_]+)/g,
    ),
  ];

  for (const match of expressMatches) {
    const method = match[1].toUpperCase();
    const path = match[2];
    const handlerName = match[3];
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
      framework: "express",
      confidence: 0.95,
    });
  }

  const nextMatch = filePath.match(/src\/app\/api\/(.*)\/route\.ts$/);
  if (nextMatch) {
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
        confidence: 0.9,
      });
    }
  }

  return routes;
}

function extractQueryHints(
  sourceText: string,
  filePath: string,
): Array<{
  id: string;
  type: string;
  sourceId: string;
  sourceKind: string;
  targetId: string;
  targetKind: string;
  confidence: number;
  metadata: { label: string; filePath: string };
}> {
  const edges = [];
  const fileId = `file:${toPosixPath(filePath)}`;
  const matchers = [
    /prisma\.\w+\.(findMany|findFirst|findUnique)\(/g,
    /db\.select\(\)\.from\(/g,
  ];

  for (const matcher of matchers) {
    for (const match of sourceText.matchAll(matcher)) {
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
        },
      });
    }
  }

  return edges;
}
