import { ipcMain } from "electron";
import { store } from "../store";
import { DEFAULT_PANEL_WIDTH } from "../../shared/constants";
import { IPC_CHANNELS } from "../../shared/ipcChannels";
import {
  getRoll20View,
  getPanelInfoList,
  addPanel,
  removePanel,
  togglePanel,
  navigatePanel,
  getPanelUrl,
  getMainWindow,
  getResizeHandleView,
  updatePanelWidth,
  startPanelDrag,
  endPanelDrag,
} from "../windowManager";
import { getBeyond20Status } from "../beyond20Manager";
import type { HandlerMap } from "../../shared/ipc/types";

let nextIdCounter = 0;

export function createHandlers(): HandlerMap {
  nextIdCounter = store.get("nextPanelId");

  return {
    "panel.list": async () => getPanelInfoList(),
    "panel.create": async ({ url }) => {
      const id = `panel-${nextIdCounter++}`;
      store.set("nextPanelId", nextIdCounter);
      return addPanel({ id, url, width: DEFAULT_PANEL_WIDTH });
    },
    "panel.remove": async ({ id }) => {
      removePanel(id);
      return getPanelInfoList();
    },
    "panel.toggle": async ({ id }) => togglePanel(id),
    "panel.navigate": async ({ id, url }) => {
      navigatePanel(id, url);
    },
    "panel.getUrl": async ({ id }) => getPanelUrl(id),
    "roll20.navigate": async ({ url }) => {
      void getRoll20View().webContents.loadURL(url);
    },
    "roll20.getUrl": async () => getRoll20View().webContents.getURL(),
    "beyond20.getStatus": async () => getBeyond20Status(),
    "window.minimize": async () => {
      getMainWindow().minimize();
    },
    "window.maximize": async () => {
      const w = getMainWindow();
      w.isMaximized() ? w.unmaximize() : w.maximize();
    },
    "window.close": async () => {
      getMainWindow().close();
    },
    "window.isMaximized": async () => getMainWindow().isMaximized(),
  };
}

export function registerResizeHandlers(): void {
  // Verify that resize messages originate from the resize-handle view only.
  // This prevents any other renderer (including compromised panel content) from
  // injecting fake drag events to manipulate panel layout.
  function isResizeSender(sender: Electron.WebContents): boolean {
    return sender === getResizeHandleView()?.webContents;
  }

  ipcMain.on(
    IPC_CHANNELS.PANEL_RESIZE,
    (e, panelId: string, newWidth: number) => {
      if (!isResizeSender(e.sender)) return;
      updatePanelWidth(panelId, newWidth);
    },
  );
  ipcMain.on(IPC_CHANNELS.RESIZE_DRAG_START, (e) => {
    if (!isResizeSender(e.sender)) return;
    startPanelDrag();
  });
  ipcMain.on(
    IPC_CHANNELS.RESIZE_DRAG_END,
    (e, panelId: string, finalWidth: number) => {
      if (!isResizeSender(e.sender)) return;
      endPanelDrag(panelId, finalWidth);
    },
  );
}
