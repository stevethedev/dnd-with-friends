import { BrowserWindow, WebContentsView, net, session, shell } from "electron";
import { join } from "path";
import { store } from "./store";
import { pushEvent } from "./ipc/emitter";
import { isHttpUrl } from "../shared/utils";
import {
  TOOLBAR_HEIGHT,
  TITLE_BAR_HEIGHT,
  MIN_PANEL_WIDTH,
  MIN_PANEL_HEIGHT,
  MAX_PANEL_WIDTH_FRACTION,
  PANEL_MIN_GRAB_PX,
  DEFAULT_PANEL_HEIGHT,
  WINDOW_DEFAULT_WIDTH,
  WINDOW_DEFAULT_HEIGHT,
  MIN_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  DEFAULT_ROLL20_URL,
} from "../shared/constants";
import type {
  PanelConfig,
  PanelDisplayState,
  PanelInfo,
} from "../shared/types";

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
  height: number;
  x: number;
  y: number;
  zIndex: number;
  favicon: string | null;
  state: PanelDisplayState;
}

const panelMap = new Map<string, PanelState>();

/**
 * ID of the most recently focused panel, used to track which panel's URL
 * is shown in the toolbar URL bar.
 */
let focusedPanelId: string | null = null;
let nextZIndex = 1;
let mainWindow: BrowserWindow | null = null;
let roll20View: WebContentsView | null = null;
let overlayWindow: BrowserWindow | null = null;

/** Margin used to hide minimized panel views fully off the left edge. */
const OFFSCREEN_MARGIN = 20;

export function getMainWindow(): BrowserWindow {
  if (!mainWindow) throw new Error("Main window not yet created");
  return mainWindow;
}

export function getRoll20View(): WebContentsView {
  if (!roll20View) throw new Error("Roll20 view not yet created");
  return roll20View;
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow;
}

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

/**
 * Clamp panel bounds to keep the panel visible and respect minimum dimensions.
 * The title bar must remain at least partially on-screen so the user can grab it.
 */
function clampPanelBounds(
  x: number,
  y: number,
  w: number,
  h: number,
  winWidth: number,
  winHeight: number,
): { x: number; y: number; width: number; height: number } {
  const width = Math.max(
    MIN_PANEL_WIDTH,
    Math.min(w, Math.floor(winWidth * MAX_PANEL_WIDTH_FRACTION)),
  );
  const height = Math.max(
    MIN_PANEL_HEIGHT,
    Math.min(h, winHeight - TOOLBAR_HEIGHT),
  );
  // Keep at least PANEL_MIN_GRAB_PX of the panel title bar horizontally visible
  const clampedX = Math.max(
    -(width - PANEL_MIN_GRAB_PX),
    Math.min(x, winWidth - PANEL_MIN_GRAB_PX),
  );
  // Keep the title bar below the main toolbar
  const clampedY = Math.max(
    TOOLBAR_HEIGHT,
    Math.min(y, winHeight - TITLE_BAR_HEIGHT),
  );
  return { x: clampedX, y: clampedY, width, height };
}

/**
 * Apply the panel's current bounds to its WebContentsView.
 * Minimized panels move off-screen; open panels sit below the React title bar.
 */
function applyPanelBounds(state: PanelState): void {
  if (state.state === "minimized") {
    state.view.setBounds({
      x: -(state.width + OFFSCREEN_MARGIN),
      y: TOOLBAR_HEIGHT,
      width: state.width,
      height: 0,
    });
    return;
  }
  state.view.setBounds({
    x: state.x,
    y: state.y + TITLE_BAR_HEIGHT,
    width: state.width,
    height: Math.max(0, state.height - TITLE_BAR_HEIGHT),
  });
}

/**
 * Reorder all panel child views by ascending zIndex so the highest-zIndex panel
 * is rendered on top. Roll20 stays at the bottom and is never reordered.
 */
function reorderPanelViews(): void {
  if (!mainWindow) return;
  const sorted = Array.from(panelMap.values()).sort(
    (a, b) => a.zIndex - b.zIndex,
  );
  for (const p of sorted) {
    mainWindow.contentView.removeChildView(p.view);
  }
  for (const p of sorted) {
    mainWindow.contentView.addChildView(p.view);
  }
}

/** Find the open panel with the highest zIndex (the visually top panel). */
function findHighestZPanel(): PanelState | undefined {
  let best: PanelState | undefined;
  for (const s of panelMap.values()) {
    if (s.state === "open" && (!best || s.zIndex > best.zIndex)) {
      best = s;
    }
  }
  return best;
}

export function getPanelInfoList(): PanelInfo[] {
  return Array.from(panelMap.values()).map(panelStateToInfo);
}

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
    height: config.height,
    x: config.x,
    y: config.y,
    zIndex: nextZIndex++,
    favicon: null,
    state: "open",
  };
  panelMap.set(config.id, state);

  if (mainWindow) {
    mainWindow.contentView.addChildView(view);
  }

  applyPanelBounds(state);
  focusedPanelId = config.id;
  savePanelConfigs();
  return panelStateToInfo(state);
}

