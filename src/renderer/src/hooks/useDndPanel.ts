import { useState, useEffect, useCallback } from 'react'

interface DndPanelControl {
  isOpen: boolean
  toggle: () => void
}

export function useDndPanel(): DndPanelControl {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    // Sync initial state from main process
    window.electronAPI.getDndPanelState().then(setIsOpen).catch(console.error)
    // Subscribe to changes driven by main process (e.g. keyboard shortcut in future)
    const unsub = window.electronAPI.onDndPanelState(setIsOpen)
    return unsub
  }, [])

  const toggle = useCallback(() => {
    window.electronAPI.toggleDndPanel().then(setIsOpen).catch(console.error)
  }, [])

  return { isOpen, toggle }
}
