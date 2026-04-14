import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";

import fg from "fast-glob";

import type {
  DiscoveredUnit,
  GraphTraceConfig,
  PluginMatch,
  UnitKind,
  UnitLanguage,
} from "@graphtrace/shared";
import { toPosixPath } from "@graphtrace/shared";
import { detectCrudBoosterFramework } from "./frameworks/php/crudbooster/detect";
import { detectLaravelFramework } from "./frameworks/php/laravel/detect";

const INTERNAL_PLUGIN_VERSION = "internal";
const IGNORED_GLOBS = [
  "**/node_modules/**",
  "**/.graphtrace/**",
  "**/.git/**",
  "**/.worktrees/**",
  "**/dist/**",
  "**/.next/**",
  "**/coverage/**",
];
const SOURCE_GLOB = "**/*.{ts,tsx,js,jsx,php}";
const PROJECT_MARKER_GLOBS = [
  "package.json",
  "**/package.json",
  "tsconfig.json",
  "**/tsconfig.json",
  "tsconfig.base.json",
  "**/tsconfig.base.json",
  "jsconfig.json",
  "**/jsconfig.json",
  "pnpm-workspace.yaml",
  "next.config.*",
  "**/next.config.*",
  "nest-cli.json",
  "**/nest-cli.json",
  "schema.prisma",
  "**/schema.prisma",
  "pyproject.toml",
  "**/pyproject.toml",
  "go.mod",
  "**/go.mod",
  "Cargo.toml",
  "**/Cargo.toml",
  "pom.xml",
  "**/pom.xml",
  "composer.json",
  "**/composer.json",
  "artisan",
  "**/artisan",
  "requirements.txt",
  "**/requirements.txt",
  "*.sln",
  "**/*.sln",
];

interface PackageManifest {
  name?: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  require?: Record<string, string>;
  "require-dev"?: Record<string, string>;
}

interface CandidateUnit {
  rootPath: string;
  displayName: string;
  kind: UnitKind;
  language: UnitLanguage;
  tooling: string;
  confidence: number;
  indexingMode: "full" | "shallow";
  signals: string[];
  sourceRoots: string[];
  packageName?: string;
  packageManifest?: PackageManifest;
  frameworkHints: string[];
  markerPaths: Set<string>;
  sourceFiles: string[];
}

function isJsSourceFile(filePath: string): boolean {
  return /\.(ts|tsx|js|jsx)$/.test(filePath);
}

function isPhpSourceFile(filePath: string): boolean {
  return filePath.endsWith(".php");
}

export interface WorkspacePackageInfo {
  id: string;
  name: string;
  rootPath: string;
  unitId: string;
}

export interface WorkspaceInspection {
  units: DiscoveredUnit[];
  packages: WorkspacePackageInfo[];
  unitFiles: Map<string, string[]>;
}

