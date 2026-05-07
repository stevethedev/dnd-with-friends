import { useState, useEffect, useCallback } from 'react'

interface PanelNavigation {
  currentUrl: string
  navigate: (url: string) => void
}

export function useRoll20Navigation(): PanelNavigation {
  const [currentUrl, setCurrentUrl] = useState('')

  useEffect(() => {
    window.electronAPI.getRoll20Url().then((url) => { if (url) setCurrentUrl(url) }).catch(console.error)
    const unsub = window.electronAPI.onRoll20UrlChanged((url) => setCurrentUrl(url))
    return unsub
  }, [])

  const navigate = useCallback((url: string): void => {
    if (!url.trim()) return
    const normalized =
      url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`
    window.electronAPI.navigateRoll20(normalized).catch(console.error)
  }, [])

  return { currentUrl, navigate }
}
