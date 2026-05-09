import { BrowserWindow, WebContentsView, session, shell } from "electron";
import { join } from "path";
import { store } from "./store";
import { IPC_CHANNELS } from "../shared/ipcChannels";
import { pushEvent } from "./ipc/emitter";
import { isHttpUrl } from "../shared/utils";
import {
  TOOLBAR_HEIGHT,
  RESIZE_HANDLE_WIDTH,
  MIN_PANEL_WIDTH,
  MAX_PANEL_WIDTH_FRACTION,
  PANEL_OFFSCREEN_MARGIN,
  WINDOW_DEFAULT_WIDTH,
  WINDOW_DEFAULT_HEIGHT,
  MIN_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  DEFAULT_ROLL20_URL,
} from "../shared/constants";
import type { PanelConfig, PanelInfo } from "../shared/types";

// ─── Internal state ──────────────────────────────────────────────────────────

/**
 * Internal runtime state for a panel — lives in the main process only.
 * Contains the live WebContentsView alongside config/display data.
 * See PanelInfo (shared/types.ts) for the serialisable form sent to the renderer.
 */
interface PanelState {
  id: string;
  view: WebContentsView;
  title: string;
  url: string;
  width: number;
}

const panelMap = new Map<string, PanelState>();

/**
 * ID of the currently open (animated into view) panel, or null when all panels
 * are closed. Only one panel can be active at a time; others are hidden off-screen.
 */
let activePanelId: string | null = null;
let resizeHandleView: WebContentsView | null = null;
let mainWindow: BrowserWindow | null = null;
let roll20View: WebContentsView | null = null;
let animationTimer: ReturnType<typeof setInterval> | null = null;

const ANIM_DURATION_MS = 220;
const ANIM_FPS = 60;

