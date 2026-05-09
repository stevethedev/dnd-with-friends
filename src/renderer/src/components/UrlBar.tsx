import React from "react";

interface UrlBarProps {
  value: string;
  onChange: (value: string) => void;
  onGo: () => void;
  placeholder?: string;
  ariaLabel?: string;
}

export function UrlBar({
  value,
  onChange,
  onGo,
  placeholder = "https://...",
  ariaLabel,
}: UrlBarProps): React.JSX.Element {
  return (
    <>
      <input
        className="toolbar__url-input"
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onGo();
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        spellCheck={false}
      />
      <button className="toolbar__btn" onClick={onGo} aria-label="Go">
        Go
      </button>
    </>
  );
}
