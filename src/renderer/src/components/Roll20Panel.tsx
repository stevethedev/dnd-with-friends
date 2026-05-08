import React, { useState, useEffect } from "react";
import { useRoll20Navigation } from "../hooks/useWebViewNavigation";

export function Roll20Panel(): React.JSX.Element {
  const { currentUrl, navigate } = useRoll20Navigation();
  const [inputValue, setInputValue] = useState(currentUrl);

  useEffect(() => {
    setInputValue(currentUrl);
  }, [currentUrl]);

  function handleGo(): void {
    navigate(inputValue);
  }

  return (
    <div className="toolbar__panel toolbar__panel--right">
      <span className="toolbar__panel-label">Roll20</span>
      <input
        className="toolbar__url-input"
        type="text"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleGo();
        }}
        placeholder="https://app.roll20.net/editor/..."
        aria-label="Roll20 URL"
        spellCheck={false}
      />
      <button className="toolbar__btn" onClick={handleGo} aria-label="Go">
        Go
      </button>
    </div>
  );
}
