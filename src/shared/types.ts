export type Beyond20LoadStatus =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'extracting'
  | 'loading'
  | 'loaded'
  | 'offline'
  | 'error'

export interface Beyond20Status {
  status: Beyond20LoadStatus
  version: string | null
  error?: string
}

export interface PanelConfig {
  id: string
  url: string
  width: number
}

export interface PanelInfo {
  id: string
  title: string
  url: string
  isOpen: boolean
  width: number
}

export interface StoreSchema {
  beyond20Version: string | null
  lastRoll20Url: string
  panels: PanelConfig[]
  nextPanelId: number
}

export interface GitHubAsset {
  name: string
  browser_download_url: string
}

export interface GitHubRelease {
  tag_name: string
  assets: GitHubAsset[]
}
