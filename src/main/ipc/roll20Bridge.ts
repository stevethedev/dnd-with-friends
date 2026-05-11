/**
 * IPC bridge for Roll20 ↔ panel postMessage routing.
 *
 * These channels use ipcMain.on (not ipcMain.handle) because:
 *   - roll20.openPopout is called via ipcRenderer.sendSync and must set
 *     event.returnValue synchronously for window.open() to return a panel ID.
 *   - roll20.sendToPanel / roll20.closePanel / roll20.panelToRoll20 are
 *     fire-and-forget and don't need the ipcMain.handle promise wrapper.
 *
 * None of these channels go through the typed API/registry system (api.ts /
 * registry.ts) because they are internal Roll20 bridge channels, not part of
 * the public overlay ↔ main-process contract.
 */
import { ipcMain } from "electron";
import {
  createRoll20PopoutPanel,
  sendMessageToPanel,
  sendMessageToRoll20View,
  removePanel,
  getPanelByWebContentsId,
} from "../windowManager";
import { isHttpUrl } from "../../shared/utils";

export function registerRoll20BridgeHandlers(): void {
  /**
   * Called synchronously by the Roll20 preload when Roll20's JS calls
   * window.open('/editor/popout/...').  Creates the panel and returns its ID
   * so the caller can build a postMessage proxy immediately.
   */
  ipcMain.on(
    "roll20.openPopout",
    (
      event,
      payload: { url: string; windowName?: string; features: string },
    ) => {
      if (!isHttpUrl(payload.url)) {
        event.returnValue = null;
        console.error("[Roll20Bridge] Invalid URL:", payload.url);
        return;
      }
      try {
        const info = createRoll20PopoutPanel(
          payload.url,
          payload.windowName ?? "",
        );
        console.log(
          "[Roll20Bridge] Created popout panel:",
          info,
          "windowName:",
          payload.windowName,
        );
        event.returnValue = info.id;
      } catch (err) {
        console.error("[Roll20Bridge] openPopout failed:", err);
        event.returnValue = null;
      }
    },
  );

  /**
   * Called by the Roll20 preload when the proxy window's postMessage() is
   * invoked.  Dispatches the data as a window.message event inside the target
   * panel's webContents.
   */
  ipcMain.on(
    "roll20.sendToPanel",
    (_event, payload: { panelId: string; data: unknown }) => {
      sendMessageToPanel(payload.panelId, payload.data);
    },
  );

  /**
   * Called by the Roll20 preload when the proxy window's close() is invoked.
   * Removes the panel from the panel map and updates the overlay.
   */
  ipcMain.on("roll20.closePanel", (_event, payload: { panelId: string }) => {
    removePanel(payload.panelId);
  });

  /**
   * Called by the roll20-popout preload when the popout page calls
   * window.opener.postMessage(data).  Looks up which panel sent the message,
   * then delivers it as a window.message event in the Roll20 main view and
   * also emits a roll20.panelMessage overlay event so the React UI can react.
   */
  ipcMain.on("roll20.panelToRoll20", (event, payload: { data: unknown }) => {
    const panel = getPanelByWebContentsId(event.sender.id);
    if (panel) {
      sendMessageToRoll20View(panel.id, payload.data);
    }
  });
}
