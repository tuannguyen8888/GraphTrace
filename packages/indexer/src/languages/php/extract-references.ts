import type { GraphEdgeDescriptor } from "@graphtrace/shared";
import { buildSymbolId } from "../../symbol-graph-types";
import type { IndexedEdgeRecord } from "../js-ts/analyzer";
import {
  type PhpNode,
  type PhpProgram,
  phpIdentifierName,
  walkPhpAst,
} from "./ast";

export interface ParsedPhpFile {
  filePath: string;
  program: PhpProgram;
}

interface PhpDeclaration {
  symbolId: string;
  filePath: string;
  kind: "class" | "interface" | "trait" | "enum" | "function" | "method";
  name: string;
  namespace: string;
  visibility?: string;
  ownerSymbolId?: string;
  ownerFqn?: string;
  fqn?: string;
}

export interface PhpSymbolIndex {
  classLikeByFqn: Map<string, PhpDeclaration>;
  functionByFqn: Map<string, PhpDeclaration>;
  methodsByOwnerAndName: Map<string, PhpDeclaration>;
}

export function buildPhpSymbolIndex(files: ParsedPhpFile[]): PhpSymbolIndex {
  const declarations: PhpDeclaration[] = [];

  for (const file of files) {
    declarations.push(...collectPhpDeclarations(file.program, file.filePath));
  }

  return {
    classLikeByFqn: new Map(
      declarations
        .filter((declaration) =>
          ["class", "interface", "trait", "enum"].includes(declaration.kind),
        )
        .map((declaration) => [
          declaration.fqn ?? declaration.name,
          declaration,
        ]),
    ),
    functionByFqn: new Map(
      declarations
        .filter((declaration) => declaration.kind === "function")
        .map((declaration) => [
          declaration.fqn ?? declaration.name,
          declaration,
        ]),
    ),
    methodsByOwnerAndName: new Map(
      declarations
        .filter((declaration) => declaration.kind === "method")
        .map((declaration) => [
          `${declaration.ownerSymbolId}:${declaration.name}`,
          declaration,
        ]),
    ),
  };
}

export function extractPhpReferences(options: {
  filePath: string;
  program: PhpProgram;
  symbolIndex: PhpSymbolIndex;
}): {
  importEdges: IndexedEdgeRecord[];
  symbolEdges: GraphEdgeDescriptor[];
} {
  const importEdges: IndexedEdgeRecord[] = [];
  const symbolEdges = new Map<string, GraphEdgeDescriptor>();

  const visitBlock = (
    nodes: PhpNode[],
    namespaceName = "",
    useAliases = new Map<string, string>(),
  ) => {
    const scopedAliases = new Map(useAliases);

    for (const node of nodes) {
      if (node.kind === "usegroup") {
        for (const [alias, fqn] of extractUseAliases(node)) {
          scopedAliases.set(alias, fqn);
          const target = resolveClassLike(options.symbolIndex, fqn);
          if (target) {
            importEdges.push({
              id: `edge:imports:${options.filePath}->${target.filePath}`,
              type: "imports",
              sourceId: `file:${options.filePath}`,
              sourceKind: "file",
              targetId: `file:${target.filePath}`,
              targetKind: "file",
              confidence: 1,
            });
          }
        }
        continue;
      }

      if (node.kind === "namespace") {
        visitBlock(
          readNodes(node.children),
          phpIdentifierName(node.name) ?? "",
          scopedAliases,
        );
        continue;
      }

      if (
        node.kind === "class" ||
        node.kind === "interface" ||
        node.kind === "trait" ||
        node.kind === "enum"
      ) {
        const className = phpIdentifierName(node.name);
        if (!className) {
          continue;
        }

        const classFqn = buildQualifiedName(namespaceName, className);
        const classSymbolId = buildSymbolId(options.filePath, className);
        const extendsFqn = resolveName(
          node.extends,
          namespaceName,
          scopedAliases,
        );

        addClassLikeEdge(
          symbolEdges,
          options.symbolIndex,
          classSymbolId,
          extendsFqn,
          "references",
          "php-extends",
        );

        for (const implemented of readNodes(node.implements)) {
          addClassLikeEdge(
            symbolEdges,
            options.symbolIndex,
            classSymbolId,
            resolveName(implemented, namespaceName, scopedAliases),
            "references",
            "php-implements",
          );
        }

        for (const member of readNodes(node.body)) {
          if (member.kind === "traituse") {
            for (const trait of readNodes(member.traits)) {
              addClassLikeEdge(
                symbolEdges,
                options.symbolIndex,
                classSymbolId,
                resolveName(trait, namespaceName, scopedAliases),
                "references",
                "php-trait-use",
              );
            }
            continue;
          }

          if (member.kind !== "method") {
            continue;
          }

          const methodName = phpIdentifierName(member.name);
          if (!methodName) {
            continue;
          }

          const methodSymbolId = buildSymbolId(
            options.filePath,
            `${className}.${methodName}`,
          );
          const thisMethodAliases = new Map(scopedAliases);
          const methodBody = member.body;

          walkPhpAst(methodBody, (child) => {
            if (child.kind !== "call") {
              return;
            }

            const target = resolveCallTarget({
              callNode: child,
              namespaceName,
              useAliases: thisMethodAliases,
              currentClassName: className,
              currentClassFqn: classFqn,
              currentMethodSymbolId: methodSymbolId,
              extendsFqn,
              symbolIndex: options.symbolIndex,
            });
            if (!target) {
              return;
            }

            symbolEdges.set(target.id, target);
          });
        }
      }
    }
  };

  visitBlock(readNodes(options.program.children));

  return {
    importEdges: dedupeImportEdges(importEdges),
    symbolEdges: [...symbolEdges.values()],
  };
}

