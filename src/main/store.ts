import Store from 'electron-store'
import type { StoreSchema } from '../shared/types'
import { DEFAULT_DND_URL, DEFAULT_ROLL20_URL } from '../shared/constants'

export const store = new Store<StoreSchema>({
  defaults: {
    beyond20Version: null,
    lastDndUrl: DEFAULT_DND_URL,
    lastRoll20Url: DEFAULT_ROLL20_URL
  }
})
