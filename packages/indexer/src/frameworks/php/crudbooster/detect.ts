export function detectCrudBoosterFramework(options: {
  deps: Record<string, string>;
  signals: string[];
}): boolean {
  const dependencySignals = Object.keys(options.deps).some((name) =>
    name.toLowerCase().includes("crudbooster"),
  );
  const conventionSignals = [
    options.signals.includes("crudbooster-cbcontroller"),
    options.signals.includes("crudbooster-cbinit"),
    options.signals.includes("crudbooster-admin-controller"),
  ].filter(Boolean).length;

  return (
    (dependencySignals && conventionSignals >= 1) || conventionSignals >= 3
  );
}
