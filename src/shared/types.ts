/**
 * Discriminated union enforcing valid field combinations per state:
 *  - Transitional states (idle/checking) have no version yet.
 *  - Progress/success states carry the version string being installed/active.
 *  - Error state carries a required error message; version is present when the
 *    target version was already known before the failure (download/extract),
 *    null when the failure occurred before any version was resolved (API fetch).
 */
export type Beyond20Status =
  | { status: "idle" | "checking"; version: null }
  | {
      status: "downloading" | "extracting" | "loading" | "loaded" | "offline";
      version: string;
    }
  | { status: "error"; version: string | null; error: string };

/** All possible Beyond20 load-state strings, derived from the discriminated union. */
export type Beyond20LoadStatus = Beyond20Status["status"];

/** Whether a panel is floating (visible) or minimized to a toolbar tile. */
export type PanelDisplayState = "open" | "minimized";

/** Persisted panel configuration saved to the store. */
export interface PanelConfig {
  id: string;
  url: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

/**
 * Serializable panel descriptor sent to the renderer via IPC.
 * Does not contain any Electron objects; safe to cross the context bridge.
 */
export interface PanelInfo {
  id: string;
  title: string;
  url: string;
  /** Whether the panel is floating open or collapsed to a toolbar favicon tile. */
  state: PanelDisplayState;
  width: number;
  height: number;
  x: number;
  y: number;
  /** Stacking order — higher values appear in front. */
  zIndex: number;
  /** Base64 data URL of the site's favicon, or null if not yet captured. */
  favicon: string | null;
}

export interface StoreSchema {
  lastRoll20Url: string;
  panels: PanelConfig[];
  nextPanelId: number;
}
