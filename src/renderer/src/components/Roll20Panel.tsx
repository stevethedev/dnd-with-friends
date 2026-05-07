import React, { useState, useEffect, KeyboardEvent } from 'react'
import { useWebViewNavigation } from '../hooks/useWebViewNavigation'

export function Roll20Panel(): React.JSX.Element {
  const { currentUrl, navigate } = useWebViewNavigation('roll20')
  const [inputValue, setInputValue] = useState(currentUrl)

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
    <div className="toolbar__panel toolbar__panel--right">
      <span className="toolbar__panel-label">Roll20</span>
      <input
        className="toolbar__url-input"
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="https://app.roll20.net/editor/..."
        aria-label="Roll20 URL"
        spellCheck={false}
      />
      <button className="toolbar__btn" onClick={handleGo} aria-label="Go">
        Go
      </button>
    </div>
  )
}
