import ts from "typescript";

import type {
  GraphEdgeDescriptor,
  RouteItem,
  SymbolDescriptor,
} from "@graphtrace/shared";
import { relativePath, toPosixPath } from "@graphtrace/shared";
import { symbolIdFromDeclaration } from "./symbol-graph-types";

export function extractExecutionFlow(options: {
  workspaceRoot: string;
  sourceFile: ts.SourceFile;
  sourceText: string;
  filePath: string;
  checker: ts.TypeChecker;
  routes: RouteItem[];
  symbols: SymbolDescriptor[];
}): GraphEdgeDescriptor[] {
  const { sourceFile, sourceText, filePath, checker, routes, symbols } =
    options;
  const normalizedFilePath = toPosixPath(filePath);
  const edges = new Map<string, GraphEdgeDescriptor>();

  const addEdge = (edge: GraphEdgeDescriptor) => {
    edges.set(edge.id, edge);
  };

  for (const route of routes) {
    addEdge({
      id: `edge:routes_to:${route.id}->${route.handlerSymbolId}`,
      type: "routes_to",
      sourceId: route.id,
      sourceKind: "route",
      targetId: route.handlerSymbolId,
      targetKind: "symbol",
      confidence: 1,
      confidenceLabel: "proven",
      provenance: {
        kind: "route-handler",
        source: `framework:${route.framework}`,
        evidence: [`${route.method} ${route.path}`],
      },
    });
  }

  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const sourceId = symbolIdFromDeclaration(node, normalizedFilePath);
      if (
        sourceId &&
        ts.isCallExpression(node.initializer) &&
        node.initializer.arguments.length > 0
      ) {
        for (const argument of node.initializer.arguments) {
          const targetId = resolveSymbolId(
            argument,
            options.workspaceRoot,
            checker,
          );
          if (targetId) {
            addEdge({
              id: `edge:calls:${sourceId}->${targetId}:wrapper`,
              type: "calls",
              sourceId,
              sourceKind: "symbol",
              targetId,
              targetKind: "symbol",
              confidence: 0.85,
              confidenceLabel: "inferred-strong",
              provenance: {
                kind: "wrapper-handoff",
                source: "typescript-checker",
                evidence: [node.initializer.getText(sourceFile)],
              },
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);

  for (const matcher of [
    /prisma\.\w+\.(findMany|findFirst|findUnique)\(/g,
    /db\.select\(\)\.from\(/g,
  ]) {
    for (const match of sourceText.matchAll(matcher)) {
      if (match.index == null) {
        continue;
      }

      const targetId = `query:${normalizedFilePath}#${match[0]}`;
      const location = sourceFile.getLineAndCharacterOfPosition(match.index);
      const sourceSymbol = findEnclosingSymbol(
        symbols,
        location.line + 1,
        location.character + 1,
      );

      if (!sourceSymbol) {
        continue;
      }

      addEdge({
        id: `edge:queries:${sourceSymbol.id}->${targetId}`,
        type: "queries",
        sourceId: sourceSymbol.id,
        sourceKind: "symbol",
        targetId,
        targetKind: "query",
        confidence: 1,
        confidenceLabel: "proven",
        provenance: {
          kind: "query-sink",
          source: "source-pattern",
          evidence: [match[0]],
        },
      });
    }
  }

  return [...edges.values()];
}

function resolveSymbolId(
  node: ts.Node,
  workspaceRoot: string,
  checker: ts.TypeChecker,
): string | null {
  const symbol = checker.getSymbolAtLocation(node);
  if (!symbol) {
    return null;
  }

  const resolved =
    (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(symbol)
      : symbol;

  for (const declaration of resolved.declarations ?? []) {
    const declarationFilePath = toPosixPath(
      relativePath(workspaceRoot, declaration.getSourceFile().fileName),
    );
    if (!isWorkspaceSourcePath(declarationFilePath)) {
      continue;
    }
    const symbolId = symbolIdFromDeclaration(
      declaration,
      declarationFilePath,
    );
    if (symbolId) {
      return symbolId;
    }
  }

  return null;
}

function findEnclosingSymbol(
  symbols: SymbolDescriptor[],
  line: number,
  column: number,
): SymbolDescriptor | null {
  const candidates = symbols.filter((symbol) =>
    containsPosition(symbol, line, column),
  );

  return candidates.sort((left, right) => spanSize(left) - spanSize(right))[0] ?? null;
}

function containsPosition(
  symbol: SymbolDescriptor,
  line: number,
  column: number,
): boolean {
  if (!symbol.span) {
    return false;
  }

  const startsBefore =
    symbol.span.startLine < line ||
    (symbol.span.startLine === line && symbol.span.startColumn <= column);
  const endsAfter =
    symbol.span.endLine > line ||
    (symbol.span.endLine === line && symbol.span.endColumn >= column);

  return startsBefore && endsAfter;
}

function spanSize(symbol: SymbolDescriptor): number {
  if (!symbol.span) {
    return Number.MAX_SAFE_INTEGER;
  }

  return (
    (symbol.span.endLine - symbol.span.startLine) * 10_000 +
    (symbol.span.endColumn - symbol.span.startColumn)
  );
}

function isWorkspaceSourcePath(filePath: string): boolean {
  return !(
    filePath === ".." ||
    filePath.startsWith("../") ||
    filePath === "node_modules" ||
    filePath.startsWith("node_modules/")
  );
}
