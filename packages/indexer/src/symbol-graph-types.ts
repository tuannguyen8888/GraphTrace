import ts from "typescript";

import type { SourceSpan, SymbolDescriptor } from "@graphtrace/shared";
import { toPosixPath } from "@graphtrace/shared";

export type ExtractedSymbol = SymbolDescriptor;

export const HTTP_ROUTE_METHODS = ["get", "post", "put", "patch", "delete"];

export function detectSymbolLanguage(
  filePath: string,
): SymbolDescriptor["language"] {
  if (/\.(ts|tsx)$/.test(filePath)) {
    return "typescript";
  }
  if (/\.(js|jsx)$/.test(filePath)) {
    return "javascript";
  }
  return "unknown";
}

export function buildSymbolId(filePath: string, localId: string): string {
  return `symbol:${toPosixPath(filePath)}#${localId}`;
}

export function buildFileId(filePath: string): string {
  return `file:${toPosixPath(filePath)}`;
}

export function buildInlineRouteHandlerId(
  filePath: string,
  receiver: string,
  method: string,
  routePath: string,
): string {
  const normalizedPath = sanitizeSegment(routePath);
  const receiverName = sanitizeSegment(receiver) || "route";
  return buildSymbolId(
    filePath,
    `${receiverName}.${method.toLowerCase()}.${normalizedPath || "root"}`,
  );
}

export function symbolIdFromDeclaration(
  declaration: ts.Declaration,
  filePath: string,
): string | null {
  if (ts.isFunctionDeclaration(declaration) && declaration.name) {
    return buildSymbolId(filePath, declaration.name.text);
  }

  if (ts.isClassDeclaration(declaration) && declaration.name) {
    return buildSymbolId(filePath, declaration.name.text);
  }

  if (ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name)) {
    if (!isTopLevelVariableDeclaration(declaration)) {
      return null;
    }
    return buildSymbolId(filePath, declaration.name.text);
  }

  if (
    ts.isMethodDeclaration(declaration) &&
    declaration.name &&
    ts.isIdentifier(declaration.name)
  ) {
    const ownerName = ownerNameForMember(declaration);
    if (ownerName) {
      return buildSymbolId(filePath, `${ownerName}.${declaration.name.text}`);
    }
  }

  if (
    ts.isPropertyAssignment(declaration) &&
    ts.isIdentifier(declaration.name) &&
    (ts.isArrowFunction(declaration.initializer) ||
      ts.isFunctionExpression(declaration.initializer))
  ) {
    const ownerName = ownerNameForObjectLiteral(declaration.parent);
    if (ownerName) {
      return buildSymbolId(filePath, `${ownerName}.${declaration.name.text}`);
    }
  }

  return null;
}

export function routeCallDetails(
  callExpression: ts.CallExpression,
): { receiver: string; method: string; routePath: string } | null {
  if (
    !ts.isPropertyAccessExpression(callExpression.expression) ||
    !ts.isIdentifier(callExpression.expression.expression)
  ) {
    return null;
  }

  const method = callExpression.expression.name.text.toLowerCase();
  const [firstArgument] = callExpression.arguments;
  if (
    !HTTP_ROUTE_METHODS.includes(method) ||
    !firstArgument ||
    !ts.isStringLiteralLike(firstArgument)
  ) {
    return null;
  }

  return {
    receiver: callExpression.expression.expression.text,
    method,
    routePath: firstArgument.text,
  };
}

export function inlineRouteHandlerSymbolId(
  node: ts.ArrowFunction | ts.FunctionExpression,
  filePath: string,
): string | null {
  if (!ts.isCallExpression(node.parent)) {
    return null;
  }

  const route = routeCallDetails(node.parent);
  if (!route) {
    return null;
  }

  return buildInlineRouteHandlerId(
    filePath,
    route.receiver,
    route.method,
    route.routePath,
  );
}

export function buildSourceSpan(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): SourceSpan {
  const start = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

  return {
    startLine: start.line + 1,
    startColumn: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  };
}

export function buildSignatureText(
  sourceFile: ts.SourceFile,
  parameters: ts.NodeArray<ts.ParameterDeclaration>,
): string {
  return `(${parameters.map((parameter) => parameter.getText(sourceFile)).join(", ")})`;
}

export function sanitizeSegment(value: string): string {
  return value
    .replace(/^[./]+/, "")
    .replace(/[^A-Za-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".");
}

function ownerNameForMember(
  declaration: ts.MethodDeclaration,
): string | null {
  if (
    ts.isClassDeclaration(declaration.parent) &&
    declaration.parent.name?.text
  ) {
    return declaration.parent.name.text;
  }

  if (ts.isObjectLiteralExpression(declaration.parent)) {
    return ownerNameForObjectLiteral(declaration.parent);
  }

  return null;
}

function ownerNameForObjectLiteral(node: ts.ObjectLiteralExpression): string | null {
  if (
    ts.isVariableDeclaration(node.parent) &&
    ts.isIdentifier(node.parent.name) &&
    isTopLevelVariableDeclaration(node.parent)
  ) {
    return node.parent.name.text;
  }

  return null;
}

function isTopLevelVariableDeclaration(node: ts.VariableDeclaration): boolean {
  return (
    ts.isVariableDeclarationList(node.parent) &&
    ts.isVariableStatement(node.parent.parent) &&
    ts.isSourceFile(node.parent.parent.parent)
  );
}