export async function inspectWorkspace(
  workspaceRoot: string,
  config: GraphTraceConfig,
): Promise<WorkspaceInspection> {
  const [projectMarkers, sourceFiles] = await Promise.all([
    fg(PROJECT_MARKER_GLOBS, {
      cwd: workspaceRoot,
      onlyFiles: true,
      unique: true,
      deep: config.detection.maxDepth,
      ignore: [...config.exclude, ...IGNORED_GLOBS],
    }),
    fg(SOURCE_GLOB, {
      cwd: workspaceRoot,
      onlyFiles: true,
      ignore: [...config.exclude, ...IGNORED_GLOBS],
    }),
  ]);

  const candidateRoots = new Set<string>(["."]);
  for (const marker of projectMarkers) {
    candidateRoots.add(normalizeRootPath(posix.dirname(toPosixPath(marker))));
  }

  const manifests = new Map<string, PackageManifest>();
  for (const marker of projectMarkers.filter(
    (path) => path.endsWith("package.json") || path.endsWith("composer.json"),
  )) {
    const rootPath = normalizeRootPath(posix.dirname(toPosixPath(marker)));
    manifests.set(rootPath, {
      ...manifests.get(rootPath),
      ...(await readPackageManifest(join(workspaceRoot, marker))),
    });
  }

  const candidates = await Promise.all(
    [...candidateRoots]
      .sort((left, right) => left.localeCompare(right))
      .map(async (rootPath) =>
        buildCandidate({
          workspaceRoot,
          rootPath,
          config,
          projectMarkers: projectMarkers.map(toPosixPath),
          sourceFiles: sourceFiles.map(toPosixPath),
          manifest: manifests.get(rootPath),
        }),
      ),
  );

  const selectedCandidates = selectCandidates(candidates, config);
  const fullUnitRoots = selectedCandidates
    .filter((candidate) => candidate.indexingMode === "full")
    .map((candidate) => candidate.rootPath);

  const unitFiles = new Map<string, string[]>();
  const units: DiscoveredUnit[] = [];
  for (const candidate of selectedCandidates) {
    const unitId = buildUnitId(candidate.rootPath);
    const sourceFilesForUnit =
      candidate.indexingMode === "full" && candidate.language !== "unknown"
        ? candidate.sourceFiles.filter(
            (filePath) =>
              !fullUnitRoots.some(
                (otherRoot) =>
                  otherRoot !== candidate.rootPath &&
                  pathIsWithin(filePath, otherRoot) &&
                  pathIsWithin(otherRoot, candidate.rootPath),
              ),
          )
        : [];
    unitFiles.set(unitId, sourceFilesForUnit);

    const pluginMatches = buildPluginMatches(candidate, sourceFilesForUnit);
    units.push({
      id: unitId,
      rootPath: candidate.rootPath,
      displayName: candidate.displayName,
      kind: candidate.kind,
      language: candidate.language,
      tooling: candidate.tooling,
      indexingMode: candidate.indexingMode,
      confidence: candidate.confidence,
      signals: candidate.signals,
      sourceRoots: candidate.sourceRoots,
      parentUnitId: findParentUnitId(candidate.rootPath, selectedCandidates),
      pluginMatches,
    });
  }

  const packages = selectedCandidates
    .filter((candidate) => candidate.packageManifest)
    .map((candidate) => ({
      id: `package:${candidate.rootPath}`,
      name:
        candidate.packageManifest?.name ??
        candidate.packageName ??
        candidate.rootPath,
      rootPath: candidate.rootPath,
      unitId: buildUnitId(candidate.rootPath),
    }));

  return {
    units: units.sort((left, right) =>
      compareRootPaths(left.rootPath, right.rootPath),
    ),
    packages,
    unitFiles,
  };
}

