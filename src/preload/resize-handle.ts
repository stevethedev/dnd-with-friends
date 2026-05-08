import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipcChannels'

contextBridge.exposeInMainWorld('resizeAPI', {
  onInit: (cb: (panelId: string, currentWidth: number) => void): (() => void) => {
    const handler = (
      _e: Electron.IpcRendererEvent,
      panelId: string,
      currentWidth: number
    ): void => cb(panelId, currentWidth)
    ipcRenderer.on(IPC_CHANNELS.RESIZE_HANDLE_INIT, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RESIZE_HANDLE_INIT, handler)
  },

  /** Tell main to expand this view to full-window width so mousemove covers everything. */
  startDrag: (panelId: string): void =>
    ipcRenderer.send(IPC_CHANNELS.RESIZE_DRAG_START, panelId),

  resize: (panelId: string, newWidth: number): void =>
    ipcRenderer.send(IPC_CHANNELS.PANEL_RESIZE, panelId, newWidth),

  endDrag: (panelId: string, finalWidth: number): void =>
    ipcRenderer.send(IPC_CHANNELS.RESIZE_DRAG_END, panelId, finalWidth)
})
