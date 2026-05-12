import React from "react";
import type { PanelInfo } from "../../../shared/types";

interface Props {
  panel: PanelInfo;
  onRestore: (id: string) => void;
  onRemove: (id: string) => void;
}

export function MinimizedPanelTile({
  panel,
  onRestore,
  onRemove,
}: Props): React.JSX.Element {
  function handleRemove(e: React.MouseEvent): void {
    e.stopPropagation();
    onRemove(panel.id);
  }

  return (
    <div
      className="panel-tile"
      role="button"
      tabIndex={0}
      title={panel.title}
      onClick={() => {
        onRestore(panel.id);
      }}
      onKeyDown={(e) => {
        if (e.key === " ") e.preventDefault(); // Prevent scrolling when space is pressed
        if (e.key === "Enter" || e.key === " ") onRestore(panel.id);
      }}
    >
      {panel.favicon ? (
        <img
          className="panel-tile__favicon"
          src={panel.favicon}
          alt=""
          aria-hidden="true"
        />
      ) : (
        <span className="panel-tile__favicon-fallback" aria-hidden="true">
          ⚔
        </span>
      )}
      <button
        className="panel-tile__remove"
        onClick={handleRemove}
        title={`Close ${panel.title}`}
        aria-label={`Close ${panel.title}`}
      >
        ×
      </button>
    </div>
  );
}
