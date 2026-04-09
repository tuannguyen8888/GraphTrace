import type { GraphEnvelopeSummary } from "@graphtrace/shared";

import type { Locale } from "./i18n";
import { getMessages } from "./i18n";
import type {
  SymbolGraphConfidenceFilter,
  SymbolGraphMode,
} from "./symbol-graph-types";
import { buildSymbolConfidenceOptions } from "./symbol-graph-view-model";

interface SymbolGraphControlsProps {
  locale: Locale;
  mode: SymbolGraphMode;
  onModeChange: (mode: SymbolGraphMode) => void;
  confidenceFilter: SymbolGraphConfidenceFilter;
  confidenceSummary?: GraphEnvelopeSummary;
  onConfidenceFilterChange: (filter: SymbolGraphConfidenceFilter) => void;
  symbolLabel: string;
}

export function SymbolGraphControls(props: SymbolGraphControlsProps) {
  const messages = getMessages(props.locale);
  const confidenceOptions = buildSymbolConfidenceOptions({
    summary: props.confidenceSummary,
    labels: {
      strong: messages.app.symbolGraphConfidenceStrong,
      proven: messages.app.symbolGraphConfidenceProven,
      all: messages.app.symbolGraphConfidenceAll,
    },
  });

  return (
    <div className="symbol-graph-controls">
      <div className="symbol-graph-focus">
        <span className="panel-kicker">{messages.app.symbolGraphKicker}</span>
        <strong>{props.symbolLabel}</strong>
      </div>
      <div className="symbol-graph-mode-list">
        {(
          [
            ["execution", messages.app.symbolGraphExecution],
            ["impact", messages.app.symbolGraphImpact],
            ["reference", messages.app.symbolGraphReference],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            className={
              props.mode === mode ? "graph-filter is-active" : "graph-filter"
            }
            type="button"
            onClick={() => props.onModeChange(mode)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="symbol-graph-filter-group">
        <span className="symbol-graph-filter-label">
          {messages.app.symbolGraphConfidenceLabel}
        </span>
        <div className="symbol-graph-filter-list">
          {confidenceOptions.map((option) => (
            <button
              key={option.id}
              className={
                props.confidenceFilter === option.id
                  ? "graph-filter is-active"
                  : "graph-filter"
              }
              type="button"
              onClick={() => props.onConfidenceFilterChange(option.id)}
            >
              {option.label} ({option.count})
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