async function buildCandidate(options: {
  workspaceRoot: string;
  rootPath: string;
  config: GraphTraceConfig;
  projectMarkers: string[];
  sourceFiles: string[];
  manifest?: PackageManifest;
}): Promise<CandidateUnit> {
  const { rootPath, projectMarkers, sourceFiles, manifest } = options;
  const markerPaths = new Set(
    projectMarkers.filter((marker) => pathIsWithin(marker, rootPath)),
  );
  const candidateSourceFiles = sourceFiles.filter((filePath) =>
    pathIsWithin(filePath, rootPath),
  );
  const jsSourceFiles = candidateSourceFiles.filter(isJsSourceFile);
  const phpSourceFiles = candidateSourceFiles.filter(isPhpSourceFile);
  const sourceSamples = (
    await Promise.all(
      jsSourceFiles.slice(0, 12).map(async (filePath) => ({
        filePath,
        sourceText: await readFile(
          join(options.workspaceRoot, filePath),
          "utf8",
        ),
      })),
    )
  ).map((entry) => ({
    filePath: entry.filePath,
    sourceText: entry.sourceText,
  }));
  const phpSourceSamples = (
    await Promise.all(
      phpSourceFiles.slice(0, 12).map(async (filePath) => ({
        filePath,
        sourceText: await readFile(
          join(options.workspaceRoot, filePath),
          "utf8",
        ),
      })),
    )
  ).map((entry) => ({
    filePath: entry.filePath,
    sourceText: entry.sourceText,
  }));
  const hasPackageJson = markerPaths.has(
    joinWithinRoot(rootPath, "package.json"),
  );
  const hasTsConfig =
    markerPaths.has(joinWithinRoot(rootPath, "tsconfig.json")) ||
    markerPaths.has(joinWithinRoot(rootPath, "tsconfig.base.json")) ||
    markerPaths.has(joinWithinRoot(rootPath, "jsconfig.json"));
  const hasWorkspaceManifest = markerPaths.has("pnpm-workspace.yaml");
  const hasNextConfig = [...markerPaths].some(
    (path) =>
      path.endsWith("next.config.js") || path.endsWith("next.config.mjs"),
  );
  const hasNestConfig = markerPaths.has(
    joinWithinRoot(rootPath, "nest-cli.json"),
  );
  const hasPrismaSchema = [...markerPaths].some((path) =>
    path.endsWith("schema.prisma"),
  );
  const frameworkHints = detectFrameworkHints(sourceSamples);
  const hasComposerJson = markerPaths.has(
    joinWithinRoot(rootPath, "composer.json"),
  );
  const hasArtisan = markerPaths.has(joinWithinRoot(rootPath, "artisan"));
  const hasLaravelBootstrap = candidateSourceFiles.includes(
    joinWithinRoot(rootPath, "bootstrap/app.php"),
  );
  const hasLaravelRoutes = candidateSourceFiles.some((filePath) =>
    pathIsWithin(filePath, joinWithinRoot(rootPath, "routes")),
  );
  const hasLaravelControllers = candidateSourceFiles.some((filePath) =>
    pathIsWithin(filePath, joinWithinRoot(rootPath, "app/Http/Controllers")),
  );
  const phpFrameworkSamples = phpSourceSamples.filter(
    (sample) =>
      pathIsWithin(sample.filePath, joinWithinRoot(rootPath, "app")) ||
      pathIsWithin(sample.filePath, joinWithinRoot(rootPath, "routes")),
  );
  const manifestDeps = {
    ...manifest?.dependencies,
    ...manifest?.devDependencies,
    ...manifest?.require,
    ...manifest?.["require-dev"],
  };
  const hasCrudBoosterDependency = Object.keys(manifestDeps).some((name) =>
    name.toLowerCase().includes("crudbooster"),
  );
  const hasCrudBoosterController = phpFrameworkSamples.some((sample) =>
    /extends\s+CBController\b/.test(sample.sourceText),
  );
  const hasCrudBoosterInit = phpFrameworkSamples.some((sample) =>
    /\bfunction\s+cbInit\s*\(/.test(sample.sourceText),
  );
  const hasCrudBoosterAdminController = phpSourceFiles.some((filePath) => {
    if (
      !pathIsWithin(filePath, joinWithinRoot(rootPath, "app/Http/Controllers"))
    ) {
      return false;
    }

    const relative =
      rootPath === "." ? filePath : filePath.slice(rootPath.length + 1);
    return /app\/Http\/Controllers\/.*Admin.*Controller\.php$/.test(relative);
  });
  const nonJsMarkers = [...markerPaths].filter((path) =>
    /(?:pyproject\.toml|go\.mod|Cargo\.toml|pom\.xml|composer\.json|requirements\.txt|\.sln)$/.test(
      path,
    ),
  );

  const sourceRoots = discoverSourceRoots(rootPath, candidateSourceFiles);
  const score =
    (hasPackageJson ? 50 : 0) +
    (hasComposerJson ? 50 : 0) +
    (hasTsConfig ? 20 : 0) +
    (candidateSourceFiles.length > 0 ? 40 : 0) +
    (hasWorkspaceManifest ? 25 : 0) +
    (hasNextConfig || hasNestConfig || hasPrismaSchema ? 15 : 0) +
    (rootPath === "." && candidateSourceFiles.length > 0 ? 10 : 0);

  const jsSignal =
    hasPackageJson ||
    hasTsConfig ||
    jsSourceFiles.length > 0 ||
    hasNextConfig ||
    hasNestConfig ||
    hasPrismaSchema;
  const phpSignal = hasComposerJson || phpSourceFiles.length > 0;
  const language: UnitLanguage =
    jsSignal && !phpSignal
      ? "js-ts"
      : phpSignal && !jsSignal
        ? "php"
        : "unknown";

  const signals = [
    ...(hasPackageJson ? ["package.json"] : []),
    ...(hasComposerJson ? ["composer.json"] : []),
    ...(hasTsConfig ? ["tsconfig/jsconfig"] : []),
    ...(candidateSourceFiles.length > 0
      ? [`source:${candidateSourceFiles.length}`]
      : []),
    ...(hasWorkspaceManifest ? ["pnpm-workspace"] : []),
    ...(hasNextConfig ? ["next-config"] : []),
    ...(hasNestConfig ? ["nest-config"] : []),
    ...(hasPrismaSchema ? ["prisma-schema"] : []),
    ...(hasArtisan ? ["laravel-artisan"] : []),
    ...(hasLaravelBootstrap ? ["laravel-bootstrap"] : []),
    ...(hasLaravelRoutes ? ["laravel-routes"] : []),
    ...(hasLaravelControllers ? ["laravel-controllers"] : []),
    ...(hasCrudBoosterDependency ? ["crudbooster-dependency"] : []),
    ...(hasCrudBoosterController ? ["crudbooster-cbcontroller"] : []),
    ...(hasCrudBoosterInit ? ["crudbooster-cbinit"] : []),
    ...(hasCrudBoosterAdminController ? ["crudbooster-admin-controller"] : []),
    ...frameworkHints.map((hint) => `hint:${hint}`),
    ...nonJsMarkers.map((marker) => `marker:${posix.basename(marker)}`),
  ];

  const indexingMode =
    language !== "unknown" &&
    score >= options.config.detection.minUnitConfidence
      ? "full"
      : "shallow";

  return {
    rootPath,
    displayName:
      manifest?.name ??
      (rootPath === "." ? "project-root" : posix.basename(rootPath)),
    kind: classifyUnitKind(rootPath),
    language,
    tooling: detectTooling(markerPaths),
    confidence: Math.min(
      100,
      Math.max(score, nonJsMarkers.length > 0 ? 60 : 10),
    ),
    indexingMode,
    signals,
    sourceRoots,
    packageName: manifest?.name,
    packageManifest: manifest,
    frameworkHints,
    markerPaths,
    sourceFiles: candidateSourceFiles,
  };
}

function selectCandidates(
  candidates: CandidateUnit[],
  config: GraphTraceConfig,
): CandidateUnit[] {
  const threshold = config.detection.minUnitConfidence;
  const strongRoots = candidates
    .filter(
      (candidate) =>
        candidate.language !== "unknown" && candidate.confidence >= threshold,
    )
    .map((candidate) => candidate.rootPath);

  return candidates
    .filter((candidate) => {
      if (candidate.rootPath === ".") {
        return true;
      }

      if (candidate.language === "unknown") {
        return true;
      }

      return candidate.confidence >= threshold;
    })
    .map((candidate): CandidateUnit => {
      if (candidate.language === "unknown") {
        return candidate;
      }

      const hasChildStrongUnit = strongRoots.some(
        (rootPath) =>
          rootPath !== candidate.rootPath &&
          pathIsWithin(rootPath, candidate.rootPath),
      );
      if (
        hasChildStrongUnit &&
        !hasDirectSource(candidate.rootPath, candidate.sourceFiles)
      ) {
        return {
          ...candidate,
          indexingMode: "shallow" as const,
        };
      }

      return candidate;
    })
    .sort((left, right) => compareRootPaths(left.rootPath, right.rootPath));
}

function hasDirectSource(rootPath: string, sourceFiles: string[]): boolean {
  return (
    sourceFiles.some((filePath) => {
      const relative =
        rootPath === "." ? filePath : filePath.slice(rootPath.length + 1);
      return !relative.includes("/");
    }) ||
    sourceFiles.some((filePath) => {
      const relative =
        rootPath === "." ? filePath : filePath.slice(rootPath.length + 1);
      return relative.startsWith("src/") || relative.startsWith("app/");
    })
  );
}

function discoverSourceRoots(
  rootPath: string,
  sourceFiles: string[],
): string[] {
  const roots = new Set<string>();

  for (const filePath of sourceFiles) {
    const relative =
      rootPath === "." ? filePath : filePath.slice(rootPath.length + 1);
    const [firstSegment] = relative.split("/");
    if (!firstSegment || !relative.includes("/")) {
      roots.add(rootPath);
      continue;
    }

    roots.add(normalizeRootPath(joinWithinRoot(rootPath, firstSegment)));
  }

  return [...roots].sort(compareRootPaths);
}

function buildPluginMatches(
  candidate: CandidateUnit,
  sourceFiles: string[],
): PluginMatch[] {
  const matches: PluginMatch[] = [
    {
      pluginId: "workspace-detector:auto",
      pluginVersion: INTERNAL_PLUGIN_VERSION,
      kind: "workspace-detector",
      matched: true,
      confidence: candidate.confidence / 100,
      reasons: candidate.signals,
    },
  ];

  if (candidate.language === "js-ts") {
    matches.push({
      pluginId: "language:js-ts",
      pluginVersion: INTERNAL_PLUGIN_VERSION,
      kind: "language-plugin",
      matched: candidate.indexingMode === "full",
      confidence: candidate.indexingMode === "full" ? 0.95 : 0.6,
      reasons: [`source-files:${sourceFiles.length}`],
    });
  }

  if (candidate.language === "php") {
    matches.push({
      pluginId: "language:php",
      pluginVersion: INTERNAL_PLUGIN_VERSION,
      kind: "language-plugin",
      matched: candidate.indexingMode === "full",
      confidence: candidate.indexingMode === "full" ? 0.95 : 0.6,
      reasons:
        candidate.indexingMode === "full"
          ? [`source-files:${sourceFiles.length}`]
          : [`source-files:${sourceFiles.length}`, "pending-deep-indexing"],
    });
  }

  for (const framework of detectFrameworks(candidate)) {
    matches.push({
      pluginId: `framework:${framework}`,
      pluginVersion: INTERNAL_PLUGIN_VERSION,
      kind: "framework-plugin",
      matched: true,
      confidence: 0.9,
      reasons: candidate.signals.filter((signal) =>
        framework === "next"
          ? signal.includes("next")
          : framework === "nest"
            ? signal.includes("nest")
            : framework === "prisma"
              ? signal.includes("prisma")
              : framework === "laravel"
                ? signal.includes("laravel")
                : framework === "crudbooster"
                  ? signal.includes("crudbooster")
                  : true,
      ),
    });
  }

  return matches;
}

function detectFrameworks(candidate: CandidateUnit): string[] {
  const deps = {
    ...candidate.packageManifest?.dependencies,
    ...candidate.packageManifest?.devDependencies,
    ...candidate.packageManifest?.require,
    ...candidate.packageManifest?.["require-dev"],
  };
  const allowHintOnlyMatch =
    candidate.kind === "app" || candidate.kind === "service";
  const hasSignal = (signal: string) => candidate.signals.includes(signal);

  const frameworks = new Set<string>();
  if (deps.express) {
    frameworks.add("express");
  }
  if (
    deps.fastify ||
    Object.keys(deps).some((name) => name.startsWith("@fastify/"))
  ) {
    frameworks.add("fastify");
  }
  if (deps.next || hasSignal("next-config")) {
    frameworks.add("next");
  }
  if (
    deps["@nestjs/common"] ||
    deps["@nestjs/core"] ||
    hasSignal("nest-config") ||
    (allowHintOnlyMatch && candidate.frameworkHints.includes("nest"))
  ) {
    frameworks.add("nest");
  }
  if (allowHintOnlyMatch && candidate.frameworkHints.includes("express")) {
    frameworks.add("express");
  }
  if (allowHintOnlyMatch && candidate.frameworkHints.includes("fastify")) {
    frameworks.add("fastify");
  }
  if (allowHintOnlyMatch && candidate.frameworkHints.includes("next")) {
    frameworks.add("next");
  }
  if (
    deps.prisma ||
    deps["@prisma/client"] ||
    hasSignal("prisma-schema") ||
    (allowHintOnlyMatch && candidate.frameworkHints.includes("prisma"))
  ) {
    frameworks.add("prisma");
  }
  if (
    deps["drizzle-orm"] ||
    (allowHintOnlyMatch && candidate.frameworkHints.includes("drizzle"))
  ) {
    frameworks.add("drizzle");
  }
  if (
    candidate.language === "php" &&
    detectLaravelFramework({
      rootPath: candidate.rootPath,
      deps,
      markerPaths: candidate.markerPaths,
      sourceFiles: candidate.sourceFiles,
    })
  ) {
    frameworks.add("laravel");
  }
  if (
    candidate.language === "php" &&
    frameworks.has("laravel") &&
    detectCrudBoosterFramework({
      deps,
      signals: candidate.signals,
    })
  ) {
    frameworks.add("crudbooster");
  }

  return [...frameworks];
}

function readPackageName(path: string): string {
  return posix.basename(path);
}

async function readPackageManifest(path: string): Promise<PackageManifest> {
  return JSON.parse(await readFile(path, "utf8")) as PackageManifest;
}

function classifyUnitKind(rootPath: string): UnitKind {
  const basename = rootPath === "." ? "." : posix.basename(rootPath);
  if (rootPath === ".") {
    return "project";
  }
  if (
    basename === "apps" ||
    rootPath.startsWith("apps/") ||
    rootPath.includes("/apps/")
  ) {
    return "app";
  }
  if (
    basename === "services" ||
    rootPath.startsWith("services/") ||
    rootPath.includes("/services/")
  ) {
    return "service";
  }
  if (
    basename === "packages" ||
    rootPath.startsWith("packages/") ||
    rootPath.includes("/packages/")
  ) {
    return "package";
  }
  return "subproject";
}

function detectTooling(markerPaths: Set<string>): string {
  if (markerPaths.has("pnpm-workspace.yaml")) {
    return "pnpm";
  }
  if ([...markerPaths].some((path) => path.endsWith("package.json"))) {
    return "node";
  }
  if ([...markerPaths].some((path) => path.endsWith("pyproject.toml"))) {
    return "python";
  }
  if ([...markerPaths].some((path) => path.endsWith("composer.json"))) {
    return "php";
  }
  return "unknown";
}

function buildUnitId(rootPath: string): string {
  return rootPath === "." ? "unit:root" : `unit:${rootPath}`;
}

function findParentUnitId(
  rootPath: string,
  candidates: CandidateUnit[],
): string | undefined {
  if (rootPath === ".") {
    return undefined;
  }

  const parent = candidates
    .map((candidate) => candidate.rootPath)
    .filter(
      (candidateRoot) =>
        candidateRoot !== rootPath && pathIsWithin(rootPath, candidateRoot),
    )
    .sort((left, right) => right.length - left.length)[0];

  return parent ? buildUnitId(parent) : buildUnitId(".");
}

function joinWithinRoot(rootPath: string, target: string): string {
  return rootPath === "." ? target : `${rootPath}/${target}`;
}

function normalizeRootPath(rootPath: string): string {
  const normalized = toPosixPath(rootPath)
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "");
  return normalized === "" || normalized === "." ? "." : normalized;
}

