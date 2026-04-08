import type { FormEvent } from "react";

import type { WorkspaceCard } from "./home-view-model";

interface WorkspaceHomeProps {
  cards: WorkspaceCard[];
  workspaceError: string;
  addingWorkspace: boolean;
  draftRootPath: string;
  draftLabel: string;
  onDraftRootPathChange: (value: string) => void;
  onDraftLabelChange: (value: string) => void;
  onAddWorkspace: (event: FormEvent<HTMLFormElement>) => void;
  onOpenWorkspace: (workspaceId: string) => void;
}

export function WorkspaceHome(props: WorkspaceHomeProps) {
  return (
    <main className="app-shell">
      <section className="app-frame home-frame">
        <header className="command-deck">
          <div className="command-copy">
            <span className="eyebrow">MULTI-WORKSPACE GRAPH TRACE</span>
            <h1>GraphTrace</h1>
            <p>
              Chọn một workspace đã index hoặc add repo mới để daemon quản lý
              tập trung trong cùng một UI.
            </p>
          </div>
        </header>

        {props.workspaceError ? (
          <section className="error-banner">{props.workspaceError}</section>
        ) : null}

        <section className="home-grid">
          <article className="panel home-list-panel">
            <div className="panel-heading">
              <span className="panel-kicker">Indexed workspaces</span>
              <h2>Workspace home</h2>
              <p>
                Home screen giữ data từng repo tách biệt trước khi đi sâu vào
                repository/package/graph.
              </p>
            </div>

            {props.cards.length === 0 ? (
              <div className="empty-home-state">
                Chưa có workspace nào trong daemon này. Add repo đầu tiên ở cột
                bên phải để bắt đầu.
              </div>
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
              <span className="panel-kicker">Add new repo</span>
              <h2>Index a workspace</h2>
              <p>
                Paste path repo local. GraphTrace sẽ index vào managed storage,
                không cần chạy thêm instance khác.
              </p>
            </div>

            <form className="workspace-form" onSubmit={props.onAddWorkspace}>
              <label className="field">
                <span>Repo path</span>
                <input
                  required
                  type="text"
                  value={props.draftRootPath}
                  onChange={(event) =>
                    props.onDraftRootPathChange(event.target.value)
                  }
                  placeholder="/Users/.../my-repo"
                />
              </label>
              <label className="field">
                <span>Label (optional)</span>
                <input
                  type="text"
                  value={props.draftLabel}
                  onChange={(event) =>
                    props.onDraftLabelChange(event.target.value)
                  }
                  placeholder="my-repo"
                />
              </label>
              <button
                className="refresh-button"
                type="submit"
                disabled={props.addingWorkspace}
              >
                {props.addingWorkspace
                  ? "Indexing workspace..."
                  : "Add workspace"}
              </button>
            </form>
          </aside>
        </section>
      </section>
    </main>
  );
}
