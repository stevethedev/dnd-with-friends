/**
 * Internal channels between the main process and the resize-handle WebContentsView.
 * All other channels are defined in src/shared/ipc/api.ts.
 */
export enum IpcChannels {
  PanelResize = "panel:resize",
  ResizeHandleInit = "resize-handle:init",
  ResizeDragStart = "resize:drag-start",
  ResizeDragEnd = "resize:drag-end",
}
