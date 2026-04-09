import type { GraphItem } from "@graphtrace/shared";

import type { Locale } from "./i18n";
import { getMessages } from "./i18n";
import type { SymbolGraphInspectorSection } from "./symbol-graph-types";

interface SymbolGraphInspectorProps {
  locale: Locale;
  sections: SymbolGraphInspectorSection[];
  onSelectItem: (item: GraphItem) => void;
}

export function SymbolGraphInspector(props: SymbolGraphInspectorProps) {
  const messages = getMessages(props.locale);

  return (
    <>
      {props.sections.map((section) => (
        <section key={section.id} className="inspector-section">
          <div className="inspector-section-heading">
            <h3>{section.title}</h3>
          </div>

          {section.items.length === 0 ? (
            <div className="inspector-empty">{messages.app.noItemsInTrace}</div>
          ) : (
            <ul className="stack-list inspector-list">
              {section.items.map((item) => (
                <li key={`${section.id}:${item.id}`} className="inspector-row">
                  <button
                    className="inspector-row-main"
                    type="button"
                    onClick={() => props.onSelectItem(item)}
                  >
                    <span className="list-chip">{item.kind}</span>
                    <span className="list-title">{item.label}</span>
                    <span className="list-subtle">{item.path ?? item.id}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}
