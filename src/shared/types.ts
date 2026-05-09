/** Canonical list of Beyond20 load states. */
export const BEYOND20_STATUSES = [
  "idle",
  "checking",
  "downloading",
  "extracting",
  "loading",
  "loaded",
  "offline",
  "error",
] as const;

export type Beyond20LoadStatus = (typeof BEYOND20_STATUSES)[number];

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

/** Persisted panel configuration saved to the store. */
export interface PanelConfig {
  id: string;
  url: string;
  width: number;
}

/**
 * Serialisable panel descriptor sent to the renderer via IPC.
 * Does not contain any Electron objects; safe to cross the context bridge.
 */
export interface PanelInfo {
  id: string;
  title: string;
  url: string;
  /** Derived at query time: true when this panel is the current activePanelId. */
  isOpen: boolean;
  width: number;
}

export interface StoreSchema {
  lastRoll20Url: string;
  panels: PanelConfig[];
  nextPanelId: number;
}
