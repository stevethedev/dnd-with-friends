export const IPC_CHANNELS = {
  // Panel navigation (renderer → main)
  DND_NAVIGATE: 'dnd:navigate',
  ROLL20_NAVIGATE: 'roll20:navigate',

  // Panel URL query (renderer → main)
  DND_GET_URL: 'dnd:get-url',
  ROLL20_GET_URL: 'roll20:get-url',

  // Panel URL change push (main → renderer)
  DND_URL_CHANGED: 'dnd:url-changed',
  ROLL20_URL_CHANGED: 'roll20:url-changed',

  // Beyond20 status (renderer → main)
  BEYOND20_STATUS: 'beyond20:status',

  // Beyond20 status push (main → renderer)
  BEYOND20_UPDATE: 'beyond20:update-event',

  // Window controls
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',

  // D&D Beyond overlay panel
  DND_TOGGLE_PANEL: 'dnd:toggle-panel',       // renderer → main
  DND_GET_PANEL_STATE: 'dnd:get-panel-state', // renderer → main
  DND_PANEL_STATE: 'dnd:panel-state'          // main → renderer push
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
