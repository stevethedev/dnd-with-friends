import React, { useState, useEffect, KeyboardEvent } from 'react'
import { useWebViewNavigation } from '../hooks/useWebViewNavigation'

export function DndBeyondPanel(): React.JSX.Element {
  const { currentUrl, navigate } = useWebViewNavigation('dnd')
  const [inputValue, setInputValue] = useState(currentUrl)

  // Keep input in sync when the panel navigates via clicked links
  useEffect(() => {
    setInputValue(currentUrl)
  }, [currentUrl])

  function handleGo(): void {
    navigate(inputValue)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') handleGo()
  }

  return (
    <div className="toolbar__panel">
      <span className="toolbar__panel-label">D&amp;D Beyond</span>
      <input
        className="toolbar__url-input"
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="https://www.dndbeyond.com/characters/..."
        aria-label="D&D Beyond URL"
        spellCheck={false}
      />
      <button className="toolbar__btn" onClick={handleGo} aria-label="Go">
        Go
      </button>
    </div>
  )
}
