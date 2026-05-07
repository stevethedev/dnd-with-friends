import type { Beyond20Status } from '../../../shared/types'

interface ElectronAPI {
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  navigateDnd: (url: string) => Promise<void>
  navigateRoll20: (url: string) => Promise<void>
  getDndUrl: () => Promise<string>
  getRoll20Url: () => Promise<string>
  onDndUrlChanged: (cb: (url: string) => void) => () => void
  onRoll20UrlChanged: (cb: (url: string) => void) => () => void
  getBeyond20Status: () => Promise<Beyond20Status>
  onBeyond20Update: (cb: (status: Beyond20Status) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
