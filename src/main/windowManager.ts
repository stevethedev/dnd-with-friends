import { BrowserWindow, WebContentsView, session, shell } from 'electron'
import { join } from 'path'
import { store } from './store'
import { IPC_CHANNELS } from '../shared/ipcChannels'
import { TOOLBAR_HEIGHT } from '../shared/constants'

let mainWindow: BrowserWindow | null = null
let dndView: WebContentsView | null = null
let roll20View: WebContentsView | null = null

export function getWindowRefs(): {
  win: BrowserWindow
  dndView: WebContentsView
  roll20View: WebContentsView
} {
  if (!mainWindow || !dndView || !roll20View) {
    throw new Error('Window refs accessed before initialization')
  }
  return { win: mainWindow, dndView, roll20View }
}

export function createWindowWithPanels(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#1a1a2e',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // D&D Beyond panel (left)
  const dndb = new WebContentsView({
    webPreferences: {
      session: session.defaultSession,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // Roll20 panel (right)
  const r20 = new WebContentsView({
    webPreferences: {
      session: session.defaultSession,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  win.contentView.addChildView(dndb)
  win.contentView.addChildView(r20)

  mainWindow = win
  dndView = dndb
  roll20View = r20

  layoutPanels()

  win.on('resize', layoutPanels)

  // Open external links from the panels in the system browser (PDFs, OAuth, etc.)
  dndb.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  r20.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Push URL changes to the renderer toolbar
  dndb.webContents.on('did-navigate', (_e, url) => {
    store.set('lastDndUrl', url)
    win.webContents.send(IPC_CHANNELS.DND_URL_CHANGED, url)
  })
  dndb.webContents.on('did-navigate-in-page', (_e, url) => {
    store.set('lastDndUrl', url)
    win.webContents.send(IPC_CHANNELS.DND_URL_CHANGED, url)
  })

  r20.webContents.on('did-navigate', (_e, url) => {
    store.set('lastRoll20Url', url)
    win.webContents.send(IPC_CHANNELS.ROLL20_URL_CHANGED, url)
  })
  r20.webContents.on('did-navigate-in-page', (_e, url) => {
    store.set('lastRoll20Url', url)
    win.webContents.send(IPC_CHANNELS.ROLL20_URL_CHANGED, url)
  })

  // Load saved URLs
  const lastDndUrl = store.get('lastDndUrl')
  const lastRoll20Url = store.get('lastRoll20Url')
  dndb.webContents.loadURL(lastDndUrl)
  r20.webContents.loadURL(lastRoll20Url)

  // Log renderer-side console messages and crashes so we can diagnose issues
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const tag = ['verbose', 'info', 'warn', 'error'][level] ?? 'log'
    console.log(`[Renderer:${tag}] ${message} (${sourceId}:${line})`)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[Renderer] Process gone:', details.reason, details.exitCode)
  })
  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    console.error('[Renderer] Failed to load:', validatedURL, errorCode, errorDescription)
  })
  win.webContents.on('did-finish-load', () => {
    console.log('[Renderer] Loaded successfully')
  })

  // Always load the renderer from the built file.
  // (electron.exe is a Windows process; it cannot reach the WSL Vite dev server)
  win.loadFile(join(__dirname, '../renderer/index.html'))

  win.on('closed', () => {
    console.log('[Window] Closed')
    mainWindow = null
    dndView = null
    roll20View = null
  })

  return win
}

function layoutPanels(): void {
  if (!mainWindow || !dndView || !roll20View) return

  const [width, height] = mainWindow.getContentSize()
  const panelHeight = Math.max(0, height - TOOLBAR_HEIGHT)
  const halfWidth = Math.floor(width / 2)

  dndView.setBounds({
    x: 0,
    y: TOOLBAR_HEIGHT,
    width: halfWidth,
    height: panelHeight
  })

  roll20View.setBounds({
    x: halfWidth,
    y: TOOLBAR_HEIGHT,
    width: width - halfWidth,
    height: panelHeight
  })
}
