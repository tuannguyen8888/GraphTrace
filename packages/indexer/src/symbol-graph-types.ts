import type ts from "typescript";

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
