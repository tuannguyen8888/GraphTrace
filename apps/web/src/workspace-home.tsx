import type { FormEvent } from "react";

import type { WorkspaceCard } from "./home-view-model";
import { type Locale, SUPPORTED_LOCALES, getMessages } from "./i18n";

interface WorkspaceHomeProps {
  locale: Locale;
  cards: WorkspaceCard[];
  workspaceError: string;
  addingWorkspace: boolean;
  draftRootPath: string;
  draftLabel: string;
  onLocaleChange: (value: Locale) => void;
  onDraftRootPathChange: (value: string) => void;
  onDraftLabelChange: (value: string) => void;
  onAddWorkspace: (event: FormEvent<HTMLFormElement>) => void;
  onOpenWorkspace: (workspaceId: string) => void;
}

export function WorkspaceHome(props: WorkspaceHomeProps) {
  const messages = getMessages(props.locale);

  return (
    <main className="app-shell">
      <section className="app-frame home-frame">
        <header className="command-deck">
          <div className="command-copy">
            <span className="eyebrow">{messages.home.eyebrow}</span>
            <h1>GraphTrace</h1>
            <p>{messages.home.intro}</p>
          </div>
          <div className="command-actions">
            <label className="field repo-picker">
              <span>{messages.localeLabel}</span>
              <select
                value={props.locale}
                onChange={(event) =>
                  props.onLocaleChange(event.target.value as Locale)
                }
              >
                {SUPPORTED_LOCALES.map((entry) => (
                  <option key={entry} value={entry}>
                    {messages.localeNames[entry]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        {props.workspaceError ? (
          <section className="error-banner">{props.workspaceError}</section>
        ) : null}

        <section className="home-grid">
          <article className="panel home-list-panel">
            <div className="panel-heading">
              <span className="panel-kicker">
                {messages.home.indexedWorkspacesKicker}
              </span>
              <h2>{messages.home.title}</h2>
              <p>{messages.home.description}</p>
            </div>

            {props.cards.length === 0 ? (
              <div className="empty-home-state">{messages.home.emptyState}</div>
            ) : (
              <div className="workspace-card-list">
                {props.cards.map((card) => (
                  <button
                    key={card.id}
                    className="workspace-card"
                    type="button"
                    onClick={() => props.onOpenWorkspace(card.id)}
                  >
                    <div className="workspace-card-head">
                      <div>
                        <strong>{card.label}</strong>
                        <span>{card.subline}</span>
                      </div>
                      <span
                        className={`workspace-status workspace-status-${card.statusTone}`}
                      >
                        {card.statusLabel}
                      </span>
                    </div>
                    <div className="workspace-card-metric">
                      {card.metricSummary}
                    </div>
                    <div className="workspace-card-meta">
                      <span>{card.timestampLabel}</span>
                      <span>{card.dbPath}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </article>

          <aside className="panel home-form-panel">
            <div className="panel-heading">
              <span className="panel-kicker">
                {messages.home.addRepoKicker}
              </span>
              <h2>{messages.home.addTitle}</h2>
              <p>{messages.home.addDescription}</p>
            </div>

            <form className="workspace-form" onSubmit={props.onAddWorkspace}>
              <label className="field">
                <span>{messages.home.repoPathLabel}</span>
                <input
                  required
                  type="text"
                  value={props.draftRootPath}
                  onChange={(event) =>
                    props.onDraftRootPathChange(event.target.value)
                  }
                  placeholder={messages.home.repoPathPlaceholder}
                />
              </label>
              <label className="field">
                <span>{messages.home.labelOptional}</span>
                <input
                  type="text"
                  value={props.draftLabel}
                  onChange={(event) =>
                    props.onDraftLabelChange(event.target.value)
                  }
                  placeholder={messages.home.labelPlaceholder}
                />
              </label>
              <button
                className="refresh-button"
                type="submit"
                disabled={props.addingWorkspace}
              >
                {props.addingWorkspace
                  ? messages.home.addingWorkspace
                  : messages.home.addWorkspace}
              </button>
            </form>
          </aside>
        </section>
      </section>
    </main>
  );
}
