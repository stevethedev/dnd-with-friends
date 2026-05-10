import React, { useState } from "react";
import { FloatingPanel } from "./FloatingPanel";
import { usePanels } from "../hooks/usePanels";

export function PanelOverlay(): React.JSX.Element {
  const { panels, minimizePanel, removePanel, focusPanel } = usePanels();
  const [capturingDrag, setCapturingDrag] = useState(false);

  const openPanels = panels
    .filter((p) => p.state === "open")
    .sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div
      className={`panel-overlay${capturingDrag ? " panel-overlay--capturing" : ""}`}
    >
      {openPanels.map((panel) => (
        <FloatingPanel
          key={panel.id}
          panel={panel}
          allPanels={openPanels}
          onMinimize={minimizePanel}
          onClose={removePanel}
          onFocus={focusPanel}
          onDragCapture={setCapturingDrag}
        />
      ))}
    </div>
  );
}