export function removePanel(id: string): void {
  const state = panelMap.get(id);
  if (!state) return;
  panelMap.delete(id);
  if (mainWindow) {
    mainWindow.contentView.removeChildView(state.view);
  }
  state.view.webContents.close();
  if (focusedPanelId === id) {
    focusedPanelId = findHighestZPanel()?.id ?? null;
  }
  savePanelConfigs();
  sendPanelListUpdate();
}

export function minimizePanel(id: string): PanelInfo[] {
  const state = panelMap.get(id);
  if (!state) return getPanelInfoList();
  state.state = "minimized";
  applyPanelBounds(state);
  if (focusedPanelId === id) {
    focusedPanelId = findHighestZPanel()?.id ?? null;
  }
  sendPanelListUpdate();
  return getPanelInfoList();
}

export function restorePanel(id: string): PanelInfo[] {
  const state = panelMap.get(id);
  if (!state) return getPanelInfoList();
  state.state = "open";
  applyPanelBounds(state);
  return focusPanel(id);
}

export function focusPanel(id: string): PanelInfo[] {
  const state = panelMap.get(id);
  if (!state) return getPanelInfoList();
  state.zIndex = nextZIndex++;
  focusedPanelId = id;
  reorderPanelViews();
  sendPanelListUpdate();
  return getPanelInfoList();
}

/**
 * Update the panel's logical position.
 */
export function movePanelView(id: string, x: number, y: number): void {
  if (!mainWindow) return;
  const state = panelMap.get(id);
  if (!state || state.state !== "open") return;
  const [winWidth, winHeight] = mainWindow.getContentSize();
  const clamped = clampPanelBounds(
    x,
    y,
    state.width,
    state.height,
    winWidth,
    winHeight,
  );
  state.x = clamped.x;
  state.y = clamped.y;
  // Always broadcast so sibling panels' clip-paths stay accurate during drag.
  // applyPanelBounds (WebContentsView setBounds) is deferred to commit-only to
  // prevent rapid setBounds calls from blanking the Chromium compositor.
  sendPanelListUpdate();
  applyPanelBounds(state);
}

/**
 * Update the panel's logical size. Same commit semantics as movePanelView —
 * setBounds is only called on the final frame to avoid compositor blanking.
 */
export function resizePanelView(
  id: string,
  width: number,
  height: number,
  commit: boolean,
): void {
  if (!mainWindow) return;
  const state = panelMap.get(id);
  if (!state || state.state !== "open") return;
  const [winWidth, winHeight] = mainWindow.getContentSize();
  const clamped = clampPanelBounds(
    state.x,
    state.y,
    width,
    height,
    winWidth,
    winHeight,
  );
  state.width = clamped.width;
  state.height = clamped.height;
  // Same broadcast-always / apply-on-commit semantics as movePanelView.
  sendPanelListUpdate();
  if (commit) {
    applyPanelBounds(state);
  }
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

/** Fetch a favicon URL and store it as a base64 data URL in the panel state. */
async function captureFavicon(id: string, faviconUrl: string): Promise<void> {
  const state = panelMap.get(id);
  if (!state) return;
  try {
    // data: URLs can be used directly without fetching
    if (faviconUrl.startsWith("data:")) {
      state.favicon = faviconUrl;
      sendPanelListUpdate();
      return;
    }
    const response = await net.fetch(faviconUrl);
    if (!response.ok) return;
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") ?? "image/png";
    const base64 = Buffer.from(buffer).toString("base64");
    state.favicon = `data:${contentType};base64,${base64}`;
    sendPanelListUpdate();
  } catch {
    // Favicon fetch is best-effort; leave as null on failure
  }
}

/**
 * Create a transparent frameless child BrowserWindow that renders the panel
 * overlay chrome (title bars, resize handles) above all WebContentsViews.
 * Uses setIgnoreMouseEvents(true, { forward: true }) by default so clicks pass
 * through to the underlying views; the overlay renderer toggles this off when
 * the cursor is over interactive elements.
 */
function createOverlayWindow(parent: BrowserWindow): BrowserWindow {
  const bounds = parent.getBounds();
  const overlay = new BrowserWindow({
    parent,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  overlay.setIgnoreMouseEvents(true, { forward: true });
  void overlay.loadFile(join(__dirname, "../renderer/overlay.html"));
  return overlay;
}

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
  win.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });

  // Z-order: Roll20 (bottom) → panel views (stacked by zIndex)
  roll20View = createRoll20View(win);
  win.contentView.addChildView(roll20View);

  loadPersistedPanels(win);

  overlayWindow = createOverlayWindow(win);

  // Use getContentBounds() (not getBounds()) so the overlay's content area
  // exactly matches the main window's content area. On Windows, maximized /
  // fullscreen frameless windows have an invisible resize border that makes
  // getBounds() extend outside the screen edge — setContentBounds avoids that.
  const syncOverlayBounds = (): void => {
    if (!overlayWindow || !mainWindow) return;
    overlayWindow.setContentBounds(mainWindow.getContentBounds());
  };
  win.on("resize", syncOverlayBounds);
  win.on("move", syncOverlayBounds);

  setupRendererDiagnostics(win);
  layoutRoll20();

  // Debounce onWindowResize so that rapid `resize` events during fullscreen
  // animations (or OS-driven maximize) don't trigger dozens of setBounds calls
  // on every WebContentsView — those rapid calls blank the Chromium compositor.
  // The debounce is cancelled and onWindowResize called immediately whenever a
  // fullscreen or maximize transition signals its final state.
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedResize = (): void => {
    if (resizeTimer !== null) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      onWindowResize();
    }, 50);
  };
  win.on("resize", debouncedResize);

  win.on("maximize", () => {
    pushEvent(win, "window.maximizeChanged", true);
  });
  win.on("unmaximize", () => {
    pushEvent(win, "window.maximizeChanged", false);
  });

  // After a fullscreen or maximize transition the window has its final size.
  // Cancel any pending debounced resize and run the layout immediately so
  // views snap to the correct bounds as soon as the animation completes.
  const onFullScreenChange = (): void => {
    if (resizeTimer !== null) {
      clearTimeout(resizeTimer);
      resizeTimer = null;
    }
    syncOverlayBounds();
    onWindowResize();
  };
  win.on("enter-full-screen", onFullScreenChange);
  win.on("leave-full-screen", onFullScreenChange);
  win.on("maximize", onFullScreenChange);
  win.on("unmaximize", onFullScreenChange);
  void win.loadFile(join(__dirname, "../renderer/index.html"));

  win.on("closed", () => {
    mainWindow = null;
    roll20View = null;
    overlayWindow = null;
    panelMap.clear();
    focusedPanelId = null;
  });

  return win;
}

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

