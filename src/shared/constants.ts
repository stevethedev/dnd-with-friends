/** Height of the toolbar in pixels. Must match .toolbar height in toolbar.css */
export const TOOLBAR_HEIGHT = 48;

/** Width of the resize handle WebContentsView in pixels */
export const RESIZE_HANDLE_WIDTH = 8;

/** Panel width constraints */
export const MIN_PANEL_WIDTH = 320;
export const MAX_PANEL_WIDTH_FRACTION = 0.8; // panels may not exceed 80% of window width
export const DEFAULT_PANEL_WIDTH = 520; // initial width for newly-created panels
/** Extra pixels used to hide a panel fully off the left edge of the screen */
export const PANEL_OFFSCREEN_MARGIN = 20;

/** BrowserWindow initial and minimum dimensions */
export const WINDOW_DEFAULT_WIDTH = 1600;
export const WINDOW_DEFAULT_HEIGHT = 900;
export const MIN_WINDOW_WIDTH = 900;
export const MIN_WINDOW_HEIGHT = 600;

/** GitHub API endpoint for latest Beyond20 release */
export const BEYOND20_GITHUB_API =
  "https://api.github.com/repos/kakaroto/Beyond20/releases/latest";

/** Default URLs loaded on first launch */
export const DEFAULT_DND_URL = "https://www.dndbeyond.com";
export const DEFAULT_ROLL20_URL = "https://roll20.net";
