import type { Beyond20Status, PanelInfo } from '../../../shared/types'

interface ElectronAPI {
  // Panel management
  listPanels: () => Promise<PanelInfo[]>
  createPanel: (url: string) => Promise<PanelInfo>
  removePanel: (panelId: string) => Promise<PanelInfo[]>
  togglePanel: (panelId: string) => Promise<PanelInfo[]>
  navigatePanel: (panelId: string, url: string) => Promise<void>
  getPanelUrl: (panelId: string) => Promise<string>
  onPanelListUpdated: (cb: (panels: PanelInfo[]) => void) => () => void
  onPanelUrlChanged: (cb: (panelId: string, url: string) => void) => () => void

  // Roll20
  navigateRoll20: (url: string) => Promise<void>
  getRoll20Url: () => Promise<string>
  onRoll20UrlChanged: (cb: (url: string) => void) => () => void

  // Window controls
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>

  // Beyond20
  getBeyond20Status: () => Promise<Beyond20Status>
  onBeyond20Update: (cb: (status: Beyond20Status) => void) => () => void
}

interface ResizeAPI {
  onInit: (cb: (panelId: string, currentWidth: number) => void) => () => void
  startDrag: (panelId: string) => void
  resize: (panelId: string, newWidth: number) => void
  endDrag: (panelId: string, finalWidth: number) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
    resizeAPI: ResizeAPI
  }
}

export {}
