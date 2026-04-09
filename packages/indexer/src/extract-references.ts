import ts from "typescript";

import type { GraphEdgeDescriptor } from "@graphtrace/shared";
import { relativePath, toPosixPath } from "@graphtrace/shared";
import {
  inlineRouteHandlerSymbolId,
  symbolIdFromDeclaration,
} from "./symbol-graph-types";

export function extractReferences(options: {
  workspaceRoot: string;
  sourceFile: ts.SourceFile;
  filePath: string;
  checker: ts.TypeChecker;
}): GraphEdgeDescriptor[] {
  const { workspaceRoot, sourceFile, filePath, checker } = options;
  const edges = new Map<string, GraphEdgeDescriptor>();

  const addEdge = (
    type: GraphEdgeDescriptor["type"],
    sourceId: string,
    targetId: string,
    evidenceNode: ts.Node,
  ) => {
    if (sourceId === targetId) {
      return;
    }

    const edgeId = `edge:${type}:${sourceId}->${targetId}`;
    const location = sourceFile.getLineAndCharacterOfPosition(
      evidenceNode.getStart(sourceFile),
    );
    edges.set(edgeId, {
      id: edgeId,
      type,
      sourceId,
      sourceKind: "symbol",
      targetId,
      targetKind: "symbol",
      confidence: 1,
      confidenceLabel: "proven",
      provenance: {
        kind: type === "calls" ? "direct-call" : "identifier-reference",
        source: "typescript-checker",
        evidence: [
          `${toPosixPath(filePath)}:${location.line + 1}:${location.character + 1}`,
        ],
      },
    });
  };

  const visit = (node: ts.Node, currentSourceId?: string) => {
    const nextSourceId = sourceIdForNode(node, filePath);
    const activeSourceId = nextSourceId ?? currentSourceId;

    if (activeSourceId) {
      if (ts.isCallExpression(node)) {
        const targetId = resolveTargetSymbolId(
          node.expression,
          workspaceRoot,
          checker,
        );
        if (targetId) {
          addEdge("calls", activeSourceId, targetId, node.expression);
        }
      } else if (ts.isPropertyAccessExpression(node) && !isCallCallee(node)) {
        const targetId = resolveTargetSymbolId(
          node.name,
          workspaceRoot,
          checker,
        );
        if (targetId) {
          addEdge("references", activeSourceId, targetId, node.name);
        }
      } else if (
        ts.isIdentifier(node) &&
        !isDeclarationName(node) &&
        !isCallCallee(node) &&
        !isPropertyName(node)
      ) {
        const targetId = resolveTargetSymbolId(node, workspaceRoot, checker);
        if (targetId) {
          addEdge("references", activeSourceId, targetId, node);
        }
      }
    }

    ts.forEachChild(node, (child) => visit(child, activeSourceId));
  };

  ts.forEachChild(sourceFile, (child) => visit(child));
  return [...edges.values()];
}

function sourceIdForNode(node: ts.Node, filePath: string): string | undefined {
  if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
    return node.name
      ? (symbolIdFromDeclaration(node, toPosixPath(filePath)) ?? undefined)
      : undefined;
  }

  if (ts.isMethodDeclaration(node) || ts.isPropertyAssignment(node)) {
    return symbolIdFromDeclaration(node, toPosixPath(filePath)) ?? undefined;
  }

  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    ts.isVariableDeclaration(node.parent) &&
    ts.isIdentifier(node.parent.name)
  ) {
    return (
      symbolIdFromDeclaration(node.parent, toPosixPath(filePath)) ?? undefined
    );
  }

  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    ts.isPropertyAssignment(node.parent)
  ) {
    return (
      symbolIdFromDeclaration(node.parent, toPosixPath(filePath)) ?? undefined
    );
  }

  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return inlineRouteHandlerSymbolId(node, toPosixPath(filePath)) ?? undefined;
  }

  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    return symbolIdFromDeclaration(node, toPosixPath(filePath)) ?? undefined;
  }

  return undefined;
}

function resolveTargetSymbolId(
  node: ts.Node,
  workspaceRoot: string,
  checker: ts.TypeChecker,
): string | null {
  let symbol = checker.getSymbolAtLocation(node);
  if (!symbol) {
    return null;
  }

  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    symbol = checker.getAliasedSymbol(symbol);
  }

  for (const declaration of symbol.declarations ?? []) {
    const declarationFilePath = toPosixPath(
      relativePath(workspaceRoot, declaration.getSourceFile().fileName),
    );
    if (!isWorkspaceSourcePath(declarationFilePath)) {
      continue;
    }
    const symbolId = symbolIdFromDeclaration(declaration, declarationFilePath);
    if (symbolId) {
      return symbolId;
    }
  }

  return null;
}

function isCallCallee(node: ts.Node): boolean {
  return ts.isCallExpression(node.parent) && node.parent.expression === node;
}

function isDeclarationName(node: ts.Identifier): boolean {
  return (
    (ts.isFunctionDeclaration(node.parent) ||
      ts.isClassDeclaration(node.parent) ||
      ts.isVariableDeclaration(node.parent) ||
      ts.isParameter(node.parent) ||
      ts.isImportSpecifier(node.parent) ||
      ts.isImportClause(node.parent) ||
      ts.isMethodDeclaration(node.parent) ||
      ts.isPropertyAssignment(node.parent)) &&
    "name" in node.parent &&
    node.parent.name === node
  );
}

function isPropertyName(node: ts.Identifier): boolean {
  return (
    ts.isPropertyAccessExpression(node.parent) && node.parent.name === node
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
