import React, { useState, useEffect } from "react";
import { WindowControls } from "./WindowControls";
import { Beyond20Status } from "./Beyond20Status";
import { Roll20Panel } from "./Roll20Panel";
import { PanelButton } from "./PanelButton";
import { usePanels } from "../hooks/usePanels";
import { DEFAULT_DND_URL } from "../../../shared/constants";

export function Toolbar(): React.JSX.Element {
  const { panels, toggle, createPanel, removePanel, navigatePanel } =
    usePanels();
  const activePanel = panels.find((p) => p.isOpen) ?? null;

  const [urlInput, setUrlInput] = useState("");

  // Sync URL input when active panel changes
  useEffect(() => {
    if (activePanel) {
      window.electronAPI
        .getPanelUrl(activePanel.id)
        .then(setUrlInput)
        .catch(console.error);
    } else {
      setUrlInput("");
    }
  }, [activePanel?.id]);

  // Also sync on URL-change push events
  useEffect(() => {
    const unsub = window.electronAPI.onPanelUrlChanged((panelId, url) => {
      if (activePanel && panelId === activePanel.id) setUrlInput(url);
    });
    return unsub;
  }, [activePanel?.id]);

  function handleAddPanel(): void {
    createPanel(DEFAULT_DND_URL);
  }

  function handleGo(): void {
    if (!activePanel || !urlInput.trim()) return;
    navigatePanel(activePanel.id, urlInput.trim());
  }

  return (
    <div className="toolbar">
      <WindowControls />

      {/* Panel toggle buttons */}
      {panels.map((panel) => (
        <PanelButton
          key={panel.id}
          panel={panel}
          onToggle={toggle}
          onRemove={removePanel}
        />
      ))}

      {/* Add new panel */}
      <button
        className="toolbar__add-panel"
        onClick={handleAddPanel}
        title="Add a new D&D Beyond panel"
        aria-label="Add panel"
      >
        +
      </button>

      {/* URL bar for active panel */}
      {activePanel && (
        <div className="toolbar__active-url">
          <input
            className="toolbar__url-input"
            type="text"
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleGo();
            }}
            placeholder="https://..."
            aria-label={`URL for ${activePanel.title}`}
            spellCheck={false}
          />
          <button className="toolbar__btn" onClick={handleGo}>
            Go
          </button>
        </div>
      )}

      <Beyond20Status />
      <Roll20Panel />
    </div>
  );
}
