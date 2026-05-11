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
  DEFAULT_PANEL_WIDTH,
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
 * Messages queued for panels that are still loading. Roll20 calls
 * proxy.postMessage() synchronously after window.open() returns — the panel's
 * page hasn't loaded yet at that point, so executeJavaScript would dispatch
 * into an empty context and the message would be silently dropped.
 * Queued messages are flushed in the panel's did-finish-load handler.
 */
const pendingPanelMessages = new Map<string, unknown[]>();

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

/**
 * Electron partition key shared by the Roll20 WebContentsView and all Roll20
 * popout BrowserWindows. A persist: partition survives app restarts and keeps
 * cookies / localStorage in sync across all Roll20 windows so session auth
 * (and any popout state) works without re-logging in.
 */
const ROLL20_PARTITION = "persist:roll20";

/**
 * CSP injected into every HTML document loaded in the Roll20 session
 * (both the main Roll20 WebContentsView and all Roll20 popout panels).
 * Applied via session.webRequest.onHeadersReceived so it covers external URLs
 * that we cannot modify. Intentionally omits 'unsafe-eval'; add it back only
 * if Roll20 fails to function without it.
 */
const ROLL20_CSP = [
  "default-src 'self' https:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
  "style-src 'self' 'unsafe-inline' https: data:",
  "font-src 'self' https: data:",
  "img-src 'self' https: data: blob:",
  "connect-src 'self' https: wss:",
  "media-src 'self' https: blob:",
].join("; ");

/**
 * Install a webRequest hook that replaces (or injects) the Content-Security-Policy
 * header for every HTML document response in the Roll20 session partition.
 * Scoped to mainFrame resources only — CSP is irrelevant for scripts, images, etc.
 * Must be called after app.ready and before any WebContentsView is created with
 * the Roll20 partition, so the hook is in place before the first navigation.
 */
function configureRoll20Session(): void {
  const roll20Session = session.fromPartition(ROLL20_PARTITION);
  roll20Session.webRequest.onHeadersReceived(
    { urls: ["https://*/*"] },
    (details, callback) => {
      // Only inject for HTML document loads — CSP has no effect on sub-resources.
      if (details.resourceType !== "mainFrame") {
        callback({ responseHeaders: details.responseHeaders });
        return;
      }
      // Remove any existing CSP header (case-insensitive) so we don't end up
      // with two CSP headers, which browsers merge as the intersection.
      const headers: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(
        details.responseHeaders ?? {},
      )) {
        if (key.toLowerCase() !== "content-security-policy") {
          headers[key] = value;
        }
      }
      headers["Content-Security-Policy"] = [ROLL20_CSP];
      callback({ responseHeaders: headers });
    },
  );
}

/** WebPreferences for the Roll20 WebContentsView. Uses the shared Roll20 partition. */
function roll20ContentViewWebPrefs(): Electron.WebPreferences {
  return {
    partition: ROLL20_PARTITION,
    preload: join(__dirname, "../preload/roll20.js"),
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
  };
}

/**
 * WebPreferences for WebContentsViews that host Roll20 popout pages.
 * Same partition as the main Roll20 view (shared auth cookies) plus the
 * popout-specific preload.
 *
 * contextIsolation: false is intentional — the roll20-popout preload must call
 * Object.defineProperty(window, 'opener', ...) in the main world so that
 * Roll20's page scripts find window.opener populated before they execute.
 * With contextIsolation: true the preload's window is isolated and
 * defineProperty would not affect the page's window object.
 *
 * windowName is passed via additionalArguments so the preload can set
 * window.name synchronously (before any page script reads it).
 */
function roll20PopoutPanelWebPrefs(windowName?: string): Electron.WebPreferences {
  return {
    partition: ROLL20_PARTITION,
    preload: join(__dirname, "../preload/roll20-popout.js"),
    additionalArguments: windowName ? [`--roll20-window-name=${windowName}`] : [],
    nodeIntegration: false,
    contextIsolation: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
  };
}

