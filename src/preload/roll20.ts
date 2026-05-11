/**
 * Preload for the Roll20 WebContentsView.
 *
 * Exposes window.__roll20Bridge so the window.open override injected via
 * executeJavaScript (see createRoll20View in windowManager.ts) can create
 * popout panels and exchange postMessage-style data with them through the
 * main process rather than through a real BrowserWindow reference.
 *
 * Security: contextBridge.exposeInMainWorld is used so ipcRenderer never
 * leaks into Roll20's page context. The API surface is intentionally minimal —
 * no arbitrary channel access.
 */
import { contextBridge, ipcRenderer } from "electron";

export interface Roll20Bridge {
  /**
   * Create a panel for the given popout URL and return its panel ID.
   * Uses ipcRenderer.sendSync because window.open() must return synchronously.
   * windowName is the second argument passed to window.open() — Roll20 uses it
   * to identify the popup later (e.g. "JournalPopout-12345"). We inject it as
   * window.name in the panel so the page can read it.
   */
  openPopout: (url: string, windowName: string, features: string) => string;
  /** Forward a postMessage to a specific panel by ID. */
  sendToPanel: (panelId: string, data: unknown) => void;
  /** Remove a panel (called when the proxy window is close()d). */
  closePanel: (panelId: string) => void;
  /**
   * Subscribe to messages arriving from any popout panel.
   * Returns an unsubscribe function.
   */
  onPanelMessage: (
    handler: (panelId: string, data: unknown) => void,
  ) => () => void;
}

const bridge: Roll20Bridge = {
  openPopout(url, windowName, features) {
    return ipcRenderer.sendSync("roll20.openPopout", { url, windowName, features }) as string;
  },

  sendToPanel(panelId, data) {
    ipcRenderer.send("roll20.sendToPanel", { panelId, data });
  },

  closePanel(panelId) {
    ipcRenderer.send("roll20.closePanel", { panelId });
  },

  onPanelMessage(handler) {
    const listener = (
      _e: Electron.IpcRendererEvent,
      payload: { panelId: string; data: unknown },
    ): void => {
      handler(payload.panelId, payload.data);
    };
    ipcRenderer.on("roll20.panelMessage", listener);
    return () => ipcRenderer.removeListener("roll20.panelMessage", listener);
  },
};

contextBridge.exposeInMainWorld("__roll20Bridge", bridge);
