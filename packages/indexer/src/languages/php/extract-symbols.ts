import type { SymbolDescriptor } from "@graphtrace/shared";
import { toPosixPath } from "@graphtrace/shared";
import { buildFileId, buildSymbolId } from "../../symbol-graph-types";
import {
  type PhpNode,
  type PhpProgram,
  phpIdentifierName,
  phpNodeSpan,
} from "./ast";

interface OwnerContext {
  kind: "class" | "interface" | "trait" | "enum";
  localName: string;
}

export function extractPhpSymbols(
  program: PhpProgram,
  filePath: string,
): SymbolDescriptor[] {
  const normalizedFilePath = toPosixPath(filePath);
  const fileId = buildFileId(normalizedFilePath);
  const symbols = new Map<string, SymbolDescriptor>();

  const addSymbol = (symbol: SymbolDescriptor) => {
    symbols.set(symbol.id, symbol);
  };

  const visitNode = (node: PhpNode, owners: OwnerContext[] = []): void => {
    switch (node.kind) {
      case "program":
        for (const child of readNodes(node.children)) {
          visitNode(child, owners);
        }
        return;
      case "namespace":
        for (const child of readNodes(node.children)) {
          visitNode(child, owners);
        }
        return;
      case "class":
      case "interface":
      case "trait":
      case "enum": {
        const name = phpIdentifierName(node.name);
        if (!name) {
          return;
        }

        const localName = appendOwnerName(owners, name);
        addSymbol({
          id: buildSymbolId(normalizedFilePath, localName),
          name,
          displayName: localName,
          kind: node.kind,
          language: "php",
          fileId,
          filePath: normalizedFilePath,
          exported: true,
          span: phpNodeSpan(node),
        });

        for (const child of readNodes(node.body)) {
          visitNode(child, [
            ...owners,
            {
              kind: node.kind,
              localName,
            },
          ]);
        }
        return;
      }
      case "method": {
        const owner = owners.at(-1);
        const name = phpIdentifierName(node.name);
        if (!owner || !name) {
          return;
        }

        const localName = `${owner.localName}.${name}`;
        addSymbol({
          id: buildSymbolId(normalizedFilePath, localName),
          name,
          displayName: localName,
          kind: "method",
          language: "php",
          fileId,
          filePath: normalizedFilePath,
          exported: false,
          ownerSymbolId: buildSymbolId(normalizedFilePath, owner.localName),
          ownerKind: owner.kind,
          signatureText: buildPhpSignature(node.arguments),
          span: phpNodeSpan(node),
        });
        return;
      }
      case "function": {
        const name = phpIdentifierName(node.name);
        if (!name) {
          return;
        }

        const owner = owners.at(-1);
        const localName = appendOwnerName(owners, name);
        addSymbol({
          id: buildSymbolId(normalizedFilePath, localName),
          name,
          displayName: localName,
          kind: "function",
          language: "php",
          fileId,
          filePath: normalizedFilePath,
          exported: owners.length === 0,
          ownerSymbolId: owner
            ? buildSymbolId(normalizedFilePath, owner.localName)
            : undefined,
          ownerKind: owner?.kind,
          signatureText: buildPhpSignature(node.arguments),
          span: phpNodeSpan(node),
        });
        return;
      }
      default:
        return;
    }
  };

  visitNode(program);
  return [...symbols.values()];
}

function appendOwnerName(owners: OwnerContext[], name: string): string {
  const owner = owners.at(-1);
  return owner ? `${owner.localName}.${name}` : name;
}

function buildPhpSignature(argumentsList: unknown): string | undefined {
  const parameters = readNodes(argumentsList)
    .map((parameter) => phpIdentifierName(parameter.name))
    .filter((name): name is string => Boolean(name));

  if (parameters.length === 0) {
    return "()";
  }

  return `(${parameters.map((name) => `$${name}`).join(", ")})`;
}

function readNodes(value: unknown): PhpNode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is PhpNode =>
      Boolean(entry) &&
      typeof entry === "object" &&
      "kind" in entry &&
      typeof entry.kind === "string",
  );
}
