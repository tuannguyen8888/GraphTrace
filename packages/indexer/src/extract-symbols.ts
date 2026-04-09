import ts from "typescript";

import type { SymbolDescriptor } from "@graphtrace/shared";
import { toPosixPath } from "@graphtrace/shared";
import {
  buildFileId,
  buildInlineRouteHandlerId,
  buildSignatureText,
  buildSourceSpan,
  buildSymbolId,
  detectSymbolLanguage,
  findWrappedCallbackExpression,
  HTTP_ROUTE_METHODS,
  ownerSymbolInfoForDeclaration,
  symbolLocalNameFromDeclaration,
} from "./symbol-graph-types";

export function extractSymbols(
  sourceFile: ts.SourceFile,
  filePath: string,
): SymbolDescriptor[] {
  const normalizedFilePath = toPosixPath(filePath);
  const fileId = buildFileId(normalizedFilePath);
  const language = detectSymbolLanguage(normalizedFilePath);
  const symbols = new Map<string, SymbolDescriptor>();

  const addSymbol = (
    symbol: Omit<SymbolDescriptor, "displayName" | "fileId" | "filePath" | "language"> &
      Partial<
        Pick<SymbolDescriptor, "displayName" | "fileId" | "filePath" | "language">
      >,
  ) => {
    const next: SymbolDescriptor = {
      displayName: symbol.displayName ?? symbol.name,
      fileId: symbol.fileId ?? fileId,
      filePath: symbol.filePath ?? normalizedFilePath,
      language: symbol.language ?? language,
      ...symbol,
    };
    symbols.set(next.id, next);
  };

  const visitNode = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const localName = symbolLocalNameFromDeclaration(node) ?? node.name.text;
      const owner = ownerSymbolInfoForDeclaration(node, normalizedFilePath);
      addSymbol({
        id: buildSymbolId(normalizedFilePath, localName),
        name: node.name.text,
        displayName: localName,
        kind: "function",
        exported: hasExportModifier(node),
        ownerSymbolId: owner?.id,
        ownerKind: owner?.kind,
        signatureText: buildSignatureText(sourceFile, node.parameters),
        span: buildSourceSpan(sourceFile, node),
      });
    }

    if (ts.isClassDeclaration(node) && node.name) {
      const localName = symbolLocalNameFromDeclaration(node) ?? node.name.text;
      const owner = ownerSymbolInfoForDeclaration(node, normalizedFilePath);
      addSymbol({
        id: buildSymbolId(normalizedFilePath, localName),
        name: node.name.text,
        displayName: localName,
        kind: "class",
        exported: hasExportModifier(node),
        ownerSymbolId: owner?.id,
        ownerKind: owner?.kind,
        span: buildSourceSpan(sourceFile, node),
      });
    }

    if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      const localName = symbolLocalNameFromDeclaration(node);
      const owner = ownerSymbolInfoForDeclaration(node, normalizedFilePath);
      if (localName && owner) {
        addSymbol({
          id: buildSymbolId(normalizedFilePath, localName),
          name: node.name.text,
          displayName: localName,
          kind: "method",
          exported: isDeclarationExported(node),
          ownerSymbolId: owner.id,
          ownerKind: owner.kind,
          signatureText: buildSignatureText(sourceFile, node.parameters),
          span: buildSourceSpan(sourceFile, node),
        });
      }
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const localName = symbolLocalNameFromDeclaration(node);
      if (localName) {
        const owner = ownerSymbolInfoForDeclaration(node, normalizedFilePath);
        const callableInitializer = extractCallableInitializer(node.initializer);

        addSymbol({
          id: buildSymbolId(normalizedFilePath, localName),
          name: node.name.text,
          displayName: localName,
          kind: classifyDeclarationKind(node.initializer, callableInitializer),
          exported: isDeclarationExported(node),
          ownerSymbolId: owner?.id,
          ownerKind: owner?.kind,
          signatureText: callableInitializer
            ? buildSignatureText(sourceFile, callableInitializer.parameters)
            : undefined,
          span: buildSourceSpan(sourceFile, node.initializer ?? node),
        });
      }
    }

    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      const localName = symbolLocalNameFromDeclaration(node);
      const owner = ownerSymbolInfoForDeclaration(node, normalizedFilePath);
      const callableInitializer = extractCallableInitializer(node.initializer);

      if (localName && owner && (callableInitializer || ts.isObjectLiteralExpression(node.initializer))) {
        addSymbol({
          id: buildSymbolId(normalizedFilePath, localName),
          name: node.name.text,
          displayName: localName,
          kind: ts.isObjectLiteralExpression(node.initializer)
            ? "object"
            : "function",
          exported: isDeclarationExported(node),
          ownerSymbolId: owner.id,
          ownerKind: owner.kind,
          signatureText: callableInitializer
            ? buildSignatureText(sourceFile, callableInitializer.parameters)
            : undefined,
          span: buildSourceSpan(
            sourceFile,
            callableInitializer ?? node.initializer,
          ),
        });
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression)
    ) {
      const receiver = node.expression.expression.text;
      const method = node.expression.name.text.toLowerCase();
      const [firstArgument] = node.arguments;
      const handler =
        node.arguments
          .map((argument) => extractCallableInitializer(argument))
          .findLast(Boolean) ?? null;

      if (
        handler &&
        HTTP_ROUTE_METHODS.includes(method) &&
        firstArgument &&
        ts.isStringLiteralLike(firstArgument)
      ) {
        const localId = buildInlineRouteHandlerId(
          normalizedFilePath,
          receiver,
          method,
          firstArgument.text,
        ).split("#")[1];

        addSymbol({
          id: buildSymbolId(normalizedFilePath, localId),
          name: localId,
          displayName: `${method.toUpperCase()} ${firstArgument.text} handler`,
          kind: "function",
          exported: false,
          frameworkRole: "route-handler",
          signatureText: buildSignatureText(sourceFile, handler.parameters),
          span: buildSourceSpan(sourceFile, handler),
        });
      }
    }

    ts.forEachChild(node, visitNode);
  };

  ts.forEachChild(sourceFile, visitNode);
  return [...symbols.values()];
}

