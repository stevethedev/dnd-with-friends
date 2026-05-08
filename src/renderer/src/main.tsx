import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/toolbar.css";

ReactDOM.createRoot(getRoot()).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

function getRoot(): HTMLElement {
  const ROOT_ID = "root";

  const root = document.getElementById(ROOT_ID);
  if (root) {
    return root;
  }

  const newRoot = document.createElement("div");
  newRoot.id = ROOT_ID;
  document.body.appendChild(newRoot);
  return newRoot;
}
