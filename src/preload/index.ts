import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipcChannels'
import type { Beyond20Status } from '../shared/types'

contextBridge.exposeInMainWorld('electronAPI', {
  // Panel navigation
  navigateDnd: (url: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.DND_NAVIGATE, url),

  navigateRoll20: (url: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.ROLL20_NAVIGATE, url),

  // Current panel URLs
  getDndUrl: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.DND_GET_URL),

  getRoll20Url: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.ROLL20_GET_URL),

  // URL change subscriptions (main pushes on navigation events)
  onDndUrlChanged: (cb: (url: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string): void => cb(url)
    ipcRenderer.on(IPC_CHANNELS.DND_URL_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.DND_URL_CHANGED, handler)
  },

  onRoll20UrlChanged: (cb: (url: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string): void => cb(url)
    ipcRenderer.on(IPC_CHANNELS.ROLL20_URL_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ROLL20_URL_CHANGED, handler)
  },

  // Window controls
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  maximizeWindow: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
  closeWindow: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),

  // D&D Beyond overlay panel
  toggleDndPanel: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.DND_TOGGLE_PANEL),
  getDndPanelState: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.DND_GET_PANEL_STATE),
  onDndPanelState: (cb: (open: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, open: boolean): void => cb(open)
    ipcRenderer.on(IPC_CHANNELS.DND_PANEL_STATE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.DND_PANEL_STATE, handler)
  },

  // Beyond20 status
  getBeyond20Status: (): Promise<Beyond20Status> =>
    ipcRenderer.invoke(IPC_CHANNELS.BEYOND20_STATUS),

  onBeyond20Update: (cb: (status: Beyond20Status) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: Beyond20Status): void => cb(status)
    ipcRenderer.on(IPC_CHANNELS.BEYOND20_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.BEYOND20_UPDATE, handler)
  }
})
