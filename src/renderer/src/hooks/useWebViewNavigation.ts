import { useState, useEffect, useCallback } from 'react'

type Panel = 'dnd' | 'roll20'

interface PanelNavigation {
  currentUrl: string
  navigate: (url: string) => void
}

export function useWebViewNavigation(panel: Panel): PanelNavigation {
  const [currentUrl, setCurrentUrl] = useState('')

  // Subscribe to URL-change push events from the main process
  useEffect(() => {
    const api = window.electronAPI

    // Get the initial URL
    const fetchInitial = async (): Promise<void> => {
      try {
        const url = panel === 'dnd' ? await api.getDndUrl() : await api.getRoll20Url()
        if (url) setCurrentUrl(url)
      } catch {
        // Panel may not be ready yet
      }
    }
    fetchInitial()

    // Subscribe to reactive updates
    const unsub =
      panel === 'dnd'
        ? api.onDndUrlChanged((url) => setCurrentUrl(url))
        : api.onRoll20UrlChanged((url) => setCurrentUrl(url))

    return unsub
  }, [panel])

  const navigate = useCallback(
    (url: string): void => {
      if (!url.trim()) return
      // Prepend https:// if no protocol given
      const normalized =
        url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`
      if (panel === 'dnd') {
        window.electronAPI.navigateDnd(normalized).catch(console.error)
      } else {
        window.electronAPI.navigateRoll20(normalized).catch(console.error)
      }
    },
    [panel]
  )

  return { currentUrl, navigate }
}
