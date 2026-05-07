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

export interface StoreSchema {
  beyond20Version: string | null
  lastDndUrl: string
  lastRoll20Url: string
}

export interface GitHubAsset {
  name: string
  browser_download_url: string
}

export interface GitHubRelease {
  tag_name: string
  assets: GitHubAsset[]
}
