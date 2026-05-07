import React, { useState, useEffect, KeyboardEvent } from 'react'
import { useWebViewNavigation } from '../hooks/useWebViewNavigation'

interface Props {
  isOpen: boolean
  onToggle: () => void
}

export function DndBeyondToggle({ isOpen, onToggle }: Props): React.JSX.Element {
  const { currentUrl, navigate } = useWebViewNavigation('dnd')
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
    <div className="toolbar__dnd-control">
      <button
        className={`toolbar__dnd-toggle ${isOpen ? 'toolbar__dnd-toggle--open' : ''}`}
        onClick={onToggle}
        title={isOpen ? 'Close D&D Beyond panel' : 'Open D&D Beyond panel'}
        aria-label={isOpen ? 'Close D&D Beyond panel' : 'Open D&D Beyond panel'}
        aria-expanded={isOpen}
      >
        <span className="toolbar__dnd-toggle-icon">{isOpen ? '✕' : '⚔'}</span>
        <span className="toolbar__dnd-toggle-label">D&amp;D Beyond</span>
      </button>

      {isOpen && (
        <div className="toolbar__dnd-url">
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
          <button className="toolbar__btn" onClick={handleGo}>
            Go
          </button>
        </div>
      )}
    </div>
  )
}
