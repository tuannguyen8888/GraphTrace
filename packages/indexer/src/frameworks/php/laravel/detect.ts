export function detectLaravelFramework(options: {
  rootPath: string;
  deps: Record<string, string>;
  markerPaths: Set<string>;
  sourceFiles: string[];
}): boolean {
  const joinWithinRoot = (target: string) =>
    options.rootPath === "." ? target : `${options.rootPath}/${target}`;
  const hasLaravelDependency =
    Boolean(options.deps["laravel/framework"]) ||
    Boolean(options.deps["illuminate/support"]) ||
    Boolean(options.deps["illuminate/routing"]);
  const hasArtisan = options.markerPaths.has(joinWithinRoot("artisan"));
  const hasBootstrap = options.sourceFiles.includes(
    joinWithinRoot("bootstrap/app.php"),
  );
  const hasRoutes = options.sourceFiles.some(
    (filePath) =>
      filePath === joinWithinRoot("routes/web.php") ||
      filePath === joinWithinRoot("routes/api.php") ||
      filePath.startsWith(`${joinWithinRoot("routes")}/`),
  );
  const hasControllers = options.sourceFiles.some((filePath) =>
    filePath.startsWith(`${joinWithinRoot("app/Http/Controllers")}/`),
  );

  const strongSignals = [
    hasArtisan,
    hasBootstrap,
    hasRoutes,
    hasControllers,
  ].filter(Boolean).length;

  return (hasLaravelDependency && strongSignals >= 2) || strongSignals >= 3;
}