function collectPhpDeclarations(
  program: PhpProgram,
  filePath: string,
): PhpDeclaration[] {
  const declarations: PhpDeclaration[] = [];

  const visitBlock = (
    nodes: PhpNode[],
    namespaceName = "",
    owner?: {
      symbolId: string;
      fqn: string;
      localName: string;
    },
  ) => {
    for (const node of nodes) {
      if (node.kind === "namespace") {
        visitBlock(
          readNodes(node.children),
          phpIdentifierName(node.name) ?? "",
          owner,
        );
        continue;
      }

      if (
        node.kind === "class" ||
        node.kind === "interface" ||
        node.kind === "trait" ||
        node.kind === "enum"
      ) {
        const name = phpIdentifierName(node.name);
        if (!name) {
          continue;
        }

        const localName = owner ? `${owner.localName}.${name}` : name;
        const declaration = {
          symbolId: buildSymbolId(filePath, localName),
          filePath,
          kind: node.kind,
          name,
          namespace: namespaceName,
          fqn: buildQualifiedName(namespaceName, name),
        } satisfies PhpDeclaration;
        declarations.push(declaration);

        visitBlock(readNodes(node.body), namespaceName, {
          symbolId: declaration.symbolId,
          fqn: declaration.fqn ?? name,
          localName,
        });
        continue;
      }

      if (node.kind === "function") {
        const name = phpIdentifierName(node.name);
        if (!name) {
          continue;
        }

        declarations.push({
          symbolId: buildSymbolId(
            filePath,
            owner ? `${owner.localName}.${name}` : name,
          ),
          filePath,
          kind: "function",
          name,
          namespace: namespaceName,
          ownerSymbolId: owner?.symbolId,
          ownerFqn: owner?.fqn,
          fqn: buildQualifiedName(namespaceName, name),
        });
        continue;
      }

      if (node.kind === "method" && owner) {
        const name = phpIdentifierName(node.name);
        if (!name) {
          continue;
        }

        declarations.push({
          symbolId: buildSymbolId(filePath, `${owner.localName}.${name}`),
          filePath,
          kind: "method",
          name,
          namespace: namespaceName,
          visibility:
            typeof node.visibility === "string" ? node.visibility : undefined,
          ownerSymbolId: owner.symbolId,
          ownerFqn: owner.fqn,
        });
      }
    }
  };

  visitBlock(readNodes(program.children));
  return declarations;
}

function extractUseAliases(node: PhpNode): Map<string, string> {
  const aliases = new Map<string, string>();
  const groupPrefix = phpIdentifierName(node.name);

  for (const item of readNodes(node.items)) {
    const importedName = phpIdentifierName(item.name);
    if (!importedName) {
      continue;
    }

    const fqn = normalizeQualifiedName(
      groupPrefix ? `${groupPrefix}\\${importedName}` : importedName,
    );
    const alias =
      phpIdentifierName(item.alias) ?? fqn.split("\\").at(-1) ?? fqn;
    aliases.set(alias, fqn);
  }

  return aliases;
}

