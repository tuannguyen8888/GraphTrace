import type {
  GraphEnvelopeSummary,
  RepositorySummary,
} from "@graphtrace/shared";

import type {
  ArchitectureGraphModel,
  ArchitectureGraphNode,
  GraphEdgeFilters,
  PositionedArchitectureGraphNode,
} from "./architecture-graph";
import { GraphWorkspace } from "./graph-workspace";
import type { WorkspaceHomeSummary } from "./home-view-model";
import {
  type Locale,
  SUPPORTED_LOCALES,
  getMessages,
  resolveLocale,
} from "./i18n";
import { StarterGuide } from "./starter-guide";
import { SymbolGraphControls } from "./symbol-graph-controls";
import { SymbolGraphInspector } from "./symbol-graph-inspector";
import type {
  SymbolGraphActionId,
  SymbolGraphConfidenceFilter,
  SymbolGraphInspectorSection,
  SymbolGraphMode,
} from "./symbol-graph-types";
import type {
  GraphItem,
  PackageSummary,
  RouteSummary,
  ScopeMode,
  WorkspaceStarterAction,
  WorkspaceStarterGuide,
  WorkspaceStatus,
} from "./view-model";
import { buildGraphTraceCommand } from "./view-model";
import type {
  WorkspaceInspectorState,
  WorkspacePresentationState,
} from "./workspace-focus-view-model";
import {
  type SidebarPackageEntry,
  type SidebarScopeOption,
  WorkspaceSidebar,
} from "./workspace-sidebar";
import { WorkspaceSupportingPanels } from "./workspace-supporting-panels";

interface WorkspaceScreenProps {
  locale: Locale;
  workspaceError: string;
  presentationState: WorkspacePresentationState;
  header: {
    selectedWorkspace: WorkspaceHomeSummary | null;
    repositories: RepositorySummary[];
    selectedRepositoryId: string;
    onOpenWorkspaceList: () => void;
    onLocaleChange: (value: Locale) => void;
    onRepositoryChange: (repositoryId: string) => void;
    onRefreshGraph: () => void;
    currentWorkspaceLabel: string;
    lastIndexLabel: string;
  };
  sidebar: {
    status: WorkspaceStatus | null;
    selectedRepository: RepositorySummary | null;
    scopeOptions: SidebarScopeOption[];
    scopeMode: ScopeMode;
    onScopeModeChange: (mode: ScopeMode) => void;
    selectedPackageId: string;
    onSelectPackage: (packageId: string) => void;
    onTogglePackage: (packageId: string) => void;
    packageEntries: SidebarPackageEntry[];
  };
  graphPanel: {
    isSymbolInspector: boolean;
    edgeFilters: GraphEdgeFilters;
    onToggleEdgeFilter: (key: keyof GraphEdgeFilters) => void;
    graph: ArchitectureGraphModel;
    nodes: PositionedArchitectureGraphNode[];
    starterGuide: WorkspaceStarterGuide;
    onSelectNode: (node: ArchitectureGraphNode) => void;
    onRunStarterAction: (action: WorkspaceStarterAction) => void;
    symbolControls?: {
      mode: SymbolGraphMode;
      confidenceFilter: SymbolGraphConfidenceFilter;
      confidenceSummary?: GraphEnvelopeSummary;
      symbolLabel: string;
      onModeChange: (mode: SymbolGraphMode) => void;
      onConfidenceFilterChange: (filter: SymbolGraphConfidenceFilter) => void;
      onAction: (actionId: SymbolGraphActionId) => void;
    };
  };
  supportingPanels: {
    variant: "full" | "secondary";
    searchText: string;
    onSearchTextChange: (value: string) => void;
    searchKind: string;
    onSearchKindChange: (value: string) => void;
    searchWorkbench: import("./view-model").SearchWorkbenchGuidance;
    visibleSearchResults: import("./view-model").SearchResult[];
    selectedSearchResultId: string;
    onSelectQuickPick: (pick: import("./view-model").SearchQuickPick) => void;
    onSelectSearchResult: (item: import("./view-model").SearchResult) => void;
    packages: PackageSummary[];
    visibleRoutes: RouteSummary[];
    selectedRouteId: string;
    onSelectRoute: (route: RouteSummary) => void;
  };
  inspectorPanel: {
    inspector: WorkspaceInspectorState;
    selectedTitle: string;
    selectedSummary: string;
    selectedPackage: PackageSummary | null;
    selectedPath?: string;
    selectedCommand: string;
    selectedFileHref: string;
    actionFeedback: string;
    onActionFeedbackChange: (message: string) => void;
    onRerunSearch: () => void;
    detailLoading: boolean;
    detailError: string;
    isSymbolInspector: boolean;
    symbolInspectorSections: SymbolGraphInspectorSection[];
    onSelectSymbolInspectorItem: (item: GraphItem) => void;
    routeFlowItems: GraphItem[];
    relatedPackageItems: GraphItem[];
    queryHintItems: GraphItem[];
    dependencyItems: GraphItem[];
    impactItems: GraphItem[];
    workspaceRoot?: string;
    onSelectItem: (item: GraphItem) => void;
  };
}

