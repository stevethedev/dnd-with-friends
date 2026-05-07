import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipcChannels'
import {
  getMainWindow,
  getRoll20View,
  getPanelInfoList,
  addPanel,
  removePanel,
  togglePanel,
  navigatePanel,
  getPanelUrl,
  updatePanelWidth,
  finalizePanelWidth
} from './windowManager'
import { getBeyond20Status } from './beyond20Manager'
import { store } from './store'

/** Allow only http/https URLs to prevent navigation to file:// or javascript: */
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Disallowed protocol: ${parsed.protocol}`)
    }
    return parsed.toString()
  } catch {
    throw new Error(`Invalid URL: ${url}`)
  }
}

let nextIdCounter = 0

export function registerIpcHandlers(): void {
  // Seed the counter from store so IDs survive restarts
  nextIdCounter = store.get('nextPanelId')

  // ── Panel CRUD ─────────────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.PANEL_LIST, () => {
    return getPanelInfoList()
  })

  ipcMain.handle(IPC_CHANNELS.PANEL_CREATE, (_event, url: string) => {
    const safeUrl = sanitizeUrl(url)
    const id = `panel-${nextIdCounter++}`
    store.set('nextPanelId', nextIdCounter)
    return addPanel({ id, url: safeUrl, width: 520 })
  })

  ipcMain.handle(IPC_CHANNELS.PANEL_REMOVE, (_event, panelId: string) => {
    removePanel(panelId)
    return getPanelInfoList()
  })

  ipcMain.handle(IPC_CHANNELS.PANEL_TOGGLE, (_event, panelId: string) => {
    return togglePanel(panelId)
  })

  ipcMain.handle(IPC_CHANNELS.PANEL_NAVIGATE, (_event, panelId: string, url: string) => {
    navigatePanel(panelId, sanitizeUrl(url))
  })

  ipcMain.handle(IPC_CHANNELS.PANEL_GET_URL, (_event, panelId: string) => {
    return getPanelUrl(panelId)
  })

  // ── Resize (fire-and-forget — ipcMain.on) ──────────────────────────────────

  ipcMain.on(IPC_CHANNELS.PANEL_RESIZE, (_event, panelId: string, newWidth: number) => {
    updatePanelWidth(panelId, newWidth)
  })

  ipcMain.on(IPC_CHANNELS.PANEL_RESIZE_END, (_event, panelId: string, finalWidth: number) => {
    finalizePanelWidth(panelId, finalWidth)
  })

  // ── Roll20 ─────────────────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.ROLL20_NAVIGATE, (_event, url: string) => {
    getRoll20View().webContents.loadURL(sanitizeUrl(url))
  })

  ipcMain.handle(IPC_CHANNELS.ROLL20_GET_URL, () => {
    return getRoll20View().webContents.getURL()
  })

  // ── Beyond20 ──────────────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.BEYOND20_STATUS, () => {
    return getBeyond20Status()
  })

  // ── Window controls ────────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    getMainWindow().minimize()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    const win = getMainWindow()
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => {
    getMainWindow().close()
  })
}