function resolveCallTarget(options: {
  callNode: PhpNode;
  namespaceName: string;
  useAliases: Map<string, string>;
  currentClassName: string;
  currentClassFqn: string;
  currentMethodSymbolId: string;
  extendsFqn: string | null;
  symbolIndex: PhpSymbolIndex;
}): GraphEdgeDescriptor | null {
  const receiver = asPhpNode(options.callNode.what);
  if (!receiver) {
    return null;
  }

  if (receiver.kind === "staticlookup") {
    const classFqn = resolveName(
      receiver.what,
      options.namespaceName,
      options.useAliases,
    );
    const classTarget = classFqn
      ? resolveClassLike(options.symbolIndex, classFqn)
      : null;
    const methodName = phpIdentifierName(receiver.offset);
    const methodTarget =
      classTarget && methodName
        ? options.symbolIndex.methodsByOwnerAndName.get(
            `${classTarget.symbolId}:${methodName}`,
          )
        : null;

    if (!methodTarget) {
      return null;
    }

    return buildSymbolEdge(
      "calls",
      options.currentMethodSymbolId,
      methodTarget.symbolId,
      "php-static-call",
      [classFqn ?? methodName ?? ""].filter(Boolean),
    );
  }

  if (
    receiver.kind === "propertylookup" &&
    asPhpNode(receiver.what)?.kind === "variable" &&
    phpIdentifierName(asPhpNode(receiver.what)?.name) === "this"
  ) {
    const methodName = phpIdentifierName(receiver.offset);
    if (!methodName) {
      return null;
    }

    const target =
      options.symbolIndex.methodsByOwnerAndName.get(
        `${buildSymbolId(options.currentMethodSymbolId.split("#")[0].replace(/^symbol:/, ""), options.currentClassName)}:${methodName}`,
      ) ??
      (options.extendsFqn
        ? options.symbolIndex.methodsByOwnerAndName.get(
            `${resolveClassLike(options.symbolIndex, options.extendsFqn)?.symbolId}:${methodName}`,
          )
        : undefined);

    if (!target) {
      return null;
    }

    return buildSymbolEdge(
      "calls",
      options.currentMethodSymbolId,
      target.symbolId,
      "php-this-call",
      [options.currentClassFqn, methodName],
    );
  }

  return null;
}

function addClassLikeEdge(
  edges: Map<string, GraphEdgeDescriptor>,
  symbolIndex: PhpSymbolIndex,
  sourceSymbolId: string,
  targetFqn: string | null,
  type: GraphEdgeDescriptor["type"],
  provenanceKind: string,
) {
  if (!targetFqn) {
    return;
  }

  const target = resolveClassLike(symbolIndex, targetFqn);
  if (!target) {
    return;
  }

  const edge = buildSymbolEdge(
    type,
    sourceSymbolId,
    target.symbolId,
    provenanceKind,
    [targetFqn],
  );
  edges.set(edge.id, edge);
}

function resolveClassLike(
  symbolIndex: PhpSymbolIndex,
  fqn: string,
): PhpDeclaration | undefined {
  return symbolIndex.classLikeByFqn.get(normalizeQualifiedName(fqn));
}

function resolveName(
  value: unknown,
  namespaceName: string,
  useAliases: Map<string, string>,
): string | null {
  const rawName = phpIdentifierName(value);
  if (!rawName) {
    return null;
  }

  const normalized = normalizeQualifiedName(rawName);
  if (normalized.includes("\\")) {
    const [firstSegment, ...rest] = normalized.split("\\");
    const alias = useAliases.get(firstSegment);
    if (alias) {
      return normalizeQualifiedName(
        rest.length > 0 ? `${alias}\\${rest.join("\\")}` : alias,
      );
    }
    return normalized;
  }

  const alias = useAliases.get(normalized);
  if (alias) {
    return normalizeQualifiedName(alias);
  }

  return buildQualifiedName(namespaceName, normalized);
}

function buildQualifiedName(namespaceName: string, name: string): string {
  const normalizedName = normalizeQualifiedName(name);
  return namespaceName
    ? `${normalizeQualifiedName(namespaceName)}\\${normalizedName}`
    : normalizedName;
}

function normalizeQualifiedName(name: string): string {
  return name.replace(/^\\+/, "");
}

function buildSymbolEdge(
  type: GraphEdgeDescriptor["type"],
  sourceId: string,
  targetId: string,
  provenanceKind: string,
  evidence: string[],
): GraphEdgeDescriptor {
  return {
    id: `edge:${type}:${sourceId}->${targetId}`,
    type,
    sourceId,
    sourceKind: "symbol",
    targetId,
    targetKind: "symbol",
    confidence: 0.95,
    confidenceLabel: "proven",
    provenance: {
      kind: provenanceKind,
      source: "php-parser",
      evidence,
    },
  };
}

function dedupeImportEdges(edges: IndexedEdgeRecord[]): IndexedEdgeRecord[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    if (seen.has(edge.id)) {
      return false;
    }
    seen.add(edge.id);
    return true;
  });
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

function asPhpNode(value: unknown): PhpNode | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("kind" in value) ||
    typeof value.kind !== "string"
  ) {
    return null;
  }

  return value as PhpNode;
}