export function WorkspaceScreen(props: WorkspaceScreenProps) {
  const messages = getMessages(props.locale);
  const isFocused =
    props.presentationState.supportingPanelsVariant === "secondary";

  return (
    <main className="app-shell">
      <section className="app-frame">
        <header className="command-deck">
          <div className="command-copy">
            {props.header.selectedWorkspace ? (
              <div className="workspace-breadcrumb">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={props.header.onOpenWorkspaceList}
                >
                  {messages.app.workspaceListLabel}
                </button>
                <span>/</span>
                <strong>{props.header.selectedWorkspace.label}</strong>
              </div>
            ) : null}
            <span className="eyebrow">{messages.app.eyebrow}</span>
            <h1>GraphTrace</h1>
            <p>{messages.app.intro}</p>
          </div>

          <div className="command-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={props.header.onOpenWorkspaceList}
            >
              {messages.app.backToWorkspaces}
            </button>
            <label className="field repo-picker">
              <span>{messages.localeLabel}</span>
              <select
                value={props.locale}
                onChange={(event) =>
                  props.header.onLocaleChange(
                    resolveLocale(event.target.value, props.locale),
                  )
                }
              >
                {SUPPORTED_LOCALES.map((entry) => (
                  <option key={entry} value={entry}>
                    {messages.localeNames[entry]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field repo-picker">
              <span>{messages.app.repositoryScope}</span>
              <select
                value={props.header.selectedRepositoryId}
                onChange={(event) =>
                  props.header.onRepositoryChange(event.target.value)
                }
              >
                {props.header.repositories.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label} · {entry.rootPath}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="refresh-button"
              type="button"
              onClick={props.header.onRefreshGraph}
            >
              {messages.app.refreshGraph}
            </button>
            <div className="status-note">
              <span>{messages.app.workspaceLabel}</span>
              <strong>{props.header.currentWorkspaceLabel}</strong>
            </div>
            <div className="status-note">
              <span>{messages.app.lastIndexLabel}</span>
              <strong>{props.header.lastIndexLabel}</strong>
            </div>
          </div>
        </header>

        {props.workspaceError ? (
          <section className="error-banner">{props.workspaceError}</section>
        ) : null}

        <section
          className={isFocused ? "workspace-grid is-focused" : "workspace-grid"}
          data-workspace-mode={props.presentationState.mode}
        >
          <WorkspaceSidebar
            locale={props.locale}
            status={props.sidebar.status}
            selectedRepository={props.sidebar.selectedRepository}
            scopeOptions={props.sidebar.scopeOptions}
            scopeMode={props.sidebar.scopeMode}
            onScopeModeChange={props.sidebar.onScopeModeChange}
            selectedPackageId={props.sidebar.selectedPackageId}
            onSelectPackage={props.sidebar.onSelectPackage}
            onTogglePackage={props.sidebar.onTogglePackage}
            packageEntries={props.sidebar.packageEntries}
          />

          <div className="workspace-content">
            <div
              className={
                isFocused
                  ? "workspace-primary-panels is-focused"
                  : "workspace-primary-panels"
              }
            >
              <article
                className={
                  props.presentationState.graphCanvasDensity === "expanded"
                    ? "panel graph-panel is-emphasized"
                    : "panel graph-panel"
                }
              >
                <div className="panel-heading">
                  <span className="panel-kicker">
                    {messages.app.architectureGraphKicker}
                  </span>
                  <h2>{messages.app.boundedRelationshipTitle}</h2>
                  <p>{messages.app.architectureGraphDescription}</p>
                </div>

                {props.graphPanel.isSymbolInspector ? null : (
                  <div className="graph-toolbar">
                    {(
                      [
                        ["flow", messages.app.graphEdgeFlow],
                        ["depends", messages.app.graphEdgeDepends],
                        ["impacts", messages.app.graphEdgeImpacts],
                        ["contains", messages.app.graphEdgeContains],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        className={
                          props.graphPanel.edgeFilters[key]
                            ? "graph-filter is-active"
                            : "graph-filter"
                        }
                        type="button"
                        onClick={() => props.graphPanel.onToggleEdgeFilter(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                <GraphWorkspace
                  locale={props.locale}
                  graph={props.graphPanel.graph}
                  nodes={props.graphPanel.nodes}
                  starterGuide={props.graphPanel.starterGuide}
                  onSelectNode={props.graphPanel.onSelectNode}
                  onRunStarterAction={props.graphPanel.onRunStarterAction}
                  toolbarExtras={
                    props.graphPanel.symbolControls ? (
                      <SymbolGraphControls
                        locale={props.locale}
                        mode={props.graphPanel.symbolControls.mode}
                        confidenceFilter={
                          props.graphPanel.symbolControls.confidenceFilter
                        }
                        confidenceSummary={
                          props.graphPanel.symbolControls.confidenceSummary
                        }
                        symbolLabel={
                          props.graphPanel.symbolControls.symbolLabel
                        }
                        onModeChange={
                          props.graphPanel.symbolControls.onModeChange
                        }
                        onConfidenceFilterChange={
                          props.graphPanel.symbolControls
                            .onConfidenceFilterChange
                        }
                        onAction={props.graphPanel.symbolControls.onAction}
                      />
                    ) : undefined
                  }
                />
              </article>

              <aside
                className={
                  props.presentationState.emphasizeInspector
                    ? "panel inspector-panel is-emphasized"
                    : "panel inspector-panel"
                }
              >
                <div className="panel-heading">
                  <span className="panel-kicker">
                    {messages.app.detailPaneKicker}
                  </span>
                  <h2>{messages.app.inspectorTitle}</h2>
                  <p>{messages.app.inspectorDescription}</p>
                </div>

                {props.inspectorPanel.inspector.type === "idle" ? (
                  <div className="inspector-empty">
                    {props.presentationState.showStarterGuide ? (
                      <StarterGuide
                        locale={props.locale}
                        guide={props.graphPanel.starterGuide}
                        onRunAction={props.graphPanel.onRunStarterAction}
                      />
                    ) : null}
                    <div className="empty-state">
                      {messages.app.inspectorEmpty}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="inspector-card">
                      <span className="list-chip">
                        {props.inspectorPanel.inspector.type === "route"
                          ? "route"
                          : props.inspectorPanel.inspector.item.kind}
                      </span>
                      <h3>{props.inspectorPanel.selectedTitle}</h3>
                      <p>{props.inspectorPanel.selectedSummary}</p>
                      {props.inspectorPanel.selectedPackage ? (
                        <p className="inspector-supporting">
                          {props.inspectorPanel.selectedPackage.label} ·{" "}
                          {props.inspectorPanel.selectedPackage.path}
                        </p>
                      ) : null}

                      <div className="action-row">
                        <button
                          className="ghost-button"
                          type="button"
                          disabled={!props.inspectorPanel.selectedPath}
                          onClick={() => {
                            if (props.inspectorPanel.selectedPath) {
                              void copyToClipboard(
                                props.inspectorPanel.selectedPath,
                                messages.app.copiedPath,
                                props.inspectorPanel.onActionFeedbackChange,
                                props.locale,
                              );
                            }
                          }}
                        >
                          {messages.common.copyPath}
                        </button>
                        <button
                          className="ghost-button"
                          type="button"
                          disabled={!props.inspectorPanel.selectedCommand}
                          onClick={() => {
                            if (props.inspectorPanel.selectedCommand) {
                              void copyToClipboard(
                                props.inspectorPanel.selectedCommand,
                                messages.app.copiedCommand,
                                props.inspectorPanel.onActionFeedbackChange,
                                props.locale,
                              );
                            }
                          }}
                        >
                          {messages.common.copyCommand}
                        </button>
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={props.inspectorPanel.onRerunSearch}
                        >
                          {messages.app.rerunSearch}
                        </button>
                        {props.inspectorPanel.selectedFileHref ? (
                          <a
                            className="ghost-button is-link"
                            href={props.inspectorPanel.selectedFileHref}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {messages.common.openFile}
                          </a>
                        ) : null}
                      </div>

                      {props.inspectorPanel.actionFeedback ? (
                        <p className="action-feedback">
                          {props.inspectorPanel.actionFeedback}
                        </p>
                      ) : null}
                    </div>

                    {props.inspectorPanel.detailLoading ? (
                      <div className="empty-state inspector-empty">
                        {messages.app.inspectorLoading}
                      </div>
                    ) : null}
                    {props.inspectorPanel.detailError ? (
                      <div className="error-banner">
                        {props.inspectorPanel.detailError}
                      </div>
                    ) : null}

                    {props.inspectorPanel.isSymbolInspector ? (
                      <SymbolGraphInspector
                        locale={props.locale}
                        sections={props.inspectorPanel.symbolInspectorSections}
                        onSelectItem={
                          props.inspectorPanel.onSelectSymbolInspectorItem
                        }
                      />
                    ) : props.inspectorPanel.inspector.type === "route" ? (
                      <>
                        <InspectorSection
                          locale={props.locale}
                          title={messages.app.routeFlowTitle}
                          subtitle={messages.app.routeFlowSubtitle}
                          items={props.inspectorPanel.routeFlowItems}
                          workspaceRoot={props.inspectorPanel.workspaceRoot}
                          onSelectItem={props.inspectorPanel.onSelectItem}
                          onFeedback={
                            props.inspectorPanel.onActionFeedbackChange
                          }
                        />
                        <InspectorSection
                          locale={props.locale}
                          title={messages.app.relatedPackagesTitle}
                          subtitle={messages.app.relatedPackagesSubtitle}
                          items={props.inspectorPanel.relatedPackageItems}
                          workspaceRoot={props.inspectorPanel.workspaceRoot}
                          onSelectItem={props.inspectorPanel.onSelectItem}
                          onFeedback={
                            props.inspectorPanel.onActionFeedbackChange
                          }
                        />
                        <InspectorSection
                          locale={props.locale}
                          title={messages.app.queryHintsTitle}
                          subtitle={messages.app.queryHintsSubtitle}
                          items={props.inspectorPanel.queryHintItems}
                          workspaceRoot={props.inspectorPanel.workspaceRoot}
                          onSelectItem={props.inspectorPanel.onSelectItem}
                          onFeedback={
                            props.inspectorPanel.onActionFeedbackChange
                          }
                        />
                      </>
                    ) : (
                      <>
                        <InspectorSection
                          locale={props.locale}
                          title={messages.app.dependenciesTitle}
                          subtitle={messages.app.dependenciesSubtitle}
                          items={props.inspectorPanel.dependencyItems}
                          workspaceRoot={props.inspectorPanel.workspaceRoot}
                          onSelectItem={props.inspectorPanel.onSelectItem}
                          onFeedback={
                            props.inspectorPanel.onActionFeedbackChange
                          }
                        />
                        <InspectorSection
                          locale={props.locale}
                          title={messages.app.impactTitle}
                          subtitle={messages.app.impactSubtitle}
                          items={props.inspectorPanel.impactItems}
                          workspaceRoot={props.inspectorPanel.workspaceRoot}
                          onSelectItem={props.inspectorPanel.onSelectItem}
                          onFeedback={
                            props.inspectorPanel.onActionFeedbackChange
                          }
                        />
                      </>
                    )}
                  </>
                )}
              </aside>
            </div>

            <WorkspaceSupportingPanels
              locale={props.locale}
              variant={props.supportingPanels.variant}
              searchText={props.supportingPanels.searchText}
              onSearchTextChange={props.supportingPanels.onSearchTextChange}
              searchKind={props.supportingPanels.searchKind}
              onSearchKindChange={props.supportingPanels.onSearchKindChange}
              searchWorkbench={props.supportingPanels.searchWorkbench}
              visibleSearchResults={props.supportingPanels.visibleSearchResults}
              selectedSearchResultId={
                props.supportingPanels.selectedSearchResultId
              }
              onSelectQuickPick={props.supportingPanels.onSelectQuickPick}
              onSelectSearchResult={props.supportingPanels.onSelectSearchResult}
              packages={props.supportingPanels.packages}
              visibleRoutes={props.supportingPanels.visibleRoutes}
              selectedRouteId={props.supportingPanels.selectedRouteId}
              onSelectRoute={props.supportingPanels.onSelectRoute}
            />
          </div>
        </section>
      </section>
    </main>
  );
}

function InspectorSection(props: {
  locale: Locale;
  title: string;
  subtitle: string;
  items: GraphItem[];
  workspaceRoot?: string;
  onSelectItem: (item: GraphItem) => void;
  onFeedback: (message: string) => void;
}) {
  const messages = getMessages(props.locale);

  return (
    <section className="inspector-section">
      <div className="inspector-section-heading">
        <h3>{props.title}</h3>
        <p>{props.subtitle}</p>
      </div>

      <ul className="stack-list inspector-list">
        {props.items.length === 0 ? (
          <li className="empty-state">{messages.app.noItemsInTrace}</li>
        ) : (
          props.items.map((item) => {
            const itemCommand = buildGraphTraceCommand(item);
            const itemFileHref =
              props.workspaceRoot && item.path
                ? `file://${encodeURI(joinPath(props.workspaceRoot, item.path))}`
                : "";

            return (
              <li key={item.id} className="inspector-row">
                <button
                  className="inspector-row-main"
                  type="button"
                  onClick={() => props.onSelectItem(item)}
                >
                  <span className="list-chip">{item.kind}</span>
                  <span className="list-title">{item.label}</span>
                  <span className="list-meta">
                    {item.path ?? item.id}
                    {typeof item.confidence === "number"
                      ? ` · ${formatConfidence(props.locale, item.confidence)}`
                      : ""}
                  </span>
                </button>

                <div className="inspector-row-actions">
                  <button
                    className="mini-action"
                    type="button"
                    disabled={!item.path}
                    onClick={() => {
                      if (item.path) {
                        void copyToClipboard(
                          item.path,
                          messages.app.copiedPath,
                          props.onFeedback,
                          props.locale,
                        );
                      }
                    }}
                  >
                    {messages.common.copyPath}
                  </button>
                  <button
                    className="mini-action"
                    type="button"
                    onClick={() => {
                      void copyToClipboard(
                        itemCommand,
                        messages.app.copiedCommand,
                        props.onFeedback,
                        props.locale,
                      );
                    }}
                  >
                    {messages.common.copyCommand}
                  </button>
                  {itemFileHref ? (
                    <a
                      className="mini-action is-link"
                      href={itemFileHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {messages.common.openFile}
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}

async function copyToClipboard(
  value: string,
  message: string,
  setFeedback: (message: string) => void,
  locale: Locale,
) {
  try {
    await navigator.clipboard.writeText(value);
    setFeedback(message);
  } catch {
    setFeedback(getMessages(locale).app.clipboardUnavailable);
  }
}

function formatConfidence(locale: Locale, value?: number) {
  if (typeof value !== "number") {
    return "n/a";
  }

  return getMessages(locale).app.confidence({
    value: Math.round(value * 100),
  });
}

function joinPath(root: string, path: string) {
  if (path === ".") {
    return root;
  }

  return `${root.replace(/\/$/, "")}/${path.replace(/^\.\//, "")}`;
}