function clearAnimationTimer(): void {
  if (animationTimer !== null) {
    clearInterval(animationTimer);
    animationTimer = null;
  }
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

/** Clamp rawWidth to [MIN_PANEL_WIDTH, 80% of window width]. */
function constrainPanelWidth(rawWidth: number, winWidth: number): number {
  return Math.max(
    MIN_PANEL_WIDTH,
    Math.min(rawWidth, Math.floor(winWidth * MAX_PANEL_WIDTH_FRACTION)),
  );
}

/** Height of the area below the toolbar. */
function contentHeight(winHeight: number): number {
  return Math.max(0, winHeight - TOOLBAR_HEIGHT);
}

// ─── Public accessors ─────────────────────────────────────────────────────────

export function getMainWindow(): BrowserWindow {
  if (!mainWindow) throw new Error("Main window not yet created");
  return mainWindow;
}

export function getRoll20View(): WebContentsView {
  if (!roll20View) throw new Error("Roll20 view not yet created");
  return roll20View;
}

export function getResizeHandleView(): WebContentsView | null {
  return resizeHandleView;
}

// ─── Security helpers ─────────────────────────────────────────────────────────

/**
 * Returns the shared webPreferences for all content WebContentsViews.
 * Called as a function (not a module-level constant) because
 * `session.defaultSession` must be read after `app.ready`.
 */
function contentViewWebPrefs(): Electron.WebPreferences {
  return {
    session: session.defaultSession,
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
  };
}

/** Block non-http(s) navigations and redirect popup windows to the system browser. */
function applyContentViewSecurity(view: WebContentsView, label: string): void {
  view.webContents.on("will-navigate", (event, url) => {
    if (!isHttpUrl(url)) {
      console.warn(`[Security] ${label} blocked navigation to:`, url);
      event.preventDefault();
    }
  });
  view.webContents.setWindowOpenHandler(({ url }) => {
    safeOpenExternal(url);
    return { action: "deny" };
  });
}

/**
 * Open a URL in the system browser, but only if it is a well-formed http/https URL.
 * Blocks file://, javascript:, custom protocol handlers, and malformed strings.
 */
function safeOpenExternal(url: string): void {
  if (isHttpUrl(url)) {
    void shell.openExternal(url);
  } else {
    console.warn(
      "[Security] Blocked non-http(s) URL from shell.openExternal:",
      url,
    );
  }
}

export function getPanelInfoList(): PanelInfo[] {
  return Array.from(panelMap.values()).map(panelStateToInfo);
}

// ─── Panel management ─────────────────────────────────────────────────────────

export function addPanel(config: PanelConfig): PanelInfo {
  if (panelMap.has(config.id)) {
    throw new Error(`Panel ${config.id} already exists`);
  }

  const view = createPanelView(config.id, config.url);
  const state: PanelState = {
    id: config.id,
    view,
    title: config.url,
    url: config.url,
    width: config.width,
  };
  panelMap.set(config.id, state);

  if (mainWindow && resizeHandleView) {
    // Keep resize handle last (highest z-order)
    mainWindow.contentView.removeChildView(resizeHandleView);
    mainWindow.contentView.addChildView(view);
    mainWindow.contentView.addChildView(resizeHandleView);
  } else if (mainWindow) {
    mainWindow.contentView.addChildView(view);
  }

  hidePanel(state);
  savePanelConfigs();
  return panelStateToInfo(state);
}

export function removePanel(id: string): void {
  if (id === activePanelId) {
    // Don't run the close animation — the view is about to be destroyed.
    // Immediately reset active state instead to avoid the animation timer
    // calling setBounds on a closed WebContentsView.
    activePanelId = null;
    clearAnimationTimer();
    hideResizeHandle();
  }
  const state = panelMap.get(id);
  if (!state) return;
  panelMap.delete(id);
  if (mainWindow) {
    mainWindow.contentView.removeChildView(state.view);
  }
  state.view.webContents.close();
  savePanelConfigs();
  sendPanelListUpdate();
}

export function togglePanel(id: string): PanelInfo[] {
  const panel = panelMap.get(id);
  if (!panel) return getPanelInfoList();

  if (activePanelId === id) {
    closeActivePanel();
  } else {
    if (activePanelId !== null) {
      const current = panelMap.get(activePanelId);
      if (current) hidePanel(current);
    }
    activePanelId = id;
    animatePanel(id, true);
  }
  return getPanelInfoList();
}

export function navigatePanel(id: string, url: string): void {
  const state = panelMap.get(id);
  if (!state) return;
  state.url = url;
  void state.view.webContents.loadURL(url);
}

export function getPanelUrl(id: string): string {
  const state = panelMap.get(id);
  return state ? state.view.webContents.getURL() : "";
}

/** Called during drag — immediately reposition panel view for smooth feedback. */
export function updatePanelWidth(id: string, rawWidth: number): void {
  if (!mainWindow) return;
  const state = panelMap.get(id);
  if (!state || activePanelId !== id) return;

  const [winWidth, winHeight] = mainWindow.getContentSize();
  const w = constrainPanelWidth(rawWidth, winWidth);
  state.width = w;
  state.view.setBounds({
    x: 0,
    y: TOOLBAR_HEIGHT,
    width: w,
    height: contentHeight(winHeight),
  });
}

/** Expand the resize handle view to full window width so mousemove covers everything. */
export function startPanelDrag(): void {
  if (!mainWindow || !resizeHandleView) return;
  const [winWidth, winHeight] = mainWindow.getContentSize();
  resizeHandleView.setBounds({
    x: 0,
    y: TOOLBAR_HEIGHT,
    width: winWidth,
    height: contentHeight(winHeight),
  });
}

/** Finalize width on drag end and shrink the handle view back to 8px. */
export function endPanelDrag(id: string, rawWidth: number): void {
  if (!mainWindow) return;
  const state = panelMap.get(id);
  if (!state) return;

  const [winWidth, winHeight] = mainWindow.getContentSize();
  const w = constrainPanelWidth(rawWidth, winWidth);
  state.width = w;

  const panelH = contentHeight(winHeight);

  if (activePanelId === id) {
    state.view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width: w, height: panelH });
    repositionResizeHandle(w, panelH);
    // Tell handle renderer the new width for next drag
    resizeHandleView?.webContents.send(IPC_CHANNELS.RESIZE_HANDLE_INIT, id, w);
  }

  savePanelConfigs();
  sendPanelListUpdate();
}

// ─── Window creation ──────────────────────────────────────────────────────────

export function createWindowWithPanels(): BrowserWindow {
  const win = new BrowserWindow({
    width: WINDOW_DEFAULT_WIDTH,
    height: WINDOW_DEFAULT_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    frame: false,
    backgroundColor: "#1a1a2e",
    titleBarStyle: "hidden",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  mainWindow = win;

  // Block any navigation away from the local index.html.
  // The toolbar renderer is a static file; it should never navigate anywhere.
  win.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });

  // Z-order: Roll20 (bottom) → panel views (middle) → resize handle (top)
  roll20View = createRoll20View(win);
  win.contentView.addChildView(roll20View);

  // Panel views will be inserted between roll20View and resizeHandleView as they're created
  loadPersistedPanels(win);

  resizeHandleView = createResizeHandleView();
  win.contentView.addChildView(resizeHandleView);
  hideResizeHandle();

  setupRendererDiagnostics(win);
  layoutRoll20();
  win.on("resize", onWindowResize);
  win.on("maximize", () => {
    pushEvent(win, "window.maximizeChanged", true);
  });
  win.on("unmaximize", () => {
    pushEvent(win, "window.maximizeChanged", false);
  });
  void win.loadFile(join(__dirname, "../renderer/index.html"));

  win.on("closed", () => {
    clearAnimationTimer();
    mainWindow = null;
    roll20View = null;
    resizeHandleView = null;
    panelMap.clear();
    activePanelId = null;
  });

  return win;
}