/**
 * Create a panel for a Roll20 /editor/popout URL, using the Roll20 partition
 * and popout preload so the panel shares session cookies with the main Roll20
 * view and can route window.opener.postMessage() calls back to it.
 *
 * windowName is the target argument from window.open(url, name, features) —
 * Roll20 uses it as a popup identifier (e.g. "JournalPopout-12345"). We inject
 * it as window.name so the popout page can read it during initialization.
 *
 * After the panel's page finishes loading, fires proxy.onload() in Roll20's
 * main-view context (via __roll20PanelCallbacks) so Roll20 knows the popup is
 * ready to receive postMessage data — the standard mechanism popup-based SPAs
 * use to delay sending init data until the popup is loaded.
 */
export function createRoll20PopoutPanel(url: string, windowName = ""): PanelInfo {
  const counter = store.get("nextPanelId");
  store.set("nextPanelId", counter + 1);
  const offset = (panelMap.size % 6) * 30;
  const panelId = `panel-${counter}`;

  // Load the real URL directly. window.name and window.opener are both set
  // synchronously by the roll20-popout preload (via additionalArguments /
  // process.argv and Object.defineProperty) before any page script executes —
  // no about:blank intermediate step is needed.
  const info = addPanel(
    {
      id: panelId,
      url,
      width: DEFAULT_PANEL_WIDTH,
      height: DEFAULT_PANEL_HEIGHT,
      x: offset,
      y: TOOLBAR_HEIGHT + offset,
    },
    roll20PopoutPanelWebPrefs(windowName),
  );
  const state = panelMap.get(info.id);
  if (state) {
    // did-finish-load: page + all sub-resources are done.
    state.view.webContents.on("did-finish-load", () => {
      console.log(`[Panel(${info.id})] did-finish-load at`, state.view.webContents.getURL());
      // Flush any postMessages Roll20 sent before the panel finished loading.
      const queue = pendingPanelMessages.get(info.id);
      if (queue && queue.length > 0) {
        console.log(`[Panel(${info.id})] Flushing ${queue.length} queued message(s)`);
        pendingPanelMessages.delete(info.id);
        for (const msg of queue) {
          dispatchMessageToPanel(state, msg);
        }
      }
      // Fire proxy.onload() in Roll20's page context if Roll20 set it.
      // Roll20 may do: var popup = window.open(...); popup.onload = fn; — waiting
      // for the popup to load before sending init data via postMessage. Since we
      // return a plain proxy object (not a real Window), we have to fire onload
      // manually. Callbacks are stored in window.__roll20PanelCallbacks by the
      // injected window.open override.
      if (roll20View) {
        void roll20View.webContents.executeJavaScript(`
          (function () {
            var callbacks = window.__roll20PanelCallbacks;
            var panelId = ${JSON.stringify(info.id)};
            if (!callbacks || !callbacks[panelId]) return;
            var cb = callbacks[panelId];
            if (typeof cb.onload === 'function') {
              console.log('[Roll20Override] Firing proxy.onload for', panelId);
              // Call with proxy as 'this' so this.document/this.postMessage
              // resolve correctly inside Roll20's onload handler.
              try { cb.onload.call(cb.proxy); } catch (e) { console.error('[Roll20Override] onload threw:', e); }
            }
          })();
        `);
      }
    });
  }
  return info;
}


/**
 * Immediately dispatch a postMessage event inside a panel's webContents.
 * Data is double-JSON-encoded so it is never interpreted as executable JS.
 * Only call this after the panel has finished loading (use sendMessageToPanel
 * for the public API — it handles queuing automatically).
 */
function dispatchMessageToPanel(state: PanelState, data: unknown): void {
  try {
    const encoded = JSON.stringify(JSON.stringify(data));
    void state.view.webContents.executeJavaScript(
      `window.dispatchEvent(new MessageEvent('message',{data:JSON.parse(${encoded}),origin:'https://app.roll20.net'}))`,
    );
  } catch {
    // data is not JSON-serialisable — skip silently
  }
}

