import { ipcMain } from "electron";
import type { Beyond20Status, PanelInfo } from "../../shared/types";
import { store } from "../store";
import { DEFAULT_PANEL_WIDTH } from "../../shared/constants";
import { IpcChannels } from "../../shared/ipcChannels";
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

export function createHandlers(): HandlerMap {
  return {
    "panel.list": (): PanelInfo[] => getPanelInfoList(),
    "panel.create": ({ url }: { url: string }): PanelInfo => {
      // Read and increment the counter atomically against the store.
      // Persisting BEFORE addPanel ensures a crash between the two writes
      // can never produce a duplicate panel ID on the next launch.
      const counter = store.get("nextPanelId");
      store.set("nextPanelId", counter + 1);
      return addPanel({
        id: `panel-${counter}`,
        url,
        width: DEFAULT_PANEL_WIDTH,
      });
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
    IpcChannels.PanelResize,
    (e, panelId: string, newWidth: number) => {
      if (!isResizeSender(e.sender)) return;
      updatePanelWidth(panelId, newWidth);
    },
  );
  ipcMain.on(IpcChannels.ResizeDragStart, (e) => {
    if (!isResizeSender(e.sender)) return;
    startPanelDrag();
  });
  ipcMain.on(
    IpcChannels.ResizeDragEnd,
    (e, panelId: string, finalWidth: number) => {
      if (!isResizeSender(e.sender)) return;
      endPanelDrag(panelId, finalWidth);
    },
  );
}
