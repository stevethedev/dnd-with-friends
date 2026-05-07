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

  resize: (panelId: string, newWidth: number): void =>
    ipcRenderer.send(IPC_CHANNELS.PANEL_RESIZE, panelId, newWidth),

  resizeEnd: (panelId: string, finalWidth: number): void =>
    ipcRenderer.send(IPC_CHANNELS.PANEL_RESIZE_END, panelId, finalWidth)
})
