export const IPC_CHANNELS = {
  // Roll20 navigation
  ROLL20_NAVIGATE: 'roll20:navigate',
  ROLL20_GET_URL: 'roll20:get-url',
  ROLL20_URL_CHANGED: 'roll20:url-changed',

  // Generic overlay panels (renderer ↔ main)
  PANEL_CREATE: 'panel:create',           // (url) → panelId
  PANEL_REMOVE: 'panel:remove',           // (panelId)
  PANEL_TOGGLE: 'panel:toggle',           // (panelId) → isOpen
  PANEL_NAVIGATE: 'panel:navigate',       // (panelId, url)
  PANEL_GET_URL: 'panel:get-url',         // (panelId) → url
  PANEL_LIST: 'panel:list',              // () → PanelInfo[]

  // Main → renderer push events
  PANEL_LIST_UPDATED: 'panel:list-updated',   // PanelInfo[]
  PANEL_URL_CHANGED: 'panel:url-changed',     // (panelId, url)

  // Resize handle (fire-and-forget, resize-handle renderer → main)
  PANEL_RESIZE: 'panel:resize',           // (panelId, newWidth) — live feedback during drag

  // Resize handle view init (main → resize-handle renderer)
  RESIZE_HANDLE_INIT: 'resize-handle:init', // (panelId, currentWidth)

  // Drag lifecycle (resize-handle renderer → main)
  RESIZE_DRAG_START: 'resize:drag-start',  // (panelId) — expand view to full window
  RESIZE_DRAG_END: 'resize:drag-end',      // (panelId, finalWidth) — shrink view back

  // Beyond20 status
  BEYOND20_STATUS: 'beyond20:status',
  BEYOND20_UPDATE: 'beyond20:update-event',

  // Window controls
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