function pathIsWithin(targetPath: string, rootPath: string): boolean {
  if (rootPath === ".") {
    return true;
  }

  return targetPath === rootPath || targetPath.startsWith(`${rootPath}/`);
}

function compareRootPaths(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  if (left === ".") {
    return -1;
  }
  if (right === ".") {
    return 1;
  }
  return left.localeCompare(right);
}

function detectFrameworkHints(
  sourceSamples: Array<{ filePath: string; sourceText: string }>,
): string[] {
  const hints = new Set<string>();

  for (const sample of sourceSamples) {
    if (
      sample.sourceText.includes('from "express"') ||
      sample.sourceText.includes("Router()") ||
      sample.sourceText.includes("express()")
    ) {
      hints.add("express");
    }
    if (
      sample.sourceText.includes('from "fastify"') ||
      sample.sourceText.includes("fastify.get(") ||
      sample.sourceText.includes("fastify.route(")
    ) {
      hints.add("fastify");
    }
    if (
      sample.sourceText.includes("@Controller(") ||
      sample.sourceText.includes("@Get(") ||
      sample.sourceText.includes("@Post(")
    ) {
      hints.add("nest");
    }
    if (
      sample.sourceText.includes('from "next/server"') ||
      sample.filePath.includes("/app/api/") ||
      sample.filePath.endsWith("/route.ts")
    ) {
      hints.add("next");
    }
    if (sample.sourceText.includes("prisma.")) {
      hints.add("prisma");
    }
    if (sample.sourceText.includes("db.select().from(")) {
      hints.add("drizzle");
    }
  }

  return [...hints];
}
