import type { PluginProvenance, RouteItem } from "@graphtrace/shared";
import type { PhpSymbolIndex } from "../../../languages/php/extract-references";

const EXPLICIT_ROUTE_PATTERN =
  /Route::(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]\s*,\s*\[([A-Za-z0-9_\\]+)::class,\s*['"]([A-Za-z0-9_]+)['"]\]\s*\)/g;
const PREFIX_GROUP_PATTERN =
  /Route::prefix\(\s*['"]([^'"]+)['"]\s*\)->group\(function\s*\([^)]*\)\s*\{([\s\S]*?)\}\s*\);/g;
const RESOURCE_ROUTE_PATTERN =
  /Route::(apiResource|resource)\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z0-9_\\]+)::class/g;

export function extractLaravelRoutes(options: {
  filePath: string;
  sourceText: string;
  unitId: string;
  symbolIndex: PhpSymbolIndex;
}): RouteItem[] {
  const aliases = readUseAliases(options.sourceText);
  return dedupeRoutes(
    extractRouteBlock({
      filePath: options.filePath,
      sourceText: options.sourceText,
      unitId: options.unitId,
      prefix: "",
      aliases,
      symbolIndex: options.symbolIndex,
    }),
  );
}

function extractRouteBlock(options: {
  filePath: string;
  sourceText: string;
  unitId: string;
  prefix: string;
  aliases: Map<string, string>;
  symbolIndex: PhpSymbolIndex;
}): RouteItem[] {
  const routes: RouteItem[] = [];
  let remaining = options.sourceText;

  for (const match of options.sourceText.matchAll(PREFIX_GROUP_PATTERN)) {
    const nextPrefix = joinRoutePath(options.prefix, match[1]);
    routes.push(
      ...extractRouteBlock({
        ...options,
        sourceText: match[2],
        prefix: nextPrefix,
      }),
    );
    remaining = remaining.replace(match[0], "");
  }

  for (const match of remaining.matchAll(EXPLICIT_ROUTE_PATTERN)) {
    const method = match[1].toUpperCase();
    const path = joinRoutePath(options.prefix, match[2]);
    const controllerName = resolveControllerClass(match[3], options.aliases);
    const action = match[4];

    routes.push(
      buildRouteItem({
        method,
        path,
        controllerName,
        action,
        filePath: options.filePath,
        unitId: options.unitId,
        symbolIndex: options.symbolIndex,
      }),
    );
  }

  for (const match of remaining.matchAll(RESOURCE_ROUTE_PATTERN)) {
    const controllerName = resolveControllerClass(match[3], options.aliases);
    routes.push(
      ...expandResourceRoutes({
        resource: match[2],
        controllerName,
        apiOnly: match[1] === "apiResource",
        filePath: options.filePath,
        unitId: options.unitId,
        prefix: options.prefix,
        symbolIndex: options.symbolIndex,
      }),
    );
  }

  return routes;
}

function expandResourceRoutes(options: {
  resource: string;
  controllerName: string;
  apiOnly: boolean;
  filePath: string;
  unitId: string;
  prefix: string;
  symbolIndex: PhpSymbolIndex;
}): RouteItem[] {
  const basePath = joinRoutePath(options.prefix, options.resource);
  const resourceKey = singularize(options.resource);
  const detailPath = `${basePath}/{${resourceKey}}`;
  const definitions = [
    { method: "GET", path: basePath, action: "index" },
    ...(options.apiOnly
      ? []
      : [{ method: "GET", path: `${basePath}/create`, action: "create" }]),
    { method: "POST", path: basePath, action: "store" },
    { method: "GET", path: detailPath, action: "show" },
    ...(options.apiOnly
      ? []
      : [{ method: "GET", path: `${detailPath}/edit`, action: "edit" }]),
    { method: "PUT", path: detailPath, action: "update" },
    { method: "PATCH", path: detailPath, action: "update" },
    { method: "DELETE", path: detailPath, action: "destroy" },
  ];

  return definitions.map((definition) =>
    buildRouteItem({
      method: definition.method,
      path: definition.path,
      controllerName: options.controllerName,
      action: definition.action,
      filePath: options.filePath,
      unitId: options.unitId,
      symbolIndex: options.symbolIndex,
    }),
  );
}

function buildRouteItem(options: {
  method: string;
  path: string;
  controllerName: string;
  action: string;
  filePath: string;
  unitId: string;
  symbolIndex: PhpSymbolIndex;
}): RouteItem {
  const declaration =
    options.symbolIndex.classLikeByFqn.get(options.controllerName) ??
    options.symbolIndex.classLikeByFqn.get(
      normalizeQualifiedName(options.controllerName),
    );
  const handlerSymbolId =
    declaration &&
    options.symbolIndex.methodsByOwnerAndName.get(
      `${declaration.symbolId}:${options.action}`,
    )?.symbolId;
  const shortName =
    options.controllerName.split("\\").at(-1) ?? options.controllerName;

  return {
    id: `${options.method} ${options.path}`,
    method: options.method,
    path: options.path,
    handlerName: `${shortName}@${options.action}`,
    handlerSymbolId:
      handlerSymbolId ??
      `symbol:app/Http/Controllers/${shortName}.php#${shortName}.${options.action}`,
    filePath: options.filePath,
    framework: "laravel",
    unitId: options.unitId,
    confidence: 0.95,
    provenance: buildProvenance(),
  };
}

function readUseAliases(sourceText: string): Map<string, string> {
  const aliases = new Map<string, string>();

  for (const match of sourceText.matchAll(/use\s+([^;]+);/g)) {
    const raw = match[1].trim();
    const [pathPart, aliasPart] = raw.split(/\s+as\s+/i);
    const fqn = normalizeQualifiedName(pathPart);
    const alias = aliasPart?.trim() ?? fqn.split("\\").at(-1) ?? fqn;
    aliases.set(alias, fqn);
  }

  return aliases;
}

function resolveControllerClass(
  controllerRef: string,
  aliases: Map<string, string>,
): string {
  const normalized = normalizeQualifiedName(controllerRef);
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

  return aliases.get(normalized) ?? `App\\Http\\Controllers\\${normalized}`;
}

function joinRoutePath(prefix: string, path: string): string {
  const segments = [prefix, path]
    .map((segment) => segment.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);

  return `/${segments.join("/")}`;
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

function normalizeQualifiedName(name: string): string {
  return name.replace(/^\\+/, "");
}

function dedupeRoutes(routes: RouteItem[]): RouteItem[] {
  const seen = new Set<string>();
  return routes.filter((route) => {
    const key = `${route.id}:${route.handlerSymbolId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildProvenance(): PluginProvenance {
  return {
    pluginId: "framework:laravel",
    pluginVersion: "internal",
    confidence: 0.95,
  };
}
