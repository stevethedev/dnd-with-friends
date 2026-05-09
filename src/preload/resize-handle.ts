import { contextBridge, ipcRenderer } from "electron";
import { IpcChannels } from "../shared/ipcChannels";

contextBridge.exposeInMainWorld("resizeAPI", {
  onInit: (
    cb: (panelId: string, currentWidth: number) => void,
  ): (() => void) => {
    const handler = (
      _e: Electron.IpcRendererEvent,
      panelId: string,
      currentWidth: number,
    ): void => {
      cb(panelId, currentWidth);
    };
    ipcRenderer.on(IpcChannels.ResizeHandleInit, handler);
    return () =>
      ipcRenderer.removeListener(IpcChannels.ResizeHandleInit, handler);
  },

  /** Tell main to expand this view to full-window width so mousemove covers everything. */
  startDrag: (): void => {
    ipcRenderer.send(IpcChannels.ResizeDragStart);
  },

  resize: (panelId: string, newWidth: number): void => {
    ipcRenderer.send(IpcChannels.PanelResize, panelId, newWidth);
  },

  endDrag: (panelId: string, finalWidth: number): void => {
    ipcRenderer.send(IpcChannels.ResizeDragEnd, panelId, finalWidth);
  },
});
