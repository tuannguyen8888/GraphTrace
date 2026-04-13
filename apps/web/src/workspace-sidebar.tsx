import type { RepositorySummary } from "@graphtrace/shared";

import { type Locale, getMessages } from "./i18n";
import type {
  PackageListEntry,
  ScopeMode,
  WorkspaceStatus,
} from "./view-model";

export interface SidebarScopeOption {
  id: ScopeMode;
  label: string;
  description: string;
}

export interface SidebarPackageEntry extends PackageListEntry {
  scopeLabel: string;
}

interface WorkspaceSidebarProps {
  locale: Locale;
  status: WorkspaceStatus | null;
  selectedRepository: RepositorySummary | null;
  scopeOptions: SidebarScopeOption[];
  scopeMode: ScopeMode;
  onScopeModeChange: (mode: ScopeMode) => void;
  selectedPackageId: string;
  onSelectPackage: (packageId: string) => void;
  onTogglePackage: (packageId: string) => void;
  packageEntries: SidebarPackageEntry[];
}

export function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  const messages = getMessages(props.locale);

  return (
    <aside className="panel rail-panel workspace-sidebar">
      <div className="panel-heading">
        <span className="panel-kicker">
          {messages.app.workspaceStatusKicker}
        </span>
        <h2>{messages.app.graphStateTitle}</h2>
      </div>

      <dl className="metric-grid">
        <Metric
          label={messages.app.packagesLabel}
          value={props.status?.counts.packageCount ?? 0}
        />
        <Metric
          label={messages.app.filesLabel}
          value={props.status?.counts.fileCount ?? 0}
        />
        <Metric
          label={messages.app.symbolsLabel}
          value={props.status?.counts.symbolCount ?? 0}
        />
        <Metric
          label={messages.app.routesLabel}
          value={props.status?.counts.routeCount ?? 0}
        />
        <Metric
          label={messages.app.queryEdgesLabel}
          value={props.status?.counts.queryEdgeCount ?? 0}
        />
      </dl>

      <div className="meta-block">
        <span>{messages.app.repositoryLabel}</span>
        <strong>
          {props.selectedRepository?.label ?? messages.common.loading}
        </strong>
      </div>
      <div className="meta-block">
        <span>{messages.app.repositoryRootLabel}</span>
        <strong>
          {props.selectedRepository?.rootPath ?? messages.common.loading}
        </strong>
      </div>
      <div className="meta-block">
        <span>{messages.app.workspaceRootLabel}</span>
        <strong>
          {props.status?.workspaceRoot ?? messages.common.loading}
        </strong>
      </div>
      <div className="meta-block">
        <span>{messages.app.dbPathLabel}</span>
        <strong>{props.status?.dbPath ?? messages.common.loading}</strong>
      </div>
      <div className="meta-block">
        <span>{messages.app.modeLabel}</span>
        <strong>
          {props.status?.lastIndexRun?.mode ?? messages.common.noneYet}
        </strong>
      </div>

      <div className="panel-divider" />

      <div className="panel-heading compact">
        <span className="panel-kicker">
          {messages.app.workspaceScopeKicker}
        </span>
        <h2>{messages.app.triageLensTitle}</h2>
      </div>

      <div className="scope-toggle">
        {props.scopeOptions.map((option) => (
          <button
            key={option.id}
            className={
              props.scopeMode === option.id
                ? "scope-option is-active"
                : "scope-option"
            }
            type="button"
            onClick={() => props.onScopeModeChange(option.id)}
          >
            <strong>{option.label}</strong>
            <span>{option.description}</span>
          </button>
        ))}
      </div>

      <div className="panel-divider" />

      <div className="panel-heading compact">
        <span className="panel-kicker">{messages.app.packagesKicker}</span>
        <h2>{messages.app.routeFilterTitle}</h2>
      </div>

      <label className="field">
        <span>{messages.app.filterByPackageLabel}</span>
        <select
          value={props.selectedPackageId}
          onChange={(event) => props.onSelectPackage(event.target.value)}
        >
          <option value="">{messages.app.allVisiblePackages}</option>
          {props.packageEntries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
              {entry.disambiguation ? ` · ${entry.secondaryLabel}` : ""}
            </option>
          ))}
        </select>
      </label>

      <ul className="stack-list package-list">
        {props.packageEntries.map((entry) => (
          <li key={entry.id}>
            <button
              className={
                entry.id === props.selectedPackageId
                  ? "list-item is-active"
                  : "list-item"
              }
              type="button"
              onClick={() => props.onTogglePackage(entry.id)}
            >
              <span className="list-chip">{entry.scopeLabel}</span>
              <span className="list-title">{entry.label}</span>
              <span className="list-meta">{entry.secondaryLabel}</span>
              {entry.disambiguation ? (
                <span className="list-subtle">
                  {messages.app.duplicateLabelHint}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function Metric(props: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <dt>{props.label}</dt>
      <dd>{props.value}</dd>
    </div>
  );
}
