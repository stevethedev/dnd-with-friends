/** Canonical list of Beyond20 load states — Zod schema in api.ts derives from this. */
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
  lastRoll20Url: string;
  panels: PanelConfig[];
  nextPanelId: number;
}

