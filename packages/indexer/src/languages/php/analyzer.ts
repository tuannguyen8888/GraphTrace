import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { toPosixPath } from "@graphtrace/shared";
import { extractCrudBoosterFlow } from "../../frameworks/php/crudbooster/extract-flow";
import { extractCrudBoosterModules } from "../../frameworks/php/crudbooster/extract-modules";
import { extractLaravelFlow } from "../../frameworks/php/laravel/extract-flow";
import { extractLaravelRoutes } from "../../frameworks/php/laravel/extract-routes";
import type { JsTsFileArtifacts } from "../js-ts/analyzer";
import type { AnalyzeJsTsWorkspaceOptions } from "../js-ts/analyzer";
import { parsePhpCode } from "./ast";
import { extractPhpQueryHints } from "./extract-query-hints";
import {
  type ParsedPhpFile,
  buildPhpSymbolIndex,
  extractPhpReferences,
} from "./extract-references";
import { extractPhpSymbols } from "./extract-symbols";

export async function analyzePhpWorkspace(
  options: AnalyzeJsTsWorkspaceOptions,
): Promise<JsTsFileArtifacts[]> {
  const parsedFiles: Array<
    ParsedPhpFile & {
      sourceText: string;
      hash: string;
    }
  > = [];

  for (const filePath of options.allFiles) {
    const absolutePath = join(options.workspaceRoot, filePath);
    const sourceText = await readFile(absolutePath, "utf8");
    const normalizedFilePath = toPosixPath(filePath);

    parsedFiles.push({
      filePath: normalizedFilePath,
      sourceText,
      hash: createHash("sha1").update(sourceText).digest("hex"),
      program: parsePhpCode(sourceText, normalizedFilePath),
    });
  }

  const symbolIndex = buildPhpSymbolIndex(parsedFiles);
  const artifacts: JsTsFileArtifacts[] = [];

  for (const filePath of options.filesToIndex.map(toPosixPath)) {
    const parsedFile = parsedFiles.find((entry) => entry.filePath === filePath);
    if (!parsedFile) {
      continue;
    }

    const owningPackage = findOwningPackage(
      filePath,
      options.inspection.packages,
    );
    const owningUnit = findOwningUnit(filePath, options.inspection.units);
    const matchedPluginIds = new Set(
      owningUnit?.pluginMatches
        .filter((match) => match.kind === "framework-plugin" && match.matched)
        .map((match) => match.pluginId) ?? [],
    );
    let symbols = extractPhpSymbols(parsedFile.program, filePath);
    const routes =
      matchedPluginIds.has("framework:laravel") && isLaravelRouteFile(filePath)
        ? extractLaravelRoutes({
            filePath,
            sourceText: parsedFile.sourceText,
            unitId: owningUnit?.id ?? "unit:root",
            symbolIndex,
          })
        : [];
    const { importEdges, symbolEdges } = extractPhpReferences({
      filePath,
      program: parsedFile.program,
      symbolIndex,
    });
    const extraSymbolEdges = [...symbolEdges, ...extractLaravelFlow(routes)];

    if (matchedPluginIds.has("framework:crudbooster")) {
      const crudbooster = extractCrudBoosterModules({
        filePath,
        sourceText: parsedFile.sourceText,
        symbols,
        symbolIndex,
      });
      symbols = crudbooster.symbols;
      extraSymbolEdges.push(...extractCrudBoosterFlow(crudbooster.modules));
    }

    artifacts.push({
      file: {
        id: `file:${filePath}`,
        path: filePath,
        packageId: owningPackage?.id ?? "package:root",
        unitId: owningUnit?.id ?? "unit:root",
        hash: parsedFile.hash,
      },
      importEdges,
      symbols,
      routes,
      queryEdges: extractPhpQueryHints(
        parsedFile.sourceText,
        filePath,
        owningUnit?.id ?? "unit:root",
        symbols,
      ),
      symbolEdges: extraSymbolEdges,
    });
  }

  return artifacts;
}

function findOwningPackage(
  filePath: string,
  packages: AnalyzeJsTsWorkspaceOptions["inspection"]["packages"],
) {
  return packages
    .filter(
      (entry) =>
        entry.rootPath === "." ||
        filePath.startsWith(`${entry.rootPath}/`) ||
        filePath === entry.rootPath,
    )
    .sort((left, right) => right.rootPath.length - left.rootPath.length)[0];
}

function findOwningUnit(
  filePath: string,
  units: AnalyzeJsTsWorkspaceOptions["inspection"]["units"],
) {
  return units
    .filter(
      (unit) =>
        unit.indexingMode === "full" &&
        (unit.rootPath === "." ||
          filePath === unit.rootPath ||
          filePath.startsWith(`${unit.rootPath}/`)),
    )
    .sort((left, right) => right.rootPath.length - left.rootPath.length)[0];
}

function isLaravelRouteFile(filePath: string): boolean {
  return filePath.includes("/routes/") || filePath.startsWith("routes/");
}
