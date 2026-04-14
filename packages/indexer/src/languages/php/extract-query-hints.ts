import type { SymbolDescriptor } from "@graphtrace/shared";
import type { IndexedEdgeRecord } from "../js-ts/analyzer";

export function extractPhpQueryHints(
  sourceText: string,
  filePath: string,
  unitId: string,
  symbols: SymbolDescriptor[] = [],
): IndexedEdgeRecord[] {
  const queryEdges = new Map<string, IndexedEdgeRecord>();
  const normalizedFilePath = filePath.replaceAll("\\", "/");
  const matchers = [
    /\b[A-Z][A-Za-z0-9_]*::query\(\)(?:->\w+\([^)]*\))*->(?:get|first|find|findOrFail|create|update|delete)\(/g,
    /\bDB::(?:table|query)\([^)]*\)(?:->\w+\([^)]*\))*->(?:get|first|insert|update|delete)\(/g,
  ];
  const localSymbols = symbols.filter(
    (symbol) =>
      symbol.filePath === normalizedFilePath &&
      (symbol.kind === "method" || symbol.kind === "function"),
  );

  for (const pattern of matchers) {
    for (const match of sourceText.matchAll(pattern)) {
      const label = match[0];
      const targetId = `query:${normalizedFilePath}#${label}`;
      const metadata = {
        label,
        filePath: normalizedFilePath,
        unitId,
        pluginId: "language:php",
        pluginVersion: "internal",
      };

      queryEdges.set(`edge:query:${normalizedFilePath}:${label}`, {
        id: `edge:query:${normalizedFilePath}:${label}`,
        type: "queries",
        sourceId: `file:${normalizedFilePath}`,
        sourceKind: "file",
        targetId,
        targetKind: "query",
        confidence: 0.9,
        metadata,
      });

      if (match.index == null) {
        continue;
      }

      const { line, column } = offsetToLineColumn(sourceText, match.index);
      const sourceSymbol = findEnclosingSymbol(localSymbols, line, column);
      if (!sourceSymbol) {
        continue;
      }

      queryEdges.set(`edge:queries:${sourceSymbol.id}->${targetId}`, {
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
          source: "php-parser",
          evidence: [label],
        },
        metadata,
      });
    }
  }

  return [...queryEdges.values()];
}

function findEnclosingSymbol(
  symbols: SymbolDescriptor[],
  line: number,
  column: number,
): SymbolDescriptor | null {
  const candidates = symbols.filter((symbol) =>
    containsPosition(symbol, line, column),
  );

  return (
    candidates.sort((left, right) => spanSize(left) - spanSize(right))[0] ??
    null
  );
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

function offsetToLineColumn(
  sourceText: string,
  offset: number,
): { line: number; column: number } {
  const preceding = sourceText.slice(0, offset);
  const segments = preceding.split("\n");
  return {
    line: segments.length,
    column: (segments.at(-1)?.length ?? 0) + 1,
  };
}
