import React, { useState, useEffect } from "react";
import { WindowControls } from "./WindowControls";
import { Beyond20Status } from "./Beyond20Status";
import { Roll20Panel } from "./Roll20Panel";
import { PanelButton } from "./PanelButton";
import { UrlBar } from "./UrlBar";
import { usePanels } from "../hooks/usePanels";
import { ipc } from "../../lib/ipc/client";
import { DEFAULT_DND_URL } from "../../../shared/constants";

const platform: string = window.__platform;

export function Toolbar(): React.JSX.Element {
  const { panels, toggle, createPanel, removePanel, navigatePanel } =
    usePanels();
  const activePanel = panels.find((p) => p.isOpen) ?? null;

  const [urlInput, setUrlInput] = useState("");

  // Sync URL input when active panel changes
  useEffect(() => {
    if (activePanel) {
      ipc.panels
        .getUrl({ id: activePanel.id })
        .then((r) => {
          if (r.ok) setUrlInput(r.data);
        })
        .catch(console.error);
    } else {
      setUrlInput("");
    }
  }, [activePanel?.id]);

  // Also sync on URL-change push events
  useEffect(() => {
    return ipc.panels.onUrlChanged(({ id, url }) => {
      if (activePanel && id === activePanel.id) setUrlInput(url);
    });
  }, [activePanel?.id]);

  function handleAddPanel(): void {
    createPanel(DEFAULT_DND_URL);
  }

  function handleGo(): void {
    if (!activePanel || !urlInput.trim()) return;
    navigatePanel(activePanel.id, urlInput.trim());
  }

  return (
    <div className="toolbar" data-platform={platform}>
      {platform === "darwin" && <WindowControls />}

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
          <UrlBar
            value={urlInput}
            onChange={setUrlInput}
            onGo={handleGo}
            ariaLabel={`URL for ${activePanel.title}`}
          />
        </div>
      )}

      <Beyond20Status />
      <Roll20Panel />

      {platform !== "darwin" && <WindowControls />}
    </div>
  );
}
