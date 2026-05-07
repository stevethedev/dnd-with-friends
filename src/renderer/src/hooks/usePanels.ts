import { useState, useEffect, useCallback } from 'react'
import type { PanelInfo } from '../../../shared/types'

interface PanelControl {
  panels: PanelInfo[]
  toggle: (panelId: string) => void
  createPanel: (url: string) => void
  removePanel: (panelId: string) => void
  navigatePanel: (panelId: string, url: string) => void
}

export function usePanels(): PanelControl {
  const [panels, setPanels] = useState<PanelInfo[]>([])

  useEffect(() => {
    window.electronAPI.listPanels().then(setPanels).catch(console.error)
    const unsub = window.electronAPI.onPanelListUpdated(setPanels)
    return unsub
  }, [])

  const toggle = useCallback((panelId: string): void => {
    window.electronAPI.togglePanel(panelId).then(setPanels).catch(console.error)
  }, [])

  const createPanel = useCallback((url: string): void => {
    window.electronAPI.createPanel(url).then(() => {
      window.electronAPI.listPanels().then(setPanels).catch(console.error)
    }).catch(console.error)
  }, [])

  const removePanel = useCallback((panelId: string): void => {
    window.electronAPI.removePanel(panelId).then(setPanels).catch(console.error)
  }, [])

  const navigatePanel = useCallback((panelId: string, url: string): void => {
    const normalized =
      url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`
    window.electronAPI.navigatePanel(panelId, normalized).catch(console.error)
  }, [])

  return { panels, toggle, createPanel, removePanel, navigatePanel }
}
