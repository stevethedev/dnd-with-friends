import React from "react";

export function WindowControls(): React.JSX.Element {
  return (
    <div className="toolbar__window-controls">
      <button
        className="toolbar__wc-btn toolbar__wc-btn--close"
        onClick={() => void window.electronAPI.closeWindow()}
        title="Close"
        aria-label="Close window"
      />
      <button
        className="toolbar__wc-btn toolbar__wc-btn--min"
        onClick={() => void window.electronAPI.minimizeWindow()}
        title="Minimise"
        aria-label="Minimise window"
      />
      <button
        className="toolbar__wc-btn toolbar__wc-btn--max"
        onClick={() => void window.electronAPI.maximizeWindow()}
        title="Maximise"
        aria-label="Maximise window"
      />
    </div>
  );
}