/**
 * Send a postMessage to a panel. If the panel's page is still loading, the
 * message is queued and replayed in order once did-finish-load fires.
 * Roll20 calls proxy.postMessage() immediately after window.open() returns,
 * before the panel has navigated — queuing prevents those messages from being
 * dispatched into an empty context and silently dropped.
 */
export function sendMessageToPanel(id: string, data: unknown): void {
  const state = panelMap.get(id);
  if (!state) return;
  if (state.view.webContents.isLoading()) {
    const queue = pendingPanelMessages.get(id) ?? [];
    queue.push(data);
    pendingPanelMessages.set(id, queue);
    console.log(`[Panel(${id})] Queued message (panel still loading), queue depth: ${queue.length}`);
    return;
  }
  dispatchMessageToPanel(state, data);
}

/**
 * Dispatch a postMessage event inside the Roll20 main view's webContents.
 * Used to forward panel → Roll20 messages from the main process.
 */
export function sendMessageToRoll20View(panelId: string, data: unknown): void {
  if (!roll20View) return;
  try {
    const encoded = JSON.stringify(JSON.stringify(data));
    void roll20View.webContents.executeJavaScript(
      `window.dispatchEvent(new MessageEvent('message',{data:JSON.parse(${encoded}),origin:'https://app.roll20.net'}))`,
    );
    pushEvent(mainWindow, "roll20.panelMessage", { panelId, data });
  } catch {
    // data is not JSON-serialisable — skip silently
  }
}

/** Return the PanelState whose webContents matches the given Electron webContents id. */
export function getPanelByWebContentsId(
  webContentsId: number,
): PanelState | undefined {
  for (const state of panelMap.values()) {
    if (state.view.webContents.id === webContentsId) return state;
  }
  return undefined;
}

/**
 * Security policy for the Roll20 WebContentsView. Differs from the generic
 * applyContentViewSecurity in its window-open handling:
 *  - /editor/popout → panel with shared Roll20 session + popout preload
 *  - other http URLs → panel (same as all other views)
 *  - non-http URLs  → deny
 */
function applyRoll20Security(view: WebContentsView): void {
  view.webContents.on("will-navigate", (event, url) => {
    if (!isHttpUrl(url)) {
      console.warn("[Security] Roll20 view blocked navigation to:", url);
      event.preventDefault();
    }
  });
  view.webContents.setWindowOpenHandler(({ url }) => {
    // Only /editor/popout windows become panels — they are explicit user-facing
    // popouts that Roll20 opens via window.open and communicates with via postMessage.
    // All other window.open calls (OAuth redirects, internal navigation, etc.) are
    // denied silently; the window.open override injected by did-finish-load handles
    // popouts before setWindowOpenHandler is even reached, so this path is a fallback.
    if (isHttpUrl(url) && (url.includes("/editor/popout"))) {
      createRoll20PopoutPanel(url);
    }
    return { action: "deny" };
  });
}

