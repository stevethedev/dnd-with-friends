import { BrowserWindow, WebContentsView, session, shell } from 'electron'
import { join } from 'path'
import { store } from './store'
import { IPC_CHANNELS } from '../shared/ipcChannels'
import { TOOLBAR_HEIGHT, RESIZE_HANDLE_WIDTH } from '../shared/constants'
import type { PanelConfig, PanelInfo } from '../shared/types'

// ─── Internal state ──────────────────────────────────────────────────────────

interface PanelState {
  id: string
  view: WebContentsView
  title: string
  url: string
  width: number
}

const panelMap = new Map<string, PanelState>()
let activePanelId: string | null = null
let resizeHandleView: WebContentsView | null = null
let mainWindow: BrowserWindow | null = null
let roll20View: WebContentsView | null = null
let animationTimer: ReturnType<typeof setInterval> | null = null

const ANIM_DURATION_MS = 220
const ANIM_FPS = 60
const MIN_PANEL_WIDTH = 320
const MAX_PANEL_WIDTH_FRACTION = 0.80

// ─── Public accessors ─────────────────────────────────────────────────────────

export function getMainWindow(): BrowserWindow {
  if (!mainWindow) throw new Error('Main window not yet created')
  return mainWindow
}

export function getRoll20View(): WebContentsView {
  if (!roll20View) throw new Error('Roll20 view not yet created')
  return roll20View
}

export function getPanelInfoList(): PanelInfo[] {
  return Array.from(panelMap.values()).map((p) => ({
    id: p.id,
    title: p.title,
    url: p.url,
    isOpen: p.id === activePanelId,
    width: p.width
  }))
}

// ─── Panel management ─────────────────────────────────────────────────────────

export function addPanel(config: PanelConfig): PanelInfo {
  if (panelMap.has(config.id)) {
    throw new Error(`Panel ${config.id} already exists`)
  }

  const view = createPanelView(config.id, config.url)
  const state: PanelState = {
    id: config.id,
    view,
    title: config.url,
    url: config.url,
    width: config.width
  }
  panelMap.set(config.id, state)

  if (mainWindow && resizeHandleView) {
    // Keep resize handle last (highest z-order)
    mainWindow.contentView.removeChildView(resizeHandleView)
    mainWindow.contentView.addChildView(view)
    mainWindow.contentView.addChildView(resizeHandleView)
  } else if (mainWindow) {
    mainWindow.contentView.addChildView(view)
  }

  hidePanel(state)
  persistPanels()
  return panelStateToInfo(state)
}

export function removePanel(id: string): void {
  if (id === activePanelId) {
    closeActivePanel()
  }
  const state = panelMap.get(id)
  if (!state) return
  panelMap.delete(id)
  if (mainWindow) {
    mainWindow.contentView.removeChildView(state.view)
  }
  state.view.webContents.close()
  persistPanels()
}

export function togglePanel(id: string): PanelInfo[] {
  const panel = panelMap.get(id)
  if (!panel) return getPanelInfoList()

  if (activePanelId === id) {
    closeActivePanel()
  } else {
    if (activePanelId !== null) {
      const current = panelMap.get(activePanelId)
      if (current) hidePanel(current)
    }
    activePanelId = id
    animatePanel(id, true)
  }
  return getPanelInfoList()
}

export function navigatePanel(id: string, url: string): void {
  const state = panelMap.get(id)
  if (!state) return
  state.url = url
  state.view.webContents.loadURL(url)
}

export function getPanelUrl(id: string): string {
  const state = panelMap.get(id)
  return state ? state.view.webContents.getURL() : ''
}

/** Called during drag — immediately reposition panel view for smooth feedback. */
export function updatePanelWidth(id: string, rawWidth: number): void {
  if (!mainWindow) return
  const state = panelMap.get(id)
  if (!state || activePanelId !== id) return

  const [winWidth, winHeight] = mainWindow.getContentSize()
  const maxW = Math.floor(winWidth * MAX_PANEL_WIDTH_FRACTION)
  const w = Math.max(MIN_PANEL_WIDTH, Math.min(rawWidth, maxW))
  state.width = w

  const panelH = Math.max(0, winHeight - TOOLBAR_HEIGHT)
  state.view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width: w, height: panelH })
}

/** Expand the resize handle view to full window width so mousemove covers everything. */
export function startPanelDrag(id: string): void {
  if (!mainWindow || !resizeHandleView) return
  const [winWidth, winHeight] = mainWindow.getContentSize()
  resizeHandleView.setBounds({
    x: 0,
    y: TOOLBAR_HEIGHT,
    width: winWidth,
    height: Math.max(0, winHeight - TOOLBAR_HEIGHT)
  })
}

