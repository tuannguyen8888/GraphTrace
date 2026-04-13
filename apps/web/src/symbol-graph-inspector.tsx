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
          {section.warning ? (
            <div className="inspector-warning">{section.warning}</div>
          ) : null}

          {section.rows.length === 0 ? (
            <div className="inspector-empty">{messages.app.noItemsInTrace}</div>
          ) : (
            <ul className="stack-list inspector-list">
              {section.rows.map((row) => (
                <li
                  key={`${section.id}:${row.item.id}`}
                  className="inspector-row symbol-inspector-row"
                >
                  <button
                    className="inspector-row-main"
                    type="button"
                    onClick={() => props.onSelectItem(row.item)}
                  >
                    <span className="symbol-inspector-badges">
                      <span className="list-chip">{row.item.kind}</span>
                      {row.confidenceLabel ? (
                        <span
                          className={`confidence-chip confidence-chip-${row.confidenceLabel}`}
                        >
                          {formatConfidenceLabel(
                            props.locale,
                            row.confidenceLabel,
                          )}
                        </span>
                      ) : null}
                    </span>
                    <span className="list-title">{row.item.label}</span>
                    <span className="list-subtle">
                      {row.item.path ?? row.item.id}
                    </span>
                    {row.evidenceSummary ? (
                      <span className="inspector-evidence-summary">
                        {row.evidenceSummary}
                      </span>
                    ) : null}
                    {row.evidenceLines[0] ? (
                      <span className="inspector-evidence-line">
                        {row.evidenceLines[0]}
                      </span>
                    ) : null}
                    {row.confidenceLabel === "inferred-weak" ? (
                      <span className="inspector-row-warning">
                        {messages.app.symbolGraphWeakWarning}
                      </span>
                    ) : null}
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

function formatConfidenceLabel(
  locale: Locale,
  confidenceLabel: "proven" | "inferred-strong" | "inferred-weak",
) {
  const messages = getMessages(locale);

  switch (confidenceLabel) {
    case "proven":
      return messages.app.symbolGraphConfidenceProven;
    case "inferred-strong":
      return messages.app.symbolGraphConfidenceStrong;
    case "inferred-weak":
      return messages.app.symbolGraphConfidenceWeak;
  }
}
