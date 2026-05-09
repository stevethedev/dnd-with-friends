import React from "react";
import { ipc } from "../../lib/ipc/client";
import { useIpcState } from "../../lib/ipc/hooks";

const platform: string = window.__platform;

function MinimizeSvg(): React.JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M0 5h10v1H0z" fill="currentColor" />
    </svg>
  );
}

function MaximizeSvg(): React.JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <rect
        x="0.5"
        y="0.5"
        width="9"
        height="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}

function RestoreSvg(): React.JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <rect
        x="2.5"
        y="0.5"
        width="7"
        height="7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
      <path
        d="M0.5 2.5v7h7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}

function CloseSvg(): React.JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path
        d="M1 1l8 8M9 1L1 9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function WindowControls(): React.JSX.Element {
  const isMaximized =
    useIpcState(ipc.window.isMaximized, ipc.window.onMaximizeChanged) ?? false;

  if (platform === "darwin") {
    return (
      <div className="wc-mac" role="group" aria-label="Window controls">
        <button
          className="wc-mac__btn wc-mac__btn--close"
          onClick={() => void ipc.window.close()}
          aria-label="Close"
        />
        <button
          className="wc-mac__btn wc-mac__btn--min"
          onClick={() => void ipc.window.minimize()}
          aria-label="Minimise"
        />
        <button
          className="wc-mac__btn wc-mac__btn--max"
          onClick={() => void ipc.window.maximize()}
          aria-label={isMaximized ? "Restore" : "Maximise"}
        />
      </div>
    );
  }

  return (
    <div className="wc-win" role="group" aria-label="Window controls">
      <button
        className="wc-win__btn wc-win__btn--min"
        onClick={() => void ipc.window.minimize()}
        aria-label="Minimise"
      >
        <MinimizeSvg />
      </button>
      <button
        className="wc-win__btn wc-win__btn--max"
        onClick={() => void ipc.window.maximize()}
        aria-label={isMaximized ? "Restore" : "Maximise"}
      >
        {isMaximized ? <RestoreSvg /> : <MaximizeSvg />}
      </button>
      <button
        className="wc-win__btn wc-win__btn--close"
        onClick={() => void ipc.window.close()}
        aria-label="Close"
      >
        <CloseSvg />
      </button>
    </div>
  );
}