/** Finalize width on drag end and shrink the handle view back to 8px. */
export function endPanelDrag(id: string, rawWidth: number): void {
  if (!mainWindow) return
  const state = panelMap.get(id)
  if (!state) return

  const [winWidth, winHeight] = mainWindow.getContentSize()
  const maxW = Math.floor(winWidth * MAX_PANEL_WIDTH_FRACTION)
  const w = Math.max(MIN_PANEL_WIDTH, Math.min(rawWidth, maxW))
  state.width = w

  const panelH = Math.max(0, winHeight - TOOLBAR_HEIGHT)

  if (activePanelId === id) {
    state.view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width: w, height: panelH })
    repositionResizeHandle(w, panelH)
    // Tell handle renderer the new width for next drag
    resizeHandleView?.webContents.send(IPC_CHANNELS.RESIZE_HANDLE_INIT, id, w)
  }

  persistPanels()
  sendPanelListUpdate()
}

// ─── Window creation ──────────────────────────────────────────────────────────

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

  // Roll20 fills the full window below the toolbar (bottom-most layer)
  const r20 = new WebContentsView({
    webPreferences: {
      session: session.defaultSession,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // Resize handle — added last so it's always above all panel views
  const resizeHandle = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/resize-handle.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  // Transparent background so the expanded drag-capture view doesn't cover the underlying
  // panel and Roll20 WebContentsViews when the user is mid-drag.
  resizeHandle.setBackgroundColor('rgba(0, 0, 0, 0.001)')

  win.contentView.addChildView(r20)
  // Panel views will be inserted between r20 and resizeHandle as they're created

  mainWindow = win
  roll20View = r20
  resizeHandleView = resizeHandle

  // Set up Roll20
  r20.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  r20.webContents.on('did-navigate', (_e, url) => {
    store.set('lastRoll20Url', url)
    win.webContents.send(IPC_CHANNELS.ROLL20_URL_CHANGED, url)
  })
  r20.webContents.on('did-navigate-in-page', (_e, url) => {
    store.set('lastRoll20Url', url)
    win.webContents.send(IPC_CHANNELS.ROLL20_URL_CHANGED, url)
  })
  r20.webContents.loadURL(store.get('lastRoll20Url'))

  // Load saved panels
  const savedPanels = store.get('panels')
  for (const config of savedPanels) {
    const view = createPanelView(config.id, config.url)
    const state: PanelState = {
      id: config.id,
      view,
      title: config.url,
      url: config.url,
      width: config.width
    }
    panelMap.set(config.id, state)
    win.contentView.addChildView(view)
    hidePanel(state)
  }

  // Resize handle added LAST — always highest z-order (above all panels + Roll20)
  win.contentView.addChildView(resizeHandle)
  const resizeHandlePath = join(__dirname, '../renderer/resize-handle.html')
  console.log('[ResizeHandle] Loading from:', resizeHandlePath)
  resizeHandle.webContents.loadFile(resizeHandlePath)
  resizeHandle.webContents.on('did-finish-load', () => console.log('[ResizeHandle] Loaded'))
  resizeHandle.webContents.on('did-fail-load', (_e, code, desc, url) =>
    console.error('[ResizeHandle] Failed to load:', url, code, desc)
  )
  hideResizeHandle()

  layoutRoll20()
  win.on('resize', onWindowResize)

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
    if (animationTimer !== null) {
      clearInterval(animationTimer)
      animationTimer = null
    }
    mainWindow = null
    roll20View = null
    resizeHandleView = null
    panelMap.clear()
    activePanelId = null
  })

  return win
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function createPanelView(id: string, url: string): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      session: session.defaultSession,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  view.webContents.setWindowOpenHandler(({ url: u }) => {
    shell.openExternal(u)
    return { action: 'deny' }
  })

  view.webContents.on('did-navigate', (_e, newUrl) => {
    const state = panelMap.get(id)
    if (state) state.url = newUrl
    persistPanels()
    mainWindow?.webContents.send(IPC_CHANNELS.PANEL_URL_CHANGED, id, newUrl)
    sendPanelListUpdate()
  })

  view.webContents.on('did-navigate-in-page', (_e, newUrl) => {
    const state = panelMap.get(id)
    if (state) state.url = newUrl
    mainWindow?.webContents.send(IPC_CHANNELS.PANEL_URL_CHANGED, id, newUrl)
  })

  view.webContents.on('page-title-updated', (_e, title) => {
    const state = panelMap.get(id)
    if (state) state.title = title
    mainWindow?.webContents.send(IPC_CHANNELS.PANEL_TITLE_UPDATED, id, title)
    sendPanelListUpdate()
  })

  view.webContents.loadURL(url)
  return view
}

