import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipcChannels'
import { getWindowRefs, setDndPanelOpen, isDndOpen } from './windowManager'
import { getBeyond20Status } from './beyond20Manager'

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

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.DND_NAVIGATE, (_event, url: string) => {
    const { dndView } = getWindowRefs()
    dndView.webContents.loadURL(sanitizeUrl(url))
  })

  ipcMain.handle(IPC_CHANNELS.ROLL20_NAVIGATE, (_event, url: string) => {
    const { roll20View } = getWindowRefs()
    roll20View.webContents.loadURL(sanitizeUrl(url))
  })

  ipcMain.handle(IPC_CHANNELS.DND_GET_URL, () => {
    const { dndView } = getWindowRefs()
    return dndView.webContents.getURL()
  })

  ipcMain.handle(IPC_CHANNELS.ROLL20_GET_URL, () => {
    const { roll20View } = getWindowRefs()
    return roll20View.webContents.getURL()
  })

  ipcMain.handle(IPC_CHANNELS.BEYOND20_STATUS, () => {
    return getBeyond20Status()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    const { win } = getWindowRefs()
    win.minimize()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    const { win } = getWindowRefs()
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => {
    const { win } = getWindowRefs()
    win.close()
  })

  ipcMain.handle(IPC_CHANNELS.DND_TOGGLE_PANEL, () => {
    setDndPanelOpen(!isDndOpen())
    return isDndOpen()
  })

  ipcMain.handle(IPC_CHANNELS.DND_GET_PANEL_STATE, () => {
    return isDndOpen()
  })
}