// ─── Private: window-creation helpers ────────────────────────────────────────

/** Create and configure the Roll20 WebContentsView. */
function createRoll20View(win: BrowserWindow): WebContentsView {
  const view = new WebContentsView({ webPreferences: contentViewWebPrefs() });

  applyContentViewSecurity(view, "Roll20 view");

  const handleRoll20Navigation = (_e: unknown, url: string): void => {
    store.set("lastRoll20Url", url);
    pushEvent(win, "roll20.urlChanged", url);
  };
  view.webContents.on("did-navigate", handleRoll20Navigation);
  view.webContents.on("did-navigate-in-page", handleRoll20Navigation);

  const savedUrl = store.get("lastRoll20Url");
  void view.webContents.loadURL(
    isHttpUrl(savedUrl) ? savedUrl : DEFAULT_ROLL20_URL,
  );
  return view;
}

/** Create, configure, and load the resize-handle WebContentsView. */
function createResizeHandleView(): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, "../preload/resize-handle.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Near-zero opacity prevents the expanded drag-capture view from showing as
  // a white overlay while the user is mid-drag (Electron's default is opaque white)
  view.setBackgroundColor("rgba(0, 0, 0, 0.001)");

  const resizeHandlePath = join(__dirname, "../renderer/resize-handle.html");
  console.log("[ResizeHandle] Loading from:", resizeHandlePath);
  void view.webContents.loadFile(resizeHandlePath);
  view.webContents.on("did-finish-load", () => {
    console.log("[ResizeHandle] Loaded");
  });
  view.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[ResizeHandle] Failed to load:", url, code, desc);
  });

  return view;
}

/** Read saved panel configs from the store, create views, and add them to the window. */
function loadPersistedPanels(win: BrowserWindow): void {
  for (const config of store.get("panels")) {
    if (!isHttpUrl(config.url)) {
      console.warn(
        "[Security] Skipping persisted panel with invalid URL:",
        config.id,
      );
      continue;
    }
    const view = createPanelView(config.id, config.url);
    const state: PanelState = {
      id: config.id,
      view,
      title: config.url,
      url: config.url,
      width: config.width,
    };
    panelMap.set(config.id, state);
    win.contentView.addChildView(view);
    hidePanel(state);
  }
}

