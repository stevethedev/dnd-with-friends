import React, { useState, useEffect, useCallback } from "react";
import { WindowControls } from "./WindowControls";
import { Beyond20Status } from "./Beyond20Status";
import { Roll20Panel } from "./Roll20Panel";
import { MinimizedPanelTile } from "./MinimizedPanelTile";
import { UrlBar } from "./UrlBar";
import { usePanels } from "../hooks/usePanels";
import { ipc } from "../../lib/ipc/client";
import { DEFAULT_DND_URL } from "../../../shared/constants";

const platform: string = window.__platform;

export function Toolbar(): React.JSX.Element {
  const {
    panels,
    focusedPanel,
    restorePanel,
    createPanel,
    removePanel,
    navigatePanel,
  } = usePanels();

  const minimizedPanels = panels.filter((p) => p.state === "minimized");

  const [urlInput, setUrlInput] = useState("");

  // Sync the URL input with the focused panel's live URL.
  // Subscribe first, then fetch the current value — this ordering prevents a
  // race where a navigation completes between the fetch call and the subscription
  // setup, causing the input to show a stale URL.
  useEffect(() => {
    if (!focusedPanel) {
      setUrlInput("");
      return;
    }
    const panelId = focusedPanel.id;
    const unsub = ipc.panels.onUrlChanged(({ id, url }) => {
      if (id === panelId) setUrlInput(url);
    });
    ipc.panels
      .getUrl({ id: panelId })
      .then((r) => {
        if (r.ok) setUrlInput(r.data);
      })
      .catch(console.error);
    return unsub;
  }, [focusedPanel?.id]);

  const handleAddPanel = useCallback((): void => {
    createPanel(DEFAULT_DND_URL);
  }, [createPanel]);

  const handleGo = useCallback((): void => {
    if (!focusedPanel) return;
    const url = urlInput.trim();
    if (!url) return;
    navigatePanel(focusedPanel.id, url);
  }, [focusedPanel, urlInput, navigatePanel]);

  return (
    <div className="toolbar" data-platform={platform}>
      {platform === "darwin" && <WindowControls />}

      {/* Minimized panel tiles */}
      {minimizedPanels.map((panel) => (
        <MinimizedPanelTile
          key={panel.id}
          panel={panel}
          onRestore={restorePanel}
          onRemove={removePanel}
        />
      ))}

      {/* Add new panel */}
      <button
        className="toolbar__add-panel"
        onClick={handleAddPanel}
        title="Add a new panel"
        aria-label="Add panel"
      >
        +
      </button>

      {/* URL bar for focused (top z-index) panel */}
      {focusedPanel && (
        <div className="toolbar__active-url">
          <UrlBar
            value={urlInput}
            onChange={setUrlInput}
            onGo={handleGo}
            ariaLabel={`URL for ${focusedPanel.title}`}
          />
        </div>
      )}

      <Beyond20Status />
      <div className="toolbar__spacer" />
      <Roll20Panel />

      {platform !== "darwin" && <WindowControls />}
    </div>
  );
}