function hasExportModifier(node: ts.Node): boolean {
  return (node.modifiers ?? []).some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );
}

function isDeclarationExported(node: ts.Node): boolean {
  if (ts.isVariableDeclaration(node)) {
    return (
      ts.isVariableDeclarationList(node.parent) &&
      ts.isVariableStatement(node.parent.parent) &&
      hasExportModifier(node.parent.parent)
    );
  }

  if (ts.isMethodDeclaration(node) && ts.isClassDeclaration(node.parent)) {
    return hasExportModifier(node.parent);
  }

  if (
    ts.isPropertyAssignment(node) &&
    ts.isObjectLiteralExpression(node.parent) &&
    ts.isVariableDeclaration(node.parent.parent) &&
    ts.isVariableDeclarationList(node.parent.parent.parent) &&
    ts.isVariableStatement(node.parent.parent.parent.parent)
  ) {
    return hasExportModifier(node.parent.parent.parent.parent);
  }

  return hasExportModifier(node);
}

function extractCallableInitializer(
  node?: ts.Node,
): ts.ArrowFunction | ts.FunctionExpression | null {
  if (!node) {
    return null;
  }

  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return node;
  }

  return findWrappedCallbackExpression(node);
}

function classifyDeclarationKind(
  initializer: ts.Expression | undefined,
  callableInitializer: ts.ArrowFunction | ts.FunctionExpression | null,
): SymbolDescriptor["kind"] {
  if (initializer && ts.isObjectLiteralExpression(initializer)) {
    return "object";
  }

  if (callableInitializer) {
    return "function";
  }

  return "variable";
}
