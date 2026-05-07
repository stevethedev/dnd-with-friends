import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipcChannels'
import type { Beyond20Status, PanelInfo } from '../shared/types'

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Panel management ──────────────────────────────────────────────────────

  listPanels: (): Promise<PanelInfo[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.PANEL_LIST),

  createPanel: (url: string): Promise<PanelInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.PANEL_CREATE, url),

  removePanel: (panelId: string): Promise<PanelInfo[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.PANEL_REMOVE, panelId),

  togglePanel: (panelId: string): Promise<PanelInfo[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.PANEL_TOGGLE, panelId),

  navigatePanel: (panelId: string, url: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.PANEL_NAVIGATE, panelId, url),

  getPanelUrl: (panelId: string): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.PANEL_GET_URL, panelId),

  /** Fire-and-forget resize during drag — no round-trip overhead. */
  resizePanel: (panelId: string, newWidth: number): void =>
    ipcRenderer.send(IPC_CHANNELS.PANEL_RESIZE, panelId, newWidth),

  /** Final resize call on drag end — persisted to store. */
  resizePanelEnd: (panelId: string, finalWidth: number): void =>
    ipcRenderer.send(IPC_CHANNELS.PANEL_RESIZE_END, panelId, finalWidth),

  onPanelListUpdated: (cb: (panels: PanelInfo[]) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, panels: PanelInfo[]): void => cb(panels)
    ipcRenderer.on(IPC_CHANNELS.PANEL_LIST_UPDATED, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PANEL_LIST_UPDATED, handler)
  },

  onPanelUrlChanged: (cb: (panelId: string, url: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, panelId: string, url: string): void =>
      cb(panelId, url)
    ipcRenderer.on(IPC_CHANNELS.PANEL_URL_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PANEL_URL_CHANGED, handler)
  },

  // ── Roll20 ────────────────────────────────────────────────────────────────

  navigateRoll20: (url: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.ROLL20_NAVIGATE, url),

  getRoll20Url: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.ROLL20_GET_URL),

  onRoll20UrlChanged: (cb: (url: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, url: string): void => cb(url)
    ipcRenderer.on(IPC_CHANNELS.ROLL20_URL_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ROLL20_URL_CHANGED, handler)
  },

  // ── Window controls ───────────────────────────────────────────────────────

  minimizeWindow: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  maximizeWindow: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
  closeWindow: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),

  // ── Beyond20 ─────────────────────────────────────────────────────────────

  getBeyond20Status: (): Promise<Beyond20Status> =>
    ipcRenderer.invoke(IPC_CHANNELS.BEYOND20_STATUS),

  onBeyond20Update: (cb: (status: Beyond20Status) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, status: Beyond20Status): void => cb(status)
    ipcRenderer.on(IPC_CHANNELS.BEYOND20_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.BEYOND20_UPDATE, handler)
  }
})