/** Wire up renderer console/crash logging on the BrowserWindow's own webContents. */
function setupRendererDiagnostics(win: BrowserWindow): void {
  win.webContents.on(
    "console-message",
    (_e, level, message, line, sourceId) => {
      const tag = ["verbose", "info", "warn", "error"][level] ?? "log";
      console.log(`[Renderer:${tag}] ${message} (${sourceId}:${line})`);
    },
  );
  win.webContents.on("render-process-gone", (_e, details) => {
    console.error("[Renderer] Process gone:", details.reason, details.exitCode);
  });
  win.webContents.on(
    "did-fail-load",
    (_e, errorCode, errorDescription, validatedURL) => {
      console.error(
        "[Renderer] Failed to load:",
        validatedURL,
        errorCode,
        errorDescription,
      );
    },
  );
  win.webContents.on("did-finish-load", () => {
    console.log("[Renderer] Loaded successfully");
  });
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function createPanelView(id: string, url: string): WebContentsView {
  const view = new WebContentsView({ webPreferences: contentViewWebPrefs() });

  applyContentViewSecurity(view, `Panel ${id}`);

  // persist=true: full-page navigations update stored URL and panel list
  // persist=false: in-page navigations (hash/pushState) only update the live URL event
  const syncPanelUrl = (newUrl: string, persist: boolean): void => {
    const state = panelMap.get(id);
    if (state) state.url = newUrl;
    if (persist) savePanelConfigs();
    pushEvent(mainWindow, "panel.urlChanged", { id, url: newUrl });
    if (persist) sendPanelListUpdate();
  };
  view.webContents.on("did-navigate", (_e, newUrl) => {
    syncPanelUrl(newUrl, true);
  });
  view.webContents.on("did-navigate-in-page", (_e, newUrl) => {
    syncPanelUrl(newUrl, false);
  });

  view.webContents.on("page-title-updated", (_e, title) => {
    const state = panelMap.get(id);
    if (state) state.title = title;
    sendPanelListUpdate();
  });

  void view.webContents.loadURL(url);
  return view;
}

function panelStateToInfo(state: PanelState): PanelInfo {
  return {
    id: state.id,
    title: state.title,
    url: state.url,
    isOpen: state.id === activePanelId,
    width: state.width,
  };
}

function hidePanel(state: PanelState): void {
  state.view.setBounds({
    x: -(state.width + PANEL_OFFSCREEN_MARGIN),
    y: TOOLBAR_HEIGHT,
    width: state.width,
    height: 0,
  });
}

function closeActivePanel(): void {
  if (activePanelId === null) return;
  const id = activePanelId;
  activePanelId = null;
  animatePanel(id, false);
}

function animatePanel(id: string, open: boolean): void {
  const state = panelMap.get(id);
  if (!mainWindow || !state) return;

  const [winWidth, winHeight] = mainWindow.getContentSize();
  const panelW = constrainPanelWidth(state.width, winWidth);
  const panelH = contentHeight(winHeight);

  const startX = open ? -panelW : 0;
  const endX = open ? 0 : -panelW;
  const startTime = Date.now();

  clearAnimationTimer();

  if (open) {
    state.view.setBounds({
      x: startX,
      y: TOOLBAR_HEIGHT,
      width: panelW,
      height: panelH,
    });
    // Position handle immediately so it's visible from frame 1
    repositionResizeHandle(startX + panelW, panelH);
  }

  animationTimer = setInterval(
    () => {
      if (!mainWindow) {
        clearAnimationTimer();
        return;
      }

      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / ANIM_DURATION_MS, 1);
      // Cubic ease-in-out: slow start, fast middle, slow end
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const x = Math.round(startX + (endX - startX) * eased);

      state.view.setBounds({
        x,
        y: TOOLBAR_HEIGHT,
        width: panelW,
        height: panelH,
      });

      if (open) {
        repositionResizeHandle(x + panelW, panelH);
      }

      if (t >= 1) {
        clearAnimationTimer();

        if (open) {
          resizeHandleView?.webContents.send(
            IPC_CHANNELS.RESIZE_HANDLE_INIT,
            id,
            panelW,
          );
          repositionResizeHandle(panelW, panelH);
        } else {
          hideResizeHandle();
        }

        sendPanelListUpdate();
      }
    },
    Math.round(1000 / ANIM_FPS),
  );
}

function repositionResizeHandle(panelRightX: number, panelH: number): void {
  resizeHandleView?.setBounds({
    x: panelRightX,
    y: TOOLBAR_HEIGHT,
    width: RESIZE_HANDLE_WIDTH,
    height: panelH,
  });
}

function hideResizeHandle(): void {
  if (!resizeHandleView) return;
  resizeHandleView.setBounds({
    x: -20,
    y: TOOLBAR_HEIGHT,
    width: RESIZE_HANDLE_WIDTH,
    height: 0,
  });
}

function layoutRoll20(): void {
  if (!mainWindow || !roll20View) return;
  const [width, height] = mainWindow.getContentSize();
  roll20View.setBounds({
    x: 0,
    y: TOOLBAR_HEIGHT,
    width,
    height: contentHeight(height),
  });
}

function onWindowResize(): void {
  if (!mainWindow) return;
  layoutRoll20();

  if (activePanelId !== null) {
    const state = panelMap.get(activePanelId);
    if (state) {
      const [winWidth, winHeight] = mainWindow.getContentSize();
      const w = constrainPanelWidth(state.width, winWidth);
      const panelH = contentHeight(winHeight);
      state.view.setBounds({
        x: 0,
        y: TOOLBAR_HEIGHT,
        width: w,
        height: panelH,
      });
      repositionResizeHandle(w, panelH);
    }
  }
}

/** Write panel id/url/width metadata to the store so they survive app restarts. */
function savePanelConfigs(): void {
  const configs = Array.from(panelMap.values()).map((p) => ({
    id: p.id,
    url: p.url,
    width: p.width,
  }));
  store.set("panels", configs);
}

function sendPanelListUpdate(): void {
  pushEvent(mainWindow, "panel.listUpdated", getPanelInfoList());
}
