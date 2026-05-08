export type Beyond20LoadStatus =
  | "idle"
  | "checking"
  | "downloading"
  | "extracting"
  | "loading"
  | "loaded"
  | "offline"
  | "error";

export interface Beyond20Status {
  status: Beyond20LoadStatus;
  version: string | null;
  error?: string;
}

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
  beyond20Version: string | null;
  lastRoll20Url: string;
  panels: PanelConfig[];
  nextPanelId: number;
}

export interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

export interface GitHubRelease {
  tag_name: string;
  assets: GitHubAsset[];
}