/** Read saved panel configs from the store, create views, and add them to the window. */
function loadPersistedPanels(win: BrowserWindow): void {
  for (const raw of store.get("panels")) {
    if (!isHttpUrl(raw.url)) {
      console.warn(
        "[Security] Skipping persisted panel with invalid URL:",
        raw.id,
      );
      continue;
    }
    // Migration: old configs lack x/y/height — apply defaults
    const config: PanelConfig = {
      id: raw.id,
      url: raw.url,
      width: raw.width,
      height: (raw as { height?: number }).height ?? DEFAULT_PANEL_HEIGHT,
      x: (raw as { x?: number }).x ?? 0,
      y: (raw as { y?: number }).y ?? TOOLBAR_HEIGHT,
    };
    const view = createPanelView(config.id, config.url);
    const state: PanelState = {
      id: config.id,
      view,
      title: config.url,
      url: config.url,
      width: config.width,
      height: config.height,
      x: config.x,
      y: config.y,
      zIndex: nextZIndex++,
      favicon: null,
      state: "open",
    };
    panelMap.set(config.id, state);
    win.contentView.addChildView(view);
    applyPanelBounds(state);
    focusedPanelId = config.id;
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
  view.webContents.on(
    "console-message",
    (_e, level, message, line, sourceId) => {
      const tag = ["verbose", "info", "warn", "error"][level] ?? "log";
      console.log(`[Panel(${id}):${tag}] ${message} (${sourceId}:${line})`);
    },
  );
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

  view.webContents.on("page-favicon-updated", (_e, favicons) => {
    if (favicons.length > 0) {
      void captureFavicon(id, favicons[0]);
    }
  });

  // When panel content receives focus (user clicked inside panel), bring it to front
  view.webContents.on("focus", () => {
    void focusPanel(id);
  });

  void view.webContents.loadURL(url);
  return view;
}

function panelStateToInfo(state: PanelState): PanelInfo {
  return {
    id: state.id,
    title: state.title,
    url: state.url,
    state: state.state,
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    zIndex: state.zIndex,
    favicon: state.favicon,
  };
}

function layoutRoll20(): void {
  if (!mainWindow || !roll20View) return;
  const [width, height] = mainWindow.getContentSize();
  roll20View.setBounds({
    x: 0,
    y: TOOLBAR_HEIGHT,
    width,
    height: Math.max(0, height - TOOLBAR_HEIGHT),
  });
}

function onWindowResize(): void {
  if (!mainWindow) return;
  layoutRoll20();

  const [winWidth, winHeight] = mainWindow.getContentSize();
  for (const state of panelMap.values()) {
    if (state.state === "open") {
      const clamped = clampPanelBounds(
        state.x,
        state.y,
        state.width,
        state.height,
        winWidth,
        winHeight,
      );
      state.x = clamped.x;
      state.y = clamped.y;
      state.width = clamped.width;
      state.height = clamped.height;
      applyPanelBounds(state);
    }
  }
  sendPanelListUpdate();
}

/** Write panel id/url/width/height/x/y metadata to the store so they survive app restarts. */
function savePanelConfigs(): void {
  const configs = Array.from(panelMap.values()).map((p) => ({
    id: p.id,
    url: p.url,
    width: p.width,
    height: p.height,
    x: p.x,
    y: p.y,
  }));
  store.set("panels", configs);
}

function sendPanelListUpdate(): void {
  const list = getPanelInfoList();
  pushEvent(mainWindow, "panel.listUpdated", list);
  pushEvent(overlayWindow, "panel.listUpdated", list);
}
