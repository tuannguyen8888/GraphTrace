import { type Locale, getMessages } from "./i18n";
import type {
  PackageSummary,
  RouteSummary,
  SearchQuickPick,
  SearchResult,
  SearchWorkbenchGuidance,
} from "./view-model";
import { findOwningPackage } from "./view-model";

interface WorkspaceSupportingPanelsProps {
  locale: Locale;
  variant: "full" | "secondary";
  searchText: string;
  onSearchTextChange: (value: string) => void;
  searchKind: string;
  onSearchKindChange: (value: string) => void;
  searchWorkbench: SearchWorkbenchGuidance;
  visibleSearchResults: SearchResult[];
  selectedSearchResultId: string;
  onSelectQuickPick: (pick: SearchQuickPick) => void;
  onSelectSearchResult: (item: SearchResult) => void;
  packages: PackageSummary[];
  visibleRoutes: RouteSummary[];
  selectedRouteId: string;
  onSelectRoute: (route: RouteSummary) => void;
}

export function WorkspaceSupportingPanels(
  props: WorkspaceSupportingPanelsProps,
) {
  const messages = getMessages(props.locale);

  return (
    <section
      className={
        props.variant === "secondary"
          ? "workspace-supporting-panels is-secondary"
          : "workspace-supporting-panels"
      }
    >
      <article className="panel workspace-supporting-panel">
        <div className="panel-heading">
          <span className="panel-kicker">
            {messages.app.searchResultsKicker}
          </span>
          <h2>{messages.app.workbenchTitle}</h2>
          <p>{messages.app.workbenchDescription}</p>
        </div>

        <div className="control-row">
          <label className="field grow">
            <span>{messages.app.queryLabel}</span>
            <input
              value={props.searchText}
              onChange={(event) => props.onSearchTextChange(event.target.value)}
              placeholder="runCli, packages/server, /api/impact..."
            />
          </label>
          <label className="field">
            <span>{messages.app.kindLabel}</span>
            <select
              value={props.searchKind}
              onChange={(event) => props.onSearchKindChange(event.target.value)}
            >
              <option value="symbol">symbol</option>
              <option value="route">route</option>
              <option value="file">file</option>
              <option value="package">package</option>
            </select>
          </label>
        </div>

        <section className="search-guidance">
          <div className="search-guidance-card">
            <span className="panel-kicker">
              {messages.app.guidedTriageKicker}
            </span>
            <h3>{props.searchWorkbench.emptyStateTitle}</h3>
            <p>{props.searchWorkbench.emptyStateBody}</p>
          </div>

          <div className="search-kind-guide">
            <strong>{props.searchKind}</strong>
            <span>{props.searchWorkbench.kindGuide}</span>
          </div>

          <div className="quick-pick-grid">
            {props.searchWorkbench.quickPicks.map((pick) => (
              <button
                key={pick.id}
                className="quick-pick"
                type="button"
                onClick={() => props.onSelectQuickPick(pick)}
              >
                <span className="list-chip">{pick.kind}</span>
                <span className="list-title">{pick.label}</span>
                <span className="list-meta">{pick.query}</span>
                <span className="list-subtle">{pick.reason}</span>
              </button>
            ))}
          </div>

          <ol className="triage-steps">
            {props.searchWorkbench.triageSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <ul className="stack-list results-list">
          {props.visibleSearchResults.length === 0 ? (
            <li className="empty-state">
              {props.searchText.trim()
                ? messages.app.noSearchMatches({
                    searchKind: props.searchKind,
                    searchText: props.searchText,
                  })
                : messages.app.idleSearchPrompt}
            </li>
          ) : (
            props.visibleSearchResults.map((item) => {
              const owningPackage = findOwningPackage(
                item.path,
                props.packages,
              );
              return (
                <li key={`${item.kind}:${item.id}`}>
                  <button
                    className={
                      props.selectedSearchResultId === item.id
                        ? "list-item is-active"
                        : "list-item"
                    }
                    type="button"
                    onClick={() => props.onSelectSearchResult(item)}
                  >
                    <span className="list-chip">{item.kind}</span>
                    <span className="list-title">{item.label}</span>
                    <span className="list-meta">
                      {item.path ?? `score ${item.score ?? 0}`}
                    </span>
                    {owningPackage?.label ? (
                      <span className="list-subtle">
                        {owningPackage.label} · {owningPackage.path}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </article>

      <article className="panel workspace-supporting-panel">
        <div className="panel-heading">
          <span className="panel-kicker">
            {messages.app.routeExplorerKicker}
          </span>
          <h2>{messages.app.httpSurfaceTitle}</h2>
          <p>{messages.app.routeExplorerDescription}</p>
        </div>

        <ul className="stack-list results-list">
          {props.visibleRoutes.length === 0 ? (
            <li className="empty-state">{messages.app.noRoutesInScope}</li>
          ) : (
            props.visibleRoutes.map((route) => {
              const owningPackage = findOwningPackage(
                route.filePath,
                props.packages,
              );
              return (
                <li key={route.id}>
                  <button
                    className={
                      props.selectedRouteId === route.id
                        ? "list-item is-active route-item"
                        : "list-item route-item"
                    }
                    type="button"
                    onClick={() => props.onSelectRoute(route)}
                  >
                    <span className="route-line">
                      <span className="method-chip">{route.method}</span>
                      <span className="route-path">{route.path}</span>
                    </span>
                    <span className="route-meta-line">
                      <span>{route.framework}</span>
                      <span>
                        {formatConfidence(props.locale, route.confidence)}
                      </span>
                      <span>
                        {owningPackage?.label ?? messages.app.unmappedPackage}
                      </span>
                    </span>
                    <span className="list-meta">{route.filePath}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </article>
    </section>
  );
}

function formatConfidence(locale: Locale, value?: number) {
  if (typeof value !== "number") {
    return "n/a";
  }

  return getMessages(locale).app.confidence({
    value: Math.round(value * 100),
  });
}
