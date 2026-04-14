import { Engine } from "php-parser";

import type { SourceSpan } from "@graphtrace/shared";

export interface PhpPosition {
  line: number;
  column: number;
  offset: number;
}

export interface PhpLocation {
  start: PhpPosition;
  end: PhpPosition;
}

export interface PhpNode {
  kind: string;
  loc?: PhpLocation;
  [key: string]: unknown;
}

export interface PhpProgram extends PhpNode {
  kind: "program";
  children: PhpNode[];
}

const parser = new Engine({
  parser: {
    extractDoc: true,
    suppressErrors: false,
    version: "8.2",
  },
  ast: {
    withPositions: true,
  },
});

export function parsePhpCode(sourceText: string, filePath: string): PhpProgram {
  return parser.parseCode(sourceText, filePath) as unknown as PhpProgram;
}

export function phpNodeSpan(node: PhpNode | undefined): SourceSpan | undefined {
  if (!node?.loc) {
    return undefined;
  }

  return {
    startLine: node.loc.start.line,
    startColumn: node.loc.start.column + 1,
    endLine: node.loc.end.line,
    endColumn: node.loc.end.column + 1,
  };
}

export function phpIdentifierName(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && value !== null) {
    if ("name" in value && typeof value.name === "string") {
      return value.name;
    }
  }

  return null;
}

export function walkPhpAst(
  node: unknown,
  visitor: (node: PhpNode) => void,
): void {
  if (!node || typeof node !== "object") {
    return;
  }

  if (Array.isArray(node)) {
    for (const entry of node) {
      walkPhpAst(entry, visitor);
    }
    return;
  }

  if (!("kind" in node) || typeof node.kind !== "string") {
    for (const value of Object.values(node)) {
      walkPhpAst(value, visitor);
    }
    return;
  }

  const phpNode = node as PhpNode;
  visitor(phpNode);

  for (const [key, value] of Object.entries(phpNode)) {
    if (key === "loc" || key === "kind") {
      continue;
    }
    walkPhpAst(value, visitor);
  }
}
