import React from "react";
import { ipc } from "../../lib/ipc/client";

export function WindowControls(): React.JSX.Element {
  return (
    <div className="toolbar__window-controls">
      <button
        className="toolbar__wc-btn toolbar__wc-btn--close"
        onClick={() => void ipc.window.close()}
        title="Close"
        aria-label="Close window"
      />
      <button
        className="toolbar__wc-btn toolbar__wc-btn--min"
        onClick={() => void ipc.window.minimize()}
        title="Minimise"
        aria-label="Minimise window"
      />
      <button
        className="toolbar__wc-btn toolbar__wc-btn--max"
        onClick={() => void ipc.window.maximize()}
        title="Maximise"
        aria-label="Maximise window"
      />
    </div>
  );
}
