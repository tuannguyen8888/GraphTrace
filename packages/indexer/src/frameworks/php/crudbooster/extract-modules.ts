import type { SymbolDescriptor } from "@graphtrace/shared";
import type { PhpSymbolIndex } from "../../../languages/php/extract-references";

const CRUDBOOSTER_ACTION_NAMES = new Set([
  "getIndex",
  "getAdd",
  "postAdd",
  "getEdit",
  "postEdit",
  "getDelete",
  "postDelete",
  "getDetail",
]);

export interface CrudBoosterModule {
  controllerSymbolId: string;
  actionSymbolIds: string[];
  modelSymbolId?: string;
}

export function extractCrudBoosterModules(options: {
  filePath: string;
  sourceText: string;
  symbols: SymbolDescriptor[];
  symbolIndex: PhpSymbolIndex;
}): {
  symbols: SymbolDescriptor[];
  modules: CrudBoosterModule[];
} {
  if (!isCrudBoosterControllerSource(options.sourceText)) {
    return {
      symbols: options.symbols,
      modules: [],
    };
  }

  const controllerSymbol = options.symbols.find(
    (symbol) => symbol.kind === "class" && symbol.name.endsWith("Controller"),
  );
  if (!controllerSymbol) {
    return {
      symbols: options.symbols,
      modules: [],
    };
  }

  const actionSymbolIds = options.symbols
    .filter(
      (symbol) =>
        symbol.ownerSymbolId === controllerSymbol.id &&
        symbol.kind === "method" &&
        CRUDBOOSTER_ACTION_NAMES.has(symbol.name),
    )
    .map((symbol) => symbol.id);
  const cbInitSymbolId = options.symbols.find(
    (symbol) =>
      symbol.ownerSymbolId === controllerSymbol.id && symbol.name === "cbInit",
  )?.id;
  const modelSymbolId = resolveCrudBoosterModelSymbolId(
    options.sourceText,
    options.symbolIndex,
  );

  return {
    symbols: options.symbols.map((symbol) => {
      if (symbol.id === controllerSymbol.id) {
        return {
          ...symbol,
          frameworkRole: "crudbooster-module",
        };
      }

      if (symbol.id === cbInitSymbolId) {
        return {
          ...symbol,
          frameworkRole: "crudbooster-config",
        };
      }

      if (actionSymbolIds.includes(symbol.id)) {
        return {
          ...symbol,
          frameworkRole: "crudbooster-action",
        };
      }

      return symbol;
    }),
    modules: [
      {
        controllerSymbolId: controllerSymbol.id,
        actionSymbolIds,
        modelSymbolId,
      },
    ],
  };
}

function isCrudBoosterControllerSource(sourceText: string): boolean {
  return (
    /extends\s+CBController\b/.test(sourceText) &&
    /\bfunction\s+cbInit\s*\(/.test(sourceText)
  );
}

function resolveCrudBoosterModelSymbolId(
  sourceText: string,
  symbolIndex: PhpSymbolIndex,
): string | undefined {
  const aliases = readUseAliases(sourceText);
  const modelMatch = sourceText.match(
    /\$this->model\s*=\s*([A-Za-z0-9_\\]+)::class\s*;/,
  );
  if (modelMatch) {
    const modelFqn = resolveQualifiedName(modelMatch[1], aliases);
    return symbolIndex.classLikeByFqn.get(modelFqn)?.symbolId;
  }

  const tableMatch = sourceText.match(
    /\$this->table\s*=\s*['"]([^'"]+)['"]\s*;/,
  );
  if (!tableMatch) {
    return undefined;
  }

  const inferredModel = `App\\Models\\${singularize(tableMatch[1])}`;
  return symbolIndex.classLikeByFqn.get(inferredModel)?.symbolId;
}

function readUseAliases(sourceText: string): Map<string, string> {
  const aliases = new Map<string, string>();

  for (const match of sourceText.matchAll(/use\s+([^;]+);/g)) {
    const raw = match[1].trim();
    const [pathPart, aliasPart] = raw.split(/\s+as\s+/i);
    const normalized = normalizeQualifiedName(pathPart);
    aliases.set(
      aliasPart?.trim() ?? normalized.split("\\").at(-1) ?? normalized,
      normalized,
    );
  }

  return aliases;
}

function resolveQualifiedName(
  value: string,
  aliases: Map<string, string>,
): string {
  const normalized = normalizeQualifiedName(value);
  if (normalized.includes("\\")) {
    const [firstSegment, ...rest] = normalized.split("\\");
    const alias = aliases.get(firstSegment);
    if (alias) {
      return normalizeQualifiedName(
        rest.length > 0 ? `${alias}\\${rest.join("\\")}` : alias,
      );
    }
    return normalized;
  }

  return aliases.get(normalized) ?? `App\\Models\\${normalized}`;
}

function normalizeQualifiedName(name: string): string {
  return name.replace(/^\\+/, "");
}

function singularize(value: string): string {
  if (value.endsWith("ies")) {
    return `${value.slice(0, -3)}y`;
  }
  if (value.endsWith("s")) {
    return value.slice(0, -1);
  }
  return value;
}