function panelStateToInfo(state: PanelState): PanelInfo {
  return {
    id: state.id,
    title: state.title,
    url: state.url,
    isOpen: state.id === activePanelId,
    width: state.width
  }
}

function hidePanel(state: PanelState): void {
  state.view.setBounds({ x: -(state.width + 20), y: TOOLBAR_HEIGHT, width: state.width, height: 0 })
}

function closeActivePanel(): void {
  if (activePanelId === null) return
  const id = activePanelId
  activePanelId = null
  animatePanel(id, false)
}

function animatePanel(id: string, open: boolean): void {
  const state = panelMap.get(id)
  if (!mainWindow || !state) return

  const [winWidth, winHeight] = mainWindow.getContentSize()
  const maxW = Math.floor(winWidth * MAX_PANEL_WIDTH_FRACTION)
  const panelW = Math.max(MIN_PANEL_WIDTH, Math.min(state.width, maxW))
  const panelH = Math.max(0, winHeight - TOOLBAR_HEIGHT)

  const startX = open ? -panelW : 0
  const endX = open ? 0 : -panelW
  const startTime = Date.now()

  if (animationTimer !== null) {
    clearInterval(animationTimer)
    animationTimer = null
  }

  if (open) {
    state.view.setBounds({ x: startX, y: TOOLBAR_HEIGHT, width: panelW, height: panelH })
    // Position handle immediately so it's visible from frame 1
    repositionResizeHandle(startX + panelW, panelH)
  }

  animationTimer = setInterval(() => {
    if (!state.view || !mainWindow) {
      clearInterval(animationTimer!)
      animationTimer = null
      return
    }

    const elapsed = Date.now() - startTime
    const t = Math.min(elapsed / ANIM_DURATION_MS, 1)
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    const x = Math.round(startX + (endX - startX) * eased)

    state.view.setBounds({ x, y: TOOLBAR_HEIGHT, width: panelW, height: panelH })

    if (open) {
      repositionResizeHandle(x + panelW, panelH)
    }

    if (t >= 1) {
      clearInterval(animationTimer!)
      animationTimer = null

      if (open) {
        resizeHandleView?.webContents.send(IPC_CHANNELS.RESIZE_HANDLE_INIT, id, panelW)
        repositionResizeHandle(panelW, panelH)
      } else {
        hideResizeHandle()
      }

      sendPanelListUpdate()
    }
  }, Math.round(1000 / ANIM_FPS))
}

function repositionResizeHandle(panelRightEdge: number, panelH: number): void {
  resizeHandleView?.setBounds({
    x: panelRightEdge,
    y: TOOLBAR_HEIGHT,
    width: RESIZE_HANDLE_WIDTH,
    height: panelH
  })
}

function hideResizeHandle(): void {
  if (!resizeHandleView) {
    throw new Error("No resize handle view")
  }
  resizeHandleView.setBounds({ x: -20, y: TOOLBAR_HEIGHT, width: RESIZE_HANDLE_WIDTH, height: 0 })
}

function layoutRoll20(): void {
  if (!mainWindow || !roll20View) return
  const [width, height] = mainWindow.getContentSize()
  const panelH = Math.max(0, height - TOOLBAR_HEIGHT)
  roll20View.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: panelH })
}

function onWindowResize(): void {
  if (!mainWindow) return
  layoutRoll20()

  if (activePanelId !== null) {
    const state = panelMap.get(activePanelId)
    if (state) {
      const [winWidth, winHeight] = mainWindow.getContentSize()
      const maxW = Math.floor(winWidth * MAX_PANEL_WIDTH_FRACTION)
      const w = Math.max(MIN_PANEL_WIDTH, Math.min(state.width, maxW))
      const panelH = Math.max(0, winHeight - TOOLBAR_HEIGHT)
      state.view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width: w, height: panelH })
      repositionResizeHandle(w, panelH)
    }
  }
}

function persistPanels(): void {
  const configs = Array.from(panelMap.values()).map((p) => ({
    id: p.id,
    url: p.url,
    width: p.width
  }))
  store.set('panels', configs)
}

function sendPanelListUpdate(): void {
  mainWindow?.webContents.send(IPC_CHANNELS.PANEL_LIST_UPDATED, getPanelInfoList())
}
