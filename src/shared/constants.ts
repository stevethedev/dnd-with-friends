/** Height of the toolbar in pixels. Must match .toolbar height in toolbar.css */
export const TOOLBAR_HEIGHT = 48;

/** Height of the floating panel title bar. Must match .floating-panel__titlebar height in toolbar.css */
export const TITLE_BAR_HEIGHT = 32;

/** Panel width/height constraints */
export const MIN_PANEL_WIDTH = 320;
export const MIN_PANEL_HEIGHT = 200;
export const MAX_PANEL_WIDTH_FRACTION = 0.8; // panels may not exceed 80% of window width
/** Minimum horizontal pixels of a panel title bar that must remain on-screen so the user can grab it. */
export const PANEL_MIN_GRAB_PX = 80;
export const DEFAULT_PANEL_WIDTH = 520; // initial width for newly-created panels
export const DEFAULT_PANEL_HEIGHT = 600; // initial height for newly-created panels

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

/** ID of the default D&D Beyond panel created on first launch */
export const DEFAULT_PANEL_ID = "dnd";
