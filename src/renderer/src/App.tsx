import React from "react";
import { Toolbar } from "./components/Toolbar";

/**
 * The BrowserWindow's webContents renders at full window size.
 * Only the top 48px toolbar is opaque and interactive.
 * Everything below is transparent with pointer-events:none so clicks
 * pass through to the D&D Beyond / Roll20 WebContentsViews beneath.
 */
export function App(): React.JSX.Element {
  return <Toolbar />;
}
