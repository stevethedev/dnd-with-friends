import { BrowserWindow, WebContentsView, session, shell } from 'electron'
import { join } from 'path'
import { store } from './store'
import { IPC_CHANNELS } from '../shared/ipcChannels'
import { TOOLBAR_HEIGHT } from '../shared/constants'

let mainWindow: BrowserWindow | null = null
let dndView: WebContentsView | null = null
let roll20View: WebContentsView | null = null

let dndPanelOpen = false
let animationTimer: ReturnType<typeof setInterval> | null = null

const ANIM_DURATION_MS = 220
const ANIM_FPS = 60
// D&D Beyond overlay takes 45% of window width, min 520px
const dndPanelWidth = (winWidth: number): number => Math.max(520, Math.floor(winWidth * 0.45))

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

export function isDndOpen(): boolean {
  return dndPanelOpen
}

/** Slide the D&D Beyond overlay open or closed with an ease-in-out animation. */
export function setDndPanelOpen(open: boolean): void {
  if (!mainWindow || !dndView) return
  if (dndPanelOpen === open) return

  dndPanelOpen = open

  // Tell the toolbar about the state change
  mainWindow.webContents.send(IPC_CHANNELS.DND_PANEL_STATE, open)

  const [winWidth, winHeight] = mainWindow.getContentSize()
  const panelW = dndPanelWidth(winWidth)
  const panelH = Math.max(0, winHeight - TOOLBAR_HEIGHT)

  const startX = open ? -panelW : 0
  const endX = open ? 0 : -panelW
  const startTime = Date.now()

  if (animationTimer !== null) clearInterval(animationTimer)

  animationTimer = setInterval(() => {
    if (!dndView) {
      clearInterval(animationTimer!)
      animationTimer = null
      return
    }

    const elapsed = Date.now() - startTime
    const t = Math.min(elapsed / ANIM_DURATION_MS, 1)
    // Ease-in-out cubic
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    const x = Math.round(startX + (endX - startX) * eased)

    dndView.setBounds({ x, y: TOOLBAR_HEIGHT, width: panelW, height: panelH })

    if (t >= 1) {
      clearInterval(animationTimer!)
      animationTimer = null
    }
  }, Math.round(1000 / ANIM_FPS))
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

  // Roll20 fills the full window below the toolbar
  const r20 = new WebContentsView({
    webPreferences: {
      session: session.defaultSession,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // D&D Beyond slides in as an overlay on top of Roll20.
  // Added AFTER Roll20 so it renders above it (later = higher z-order).
  const dndb = new WebContentsView({
    webPreferences: {
      session: session.defaultSession,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  win.contentView.addChildView(r20)   // bottom layer
  win.contentView.addChildView(dndb)  // top layer (overlay)

  mainWindow = win
  dndView = dndb
  roll20View = r20

  layoutPanels()
  win.on('resize', layoutPanels)

  // Open external links from the panels in the system browser
  dndb.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  r20.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Push URL changes to the toolbar
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
  dndb.webContents.loadURL(store.get('lastDndUrl'))
  r20.webContents.loadURL(store.get('lastRoll20Url'))

  // Renderer diagnostics
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

  win.loadFile(join(__dirname, '../renderer/index.html'))

  win.on('closed', () => {
    console.log('[Window] Closed')
    if (animationTimer !== null) {
      clearInterval(animationTimer)
      animationTimer = null
    }
    mainWindow = null
    dndView = null
    roll20View = null
  })

  return win
}

function layoutPanels(): void {
  if (!mainWindow || !dndView || !roll20View) return

  const [width, height] = mainWindow.getContentSize()
  const panelH = Math.max(0, height - TOOLBAR_HEIGHT)
  const panelW = dndPanelWidth(width)

  // Roll20 always fills the full panel area
  roll20View.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: panelH })

  // D&D Beyond: off-screen left when closed, at x=0 when open
  const dndX = dndPanelOpen ? 0 : -panelW
  dndView.setBounds({ x: dndX, y: TOOLBAR_HEIGHT, width: panelW, height: panelH })
}
