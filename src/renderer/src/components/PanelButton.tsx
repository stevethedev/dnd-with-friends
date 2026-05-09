import React from "react";
import type { PanelInfo } from "../../../shared/types";
import { DEFAULT_PANEL_ID } from "../../../shared/constants";

interface Props {
  panel: PanelInfo;
  onToggle: (panelId: string) => void;
  onRemove: (panelId: string) => void;
}

function panelLabel(panel: PanelInfo): string {
  if (panel.title && panel.title !== panel.url) {
    return panel.title.length > 24
      ? panel.title.slice(0, 22) + "…"
      : panel.title;
  }
  try {
    return new URL(panel.url).hostname.replace(/^www\./, "");
  } catch {
    return panel.url;
  }
}

export function PanelButton({
  panel,
  onToggle,
  onRemove,
}: Props): React.JSX.Element {
  const isDefaultDnd = panel.id === DEFAULT_PANEL_ID;

  return (
    <div className="toolbar__panel-btn-group">
      <button
        className={`toolbar__panel-toggle ${panel.isOpen ? "toolbar__panel-toggle--open" : ""}`}
        onClick={() => {
          onToggle(panel.id);
        }}
        title={panel.isOpen ? `Close ${panel.title}` : `Open ${panel.title}`}
        aria-expanded={panel.isOpen}
      >
        {isDefaultDnd && <span className="toolbar__panel-toggle-icon">⚔</span>}
        <span className="toolbar__panel-toggle-label">{panelLabel(panel)}</span>
      </button>
      <button
        className="toolbar__panel-remove"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(panel.id);
        }}
        title={`Remove ${panel.title}`}
        aria-label={`Remove ${panel.title}`}
      >
        ×
      </button>
    </div>
  );
}
