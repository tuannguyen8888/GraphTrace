import { type Locale, getMessages } from "./i18n";
import type {
  WorkspaceStarterAction,
  WorkspaceStarterGuide,
} from "./view-model";

interface StarterGuideProps {
  locale: Locale;
  guide: WorkspaceStarterGuide;
  onRunAction: (action: WorkspaceStarterAction) => void;
}

export function StarterGuide(props: StarterGuideProps) {
  const messages = getMessages(props.locale);

  if (props.guide.actions.length === 0) {
    return <div className="empty-state">{messages.app.starterGuideEmpty}</div>;
  }

  return (
    <section className="starter-guide">
      <div className="starter-guide-copy">
        <span className="panel-kicker">{messages.app.starterGuideKicker}</span>
        <h3>{props.guide.title}</h3>
        <p>{props.guide.description}</p>
      </div>

      <div className="quick-pick-grid starter-grid">
        {props.guide.actions.map((action) => (
          <button
            key={action.id}
            className="quick-pick starter-action"
            type="button"
            onClick={() => props.onRunAction(action)}
          >
            <span className="list-chip">{action.kind}</span>
            <span className="list-title">{action.label}</span>
            <span className="list-meta">{action.query}</span>
            <span className="list-subtle">{action.reason}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
