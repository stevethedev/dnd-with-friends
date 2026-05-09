import { ipcMain } from "electron";
import type { Beyond20Status, PanelInfo } from "../../shared/types";
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
    "panel.list": (): PanelInfo[] => getPanelInfoList(),
    "panel.create": ({ url }: { url: string }): PanelInfo => {
      const id = `panel-${nextIdCounter++}`;
      store.set("nextPanelId", nextIdCounter);
      return addPanel({ id, url, width: DEFAULT_PANEL_WIDTH });
    },
    "panel.remove": ({ id }: { id: string }): PanelInfo[] => {
      removePanel(id);
      return getPanelInfoList();
    },
    "panel.toggle": ({ id }: { id: string }): PanelInfo[] => togglePanel(id),
    "panel.navigate": ({ id, url }: { id: string; url: string }): void => {
      navigatePanel(id, url);
    },
    "panel.getUrl": ({ id }: { id: string }): string => getPanelUrl(id),
    "roll20.navigate": ({ url }: { url: string }): void => {
      void getRoll20View().webContents.loadURL(url);
    },
    "roll20.getUrl": (): string => getRoll20View().webContents.getURL(),
    "beyond20.getStatus": (): Beyond20Status => getBeyond20Status(),
    "window.minimize": (): void => {
      getMainWindow().minimize();
    },
    "window.maximize": (): void => {
      const w = getMainWindow();
      if (w.isMaximized()) {
        w.unmaximize();
      } else {
        w.maximize();
      }
    },
    "window.close": (): void => {
      getMainWindow().close();
    },
    "window.isMaximized": (): boolean => getMainWindow().isMaximized(),
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
