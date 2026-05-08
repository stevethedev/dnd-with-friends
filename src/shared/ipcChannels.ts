/**
 * Internal channels between the main process and the resize-handle WebContentsView.
 * All other channels are defined in src/shared/ipc/api.ts.
 */
export const IPC_CHANNELS = {
  PANEL_RESIZE: "panel:resize",
  RESIZE_HANDLE_INIT: "resize-handle:init",
  RESIZE_DRAG_START: "resize:drag-start",
  RESIZE_DRAG_END: "resize:drag-end",
} as const;
