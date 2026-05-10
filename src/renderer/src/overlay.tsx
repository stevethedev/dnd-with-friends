import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { PanelOverlay } from "./components/PanelOverlay";
import { ipc } from "../lib/ipc/client";
import "./styles/toolbar.css";

function OverlayApp(): React.JSX.Element {
  useEffect(() => {
    let lastIgnore = true;

    const setIgnore = (ignore: boolean): void => {
      if (ignore === lastIgnore) return;
      lastIgnore = ignore;
      void ipc.overlay.setIgnoreMouseEvents({ ignore });
    };

    const onMouseMove = (e: MouseEvent): void => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const interactive =
        el !== null && window.getComputedStyle(el).pointerEvents !== "none";
      setIgnore(!interactive);
    };

    const onMouseLeave = (): void => {
      setIgnore(true);
    };

    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseleave", onMouseLeave);
    return (): void => {
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  return <PanelOverlay />;
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>,
);
