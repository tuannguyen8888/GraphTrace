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
  HTTP_ROUTE_METHODS,
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
      addSymbol({
        id: buildSymbolId(normalizedFilePath, node.name.text),
        name: node.name.text,
        kind: "function",
        exported: hasExportModifier(node),
        signatureText: buildSignatureText(sourceFile, node.parameters),
        span: buildSourceSpan(sourceFile, node),
      });
    }

    if (ts.isClassDeclaration(node) && node.name) {
      const classId = buildSymbolId(normalizedFilePath, node.name.text);
      addSymbol({
        id: classId,
        name: node.name.text,
        kind: "class",
        exported: hasExportModifier(node),
        span: buildSourceSpan(sourceFile, node),
      });

      for (const member of node.members) {
        if (
          !ts.isMethodDeclaration(member) ||
          !member.name ||
          !ts.isIdentifier(member.name)
        ) {
          continue;
        }

        addSymbol({
          id: buildSymbolId(
            normalizedFilePath,
            `${node.name.text}.${member.name.text}`,
          ),
          name: member.name.text,
          displayName: `${node.name.text}.${member.name.text}`,
          kind: "method",
          exported: hasExportModifier(node),
          ownerSymbolId: classId,
          ownerKind: "class",
          signatureText: buildSignatureText(sourceFile, member.parameters),
          span: buildSourceSpan(sourceFile, member),
        });
      }
    }

    if (ts.isVariableStatement(node)) {
      if (!ts.isSourceFile(node.parent)) {
        ts.forEachChild(node, visitNode);
        return;
      }

      const exported = hasExportModifier(node);

      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          continue;
        }

        const variableName = declaration.name.text;
        const variableId = buildSymbolId(normalizedFilePath, variableName);
        const isObjectLiteral = ts.isObjectLiteralExpression(
          declaration.initializer,
        );
        const isCallableInitializer =
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer));

        addSymbol({
          id: variableId,
          name: variableName,
          kind: isObjectLiteral
            ? "object"
            : isCallableInitializer
              ? "function"
              : "variable",
          exported,
          signatureText: isCallableInitializer
            ? buildSignatureText(sourceFile, declaration.initializer.parameters)
            : undefined,
          span: buildSourceSpan(
            sourceFile,
            declaration.initializer ?? declaration,
          ),
        });

        if (ts.isObjectLiteralExpression(declaration.initializer)) {
          for (const property of declaration.initializer.properties) {
            if (
              ts.isMethodDeclaration(property) &&
              ts.isIdentifier(property.name)
            ) {
              addSymbol({
                id: buildSymbolId(
                  normalizedFilePath,
                  `${variableName}.${property.name.text}`,
                ),
                name: property.name.text,
                displayName: `${variableName}.${property.name.text}`,
                kind: "method",
                exported,
                ownerSymbolId: variableId,
                ownerKind: "object",
                signatureText: buildSignatureText(
                  sourceFile,
                  property.parameters,
                ),
                span: buildSourceSpan(sourceFile, property),
              });
              continue;
            }

            if (
              ts.isPropertyAssignment(property) &&
              ts.isIdentifier(property.name) &&
              (ts.isArrowFunction(property.initializer) ||
                ts.isFunctionExpression(property.initializer))
            ) {
              addSymbol({
                id: buildSymbolId(
                  normalizedFilePath,
                  `${variableName}.${property.name.text}`,
                ),
                name: property.name.text,
                displayName: `${variableName}.${property.name.text}`,
                kind: "function",
                exported,
                ownerSymbolId: variableId,
                ownerKind: "object",
                signatureText: buildSignatureText(
                  sourceFile,
                  property.initializer.parameters,
                ),
                span: buildSourceSpan(sourceFile, property.initializer),
              });
            }
          }
        }
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
        node.arguments.findLast(
          (argument) =>
            ts.isArrowFunction(argument) || ts.isFunctionExpression(argument),
        ) ?? null;

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
