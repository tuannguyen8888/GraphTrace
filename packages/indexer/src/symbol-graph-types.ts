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
  const localName = symbolLocalNameFromDeclaration(declaration);
  return localName ? buildSymbolId(filePath, localName) : null;
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
  const route = findEnclosingRouteCall(node);
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

export function findWrappedCallbackExpression(
  node: ts.Node,
): ts.ArrowFunction | ts.FunctionExpression | null {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return node;
  }

  if (ts.isParenthesizedExpression(node)) {
    return findWrappedCallbackExpression(node.expression);
  }

  if (ts.isCallExpression(node)) {
    for (let index = node.arguments.length - 1; index >= 0; index -= 1) {
      const callback = findWrappedCallbackExpression(node.arguments[index]);
      if (callback) {
        return callback;
      }
    }
  }

  return null;
}

export function symbolLocalNameFromDeclaration(
  declaration: ts.Declaration,
): string | null {
  if (ts.isFunctionDeclaration(declaration) && declaration.name) {
    return appendOwnerLocalName(declaration.name.text, declaration);
  }

  if (ts.isClassDeclaration(declaration) && declaration.name) {
    return appendOwnerLocalName(declaration.name.text, declaration);
  }

  if (
    ts.isVariableDeclaration(declaration) &&
    ts.isIdentifier(declaration.name)
  ) {
    if (isTopLevelVariableDeclaration(declaration)) {
      return declaration.name.text;
    }

    if (!supportsNestedVariableSymbol(declaration)) {
      return null;
    }

    return appendOwnerLocalName(declaration.name.text, declaration);
  }

  if (
    ts.isMethodDeclaration(declaration) &&
    declaration.name &&
    ts.isIdentifier(declaration.name)
  ) {
    const ownerName = ownerNameForMember(declaration);
    return ownerName ? `${ownerName}.${declaration.name.text}` : null;
  }

  if (
    ts.isPropertyAssignment(declaration) &&
    ts.isIdentifier(declaration.name) &&
    supportsPropertySymbol(declaration)
  ) {
    const ownerName = ownerNameForObjectLiteral(declaration.parent);
    return ownerName ? `${ownerName}.${declaration.name.text}` : null;
  }

  return null;
}

export function ownerSymbolInfoForDeclaration(
  declaration: ts.Declaration,
  filePath: string,
): { id: string; kind: SymbolDescriptor["kind"] } | null {
  const ownerDeclaration = findOwnerDeclaration(declaration);
  if (!ownerDeclaration) {
    return null;
  }

  const ownerLocalName = symbolLocalNameFromDeclaration(ownerDeclaration);
  const ownerKind = symbolKindFromDeclaration(ownerDeclaration);
  if (!ownerLocalName || !ownerKind) {
    return null;
  }

  return {
    id: buildSymbolId(filePath, ownerLocalName),
    kind: ownerKind,
  };
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

function ownerNameForMember(declaration: ts.MethodDeclaration): string | null {
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

function ownerNameForObjectLiteral(
  node: ts.ObjectLiteralExpression,
): string | null {
  if (
    ts.isVariableDeclaration(node.parent) &&
    ts.isIdentifier(node.parent.name)
  ) {
    return symbolLocalNameFromDeclaration(node.parent);
  }

  if (
    ts.isPropertyAssignment(node.parent) &&
    ts.isIdentifier(node.parent.name)
  ) {
    return symbolLocalNameFromDeclaration(node.parent);
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

function findEnclosingRouteCall(
  node: ts.ArrowFunction | ts.FunctionExpression,
): { receiver: string; method: string; routePath: string } | null {
  let current: ts.Node | undefined = node.parent;

  while (current) {
    if (ts.isCallExpression(current)) {
      const route = routeCallDetails(current);
      if (route) {
        return route;
      }
    }

    if (ts.isFunctionLike(current)) {
      return null;
    }

    current = current.parent;
  }

  return null;
}

function appendOwnerLocalName(
  localName: string,
  declaration: ts.Declaration,
): string | null {
  const ownerDeclaration = findOwnerDeclaration(declaration);
  if (!ownerDeclaration) {
    return localName;
  }

  const ownerLocalName = symbolLocalNameFromDeclaration(ownerDeclaration);
  return ownerLocalName ? `${ownerLocalName}.${localName}` : localName;
}

function findOwnerDeclaration(node: ts.Node): ts.Declaration | null {
  let current: ts.Node | undefined = node.parent;

  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isClassDeclaration(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isPropertyAssignment(current) ||
      ts.isVariableDeclaration(current)
    ) {
      return current;
    }

    current = current.parent;
  }

  return null;
}

function supportsNestedVariableSymbol(
  declaration: ts.VariableDeclaration,
): boolean {
  const initializer = declaration.initializer;
  return Boolean(
    initializer &&
      (ts.isArrowFunction(initializer) ||
        ts.isFunctionExpression(initializer) ||
        ts.isObjectLiteralExpression(initializer) ||
        findWrappedCallbackExpression(initializer)),
  );
}

function supportsPropertySymbol(declaration: ts.PropertyAssignment): boolean {
  return (
    ts.isObjectLiteralExpression(declaration.initializer) ||
    ts.isArrowFunction(declaration.initializer) ||
    ts.isFunctionExpression(declaration.initializer)
  );
}

function symbolKindFromDeclaration(
  declaration: ts.Declaration,
): SymbolDescriptor["kind"] | null {
  if (ts.isFunctionDeclaration(declaration)) {
    return "function";
  }

  if (ts.isClassDeclaration(declaration)) {
    return "class";
  }

  if (ts.isMethodDeclaration(declaration)) {
    return "method";
  }

  if (ts.isVariableDeclaration(declaration)) {
    if (!declaration.initializer) {
      return "variable";
    }

    if (ts.isObjectLiteralExpression(declaration.initializer)) {
      return "object";
    }

    if (
      ts.isArrowFunction(declaration.initializer) ||
      ts.isFunctionExpression(declaration.initializer) ||
      findWrappedCallbackExpression(declaration.initializer)
    ) {
      return "function";
    }

    return "variable";
  }

  if (ts.isPropertyAssignment(declaration)) {
    if (ts.isObjectLiteralExpression(declaration.initializer)) {
      return "object";
    }

    if (
      ts.isArrowFunction(declaration.initializer) ||
      ts.isFunctionExpression(declaration.initializer)
    ) {
      return "function";
    }
  }

  return null;
}