/** Block non-http(s) navigations; intercept new-window requests as panels. */
function applyContentViewSecurity(view: WebContentsView, label: string): void {
  view.webContents.on("will-navigate", (event, url) => {
    if (!isHttpUrl(url)) {
      console.warn(`[Security] ${label} blocked navigation to:`, url);
      event.preventDefault();
    }
  });
  view.webContents.setWindowOpenHandler(({ url, disposition, referrer }) => {
    // Extension content scripts (e.g. Beyond20) run inside panel webContents
    // and may call window.open() for their own internal UI. Skip those — the
    // referrer frame URL starts with chrome-extension:// in that case.
    if (referrer.url.startsWith("chrome-extension://")) {
      console.log(`[Security] ${label} blocked extension window.open: ${url}`);
      return { action: "deny" };
    }
    if (!isHttpUrl(url)) return { action: "deny" };
    console.log(
      `[Security] ${label} window.open → panel: ${url} (disposition: ${disposition}, referrer: ${referrer.url})`,
    );
    createPanel(url);
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

/**
 * Allocate a persisted panel ID, compute a cascade offset so successive panels
 * don't stack exactly on top of each other, and call addPanel.
 * Used by both the IPC "panel.create" handler and the new-window interceptor.
 * webPreferences is passed through to createPanelView; omit to use the shared
 * content-view defaults.
 */
export function createPanel(
  url: string,
  webPreferences?: Electron.WebPreferences,
): PanelInfo {
  const counter = store.get("nextPanelId");
  store.set("nextPanelId", counter + 1);
  // Cascade new panels so they don't all land on the same spot.
  const offset = (panelMap.size % 6) * 30;
  return addPanel(
    {
      id: `panel-${counter}`,
      url,
      width: DEFAULT_PANEL_WIDTH,
      height: DEFAULT_PANEL_HEIGHT,
      x: offset,
      y: TOOLBAR_HEIGHT + offset,
    },
    webPreferences,
  );
}

export function addPanel(
  config: PanelConfig,
  webPreferences?: Electron.WebPreferences,
): PanelInfo {
  if (panelMap.has(config.id)) {
    throw new Error(`Panel ${config.id} already exists`);
  }

  const view = createPanelView(config.id, config.url, webPreferences);
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
  sendPanelListUpdate();
  return panelStateToInfo(state);
}

export function removePanel(id: string): void {
  const state = panelMap.get(id);
  if (!state) return;
  panelMap.delete(id);
  pendingPanelMessages.delete(id);
  if (mainWindow) {
    mainWindow.contentView.removeChildView(state.view);
  }
  state.view.webContents.close();
  if (focusedPanelId === id) {
    focusedPanelId = findHighestZPanel()?.id ?? null;
  }
  // Notify Roll20 that its popup proxy is now closed so it can clean up its
  // listener subscription and treat the popup as gone (proxy.closed === true).
  if (roll20View) {
    void roll20View.webContents.executeJavaScript(`
      (function () {
        var callbacks = window.__roll20PanelCallbacks;
        var id = ${JSON.stringify(id)};
        if (!callbacks || !callbacks[id]) return;
        var cb = callbacks[id];
        if (cb.proxy) cb.proxy.closed = true;
        // Trigger close() on the proxy to run unsub() and other cleanup,
        // but guard against recursive IPC calls by deleting the entry first.
        delete callbacks[id];
        if (typeof cb.proxy.close === 'function') {
          try { cb.proxy.close(); } catch (e) {}
        }
        console.log('[Roll20Override] proxy marked closed for panel', id);
      })();
    `);
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

  // Install the CSP hook before any Roll20 views are created so the hook is
  // active for the very first navigation.
  configureRoll20Session();

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
  const view = new WebContentsView({ webPreferences: roll20ContentViewWebPrefs() });

  applyRoll20Security(view);

  const handleRoll20Navigation = (_e: unknown, url: string): void => {
    store.set("lastRoll20Url", url);
    pushEvent(win, "roll20.urlChanged", url);
  };
  view.webContents.on("did-navigate", handleRoll20Navigation);
  view.webContents.on("did-navigate-in-page", handleRoll20Navigation);

  // Log Roll20 view console output so [Roll20Override] diagnostic messages are visible.
  view.webContents.on("console-message", (e) => {
    const tag = e.level === "warning" ? "warn" : e.level;
    console.log(`[Roll20(${tag})] ${e.message}`);
  });

  // After each full page load, patch window.open so popout URLs create panels
  // instead of new browser windows and return a postMessage-capable proxy.
  // Runs on did-finish-load (not did-navigate) so Roll20's own scripts have
  // already executed and we override into the live page context.
  view.webContents.on("did-finish-load", () => {
    void view.webContents.executeJavaScript(`
      (function () {
        var hasBridge = typeof window.__roll20Bridge !== 'undefined';
        console.log('[Roll20Override] did-finish-load — bridge:', hasBridge, 'already installed:', !!window.__roll20OpenInstalled);
        if (window.__roll20OpenInstalled || !window.__roll20Bridge) return;
        window.__roll20OpenInstalled = true;

        var _origOpen = window.open.bind(window);

        window.open = function (url, target, features) {
          console.log('[Roll20Override] window.open called:', url, '| target:', target);
          var isPopout = typeof url === 'string' && (url.includes('/editor/popout') || url.includes('/editor/character/'));
          if (isPopout) {
            var resolvedUrl = (url.indexOf('://') === -1)
              ? new URL(url, window.location.href).href
              : url;
            var windowName = typeof target === 'string' ? target : '';
            console.log('[Roll20Override] Intercepting popout, resolved URL:', resolvedUrl, 'name:', windowName);
            var panelId = window.__roll20Bridge.openPopout(
              resolvedUrl,
              windowName,
              typeof features === 'string' ? features : ''
            );
            if (!panelId) {
              console.warn('[Roll20Override] openPopout returned null, falling back to native open');
              return _origOpen(url, target, features);
            }
            console.log('[Roll20Override] Panel created, ID:', panelId);

            var unsub = window.__roll20Bridge.onPanelMessage(function (id, data) {
              if (id === panelId) {
                window.dispatchEvent(new MessageEvent('message', {
                  data: data,
                  origin: 'https://app.roll20.net',
                }));
              }
            });

            // Store per-panel callbacks so the main process can fire proxy.onload
            // after the panel's page has finished loading (did-finish-load).
            window.__roll20PanelCallbacks = window.__roll20PanelCallbacks || {};
            var _cb = { onload: null, proxy: null };
            window.__roll20PanelCallbacks[panelId] = _cb;

            var _docTitle = '';

            // Element proxy: forwards DOM mutations on the proxy popup element
            // to the real DOM inside the panel via IPC.
            //
            // ownerDocument is set to the main Roll20 view's real document so
            // jQuery's buildFragment can call ownerDocument.createDocumentFragment()
            // and parse HTML in a real DOM context before forwarding it.
            function makeElProxy(sel) {
              var _inner = '';
              var el = {};
              // jQuery requires ownerDocument for HTML parsing (createDocumentFragment).
              // Use the main view's real document — fragments built here are serialised
              // back to HTML before being sent to the panel.
              el.ownerDocument = document;
              el.nodeType = 1;
              el.nodeName = 'DIV';
              el.tagName = 'DIV';
              el.parentNode = null;
              el.childNodes = [];
              el.firstChild = null;
              el.lastChild = null;
              Object.defineProperty(el, 'innerHTML', {
                configurable: true,
                get: function() { return _inner; },
                set: function(html) {
                  _inner = html;
                  console.log('[Roll20Override] innerHTML= on "' + sel + '" len:', (html||'').length);
                  window.__roll20Bridge.sendToPanel(panelId, { __r20type: 'domInject', sel: sel, html: html });
                },
              });
              // jQuery appends a DocumentFragment built from ownerDocument above.
              // Serialise it to HTML and forward to the panel.
              el.appendChild = function(child) {
                try {
                  var tmp = document.createElement('div');
                  tmp.appendChild(child.cloneNode ? child.cloneNode(true) : child);
                  var html = tmp.innerHTML;
                  if (html) {
                    console.log('[Roll20Override] appendChild on "' + sel + '" len:', html.length);
                    window.__roll20Bridge.sendToPanel(panelId, { __r20type: 'domInject', sel: sel, html: html });
                  }
                } catch(e) { console.warn('[Roll20Override] appendChild failed:', e); }
              };
              el.insertBefore = function(child) { el.appendChild(child); };
              el.removeChild = function() { return null; };
              el.replaceChild = function(n) { el.appendChild(n); };
              el.getAttribute = function() { return null; };
              el.setAttribute = function() {};
              el.removeAttribute = function() {};
              el.hasAttribute = function() { return false; };
              el.querySelector = function() { return null; };
              el.querySelectorAll = function() { return []; };
              el.getElementsByClassName = function() { return []; };
              el.getElementsByTagName = function() { return []; };
              el.style = {};
              el.classList = { add: function(){}, remove: function(){}, contains: function(){ return false; }, toggle: function(){} };
              return el;
            }

            var proxy = {
              closed: false,
              name: windowName,
              get onload() { return _cb.onload; },
              set onload(fn) {
                console.log('[Roll20Override] proxy.onload set for panel', panelId);
                _cb.onload = fn;
              },
              postMessage: function (data, targetOrigin) {
                console.log('[Roll20Override] proxy.postMessage to panel', panelId);
                window.__roll20Bridge.sendToPanel(panelId, data);
              },
              close: function () {
                proxy.closed = true;
                delete window.__roll20PanelCallbacks[panelId];
                unsub();
                window.__roll20Bridge.closePanel(panelId);
              },
              focus: function () {},
              blur: function () {},
              // Proxy popup.document so Roll20's onload handler can inject the
              // character sheet HTML into #containerdiv via innerHTML assignment.
              // Each method returns a live element proxy that forwards writes
              // to the panel's real DOM through the IPC bridge.
              document: {
                readyState: 'complete',
                getElementById: function(id) {
                  console.log('[Roll20Override] proxy.document.getElementById:', id);
                  return makeElProxy('#' + id);
                },
                querySelector: function(sel) {
                  console.log('[Roll20Override] proxy.document.querySelector:', sel);
                  return makeElProxy(sel);
                },
                querySelectorAll: function() { return []; },
                getElementsByClassName: function() { return []; },
                createElement: function(tag) {
                  console.log('[Roll20Override] proxy.document.createElement:', tag);
                  return makeElProxy('[' + tag + ']');
                },
                get body() { return makeElProxy('body'); },
                get head() { return makeElProxy('head'); },
                get title() { return _docTitle; },
                set title(v) {
                  _docTitle = v;
                  console.log('[Roll20Override] proxy.document.title =', v);
                  window.__roll20Bridge.sendToPanel(panelId, { __r20type: 'titleSet', title: v });
                },
              },
            };
            // Store proxy reference so onload is called with correct 'this'.
            _cb.proxy = proxy;
            return proxy;
          }
          return _origOpen(url, target, features);
        };
        console.log('[Roll20Override] window.open override installed');
      })();
    `);

    // Enable popout mode: poll until currentPlayer is available (it is set
    // asynchronously after Firebase auth) then call set("usePopouts", true).
    void view.webContents.executeJavaScript(`
      (function () {
        function trySetPopouts() {
          if (window.currentPlayer && typeof window.currentPlayer.set === 'function') {
            window.currentPlayer.set('usePopouts', true);
            console.log('[Roll20Override] usePopouts set to true');
          } else {
            setTimeout(trySetPopouts, 500);
          }
        }
        trySetPopouts();
      })();
    `);
  });

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
  win.webContents.on("console-message", (e) => {
    const tag = e.level === "warning" ? "warn" : e.level;
    console.log(`[Renderer:${tag}] ${e.message} (${e.sourceId}:${e.lineNumber})`);
  });
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

function createPanelView(
  id: string,
  url: string,
  webPreferences?: Electron.WebPreferences,
): WebContentsView {
  const view = new WebContentsView({
    webPreferences: webPreferences ?? contentViewWebPrefs(),
  });

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
  view.webContents.on("console-message", (e) => {
    const tag = e.level === "warning" ? "warn" : e.level;
    console.log(`[Panel(${id}):${tag}] ${e.message} (${e.sourceId}:${e.lineNumber})`);
  });
  view.webContents.on(
    "did-fail-load",
    (_e, errorCode, errorDescription, validatedURL) => {
      console.error(
        `[Panel(${id})] Failed to load:`,
        validatedURL,
        errorCode,
        errorDescription,
      );
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
