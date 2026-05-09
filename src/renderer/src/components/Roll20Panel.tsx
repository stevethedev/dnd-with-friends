import React, { useState, useEffect } from "react";
import { useRoll20Navigation } from "../hooks/useWebViewNavigation";
import { UrlBar } from "./UrlBar";

export function Roll20Panel(): React.JSX.Element {
  const { currentUrl, navigate } = useRoll20Navigation();
  const [inputValue, setInputValue] = useState(currentUrl);

  useEffect(() => {
    setInputValue(currentUrl);
  }, [currentUrl]);

  return (
    <div className="toolbar__panel">
      <span className="toolbar__panel-label">Roll20</span>
      <UrlBar
        value={inputValue}
        onChange={setInputValue}
        onGo={() => {
          navigate(inputValue);
        }}
        placeholder="https://app.roll20.net/editor/..."
        ariaLabel="Roll20 URL"
      />
    </div>
  );
}
