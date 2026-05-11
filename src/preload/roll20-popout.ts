/**
 * Preload for WebContentsViews that host Roll20 popout pages.
 *
 * Runs synchronously before any page scripts, which lets us:
 *   1. Set window.name to the Roll20 popup identifier (e.g. "Popout-{firebaseId}")
 *      before the popout page initialises — Roll20 reads window.name on startup to
 *      know which journal/character to load.
 *   2. Install a window.opener proxy so the popout page can call
 *      window.opener.postMessage(data) and have it routed back to the Roll20
 *      main view through the main process.
 *
 * contextIsolation: false is required for this preload so that
 * Object.defineProperty targets the main world's window (the same object
 * page scripts see).  We use an IIFE to keep ipcRenderer out of global scope.
 *
 * The windowName is passed from the main process via webPreferences.additionalArguments
 * as "--roll20-window-name=<name>" and read from process.argv here.
 */
import { ipcRenderer } from "electron";

(function () {
  "use strict";

  // --- window.name ----------------------------------------------------------
  // Read the Roll20 popup identifier injected by the main process.
  const nameArg = process.argv.find((a) =>
    a.startsWith("--roll20-window-name="),
  );
  if (nameArg) {
    const wName = nameArg.slice("--roll20-window-name=".length);
    if (wName) {
      window.name = wName;
      console.log("[Roll20Popout] window.name set to:", wName);
    }
  }

  // --- window.opener --------------------------------------------------------
  // window.opener is a non-writable accessor on the Window prototype, so a
  // plain assignment silently fails.  Object.defineProperty overrides it.
  // The proxy routes popout → Roll20-main-view postMessage calls via IPC so
  // Roll20 receives the handshake data it expects from its own popout windows.
  Object.defineProperty(window, "opener", {
    configurable: true,
    enumerable: false,
    get() {
      return {
        closed: false,
        postMessage(data: unknown) {
          console.log("[Roll20Popout] window.opener.postMessage called");
          ipcRenderer.send("roll20.panelToRoll20", { data });
        },
        focus() {},
        blur() {},
      };
    },
  });

  // --- __roll20PopoutBridge -------------------------------------------------
  // Kept for any code paths that still reference it (e.g. injectRoll20PopoutOpener
  // checks hasBridge before doing anything — this ensures it exits cleanly if
  // ever called as a fallback).
  Object.defineProperty(window, "__roll20PopoutBridge", {
    configurable: true,
    enumerable: false,
    get() {
      return {
        sendToOpener(data: unknown) {
          ipcRenderer.send("roll20.panelToRoll20", { data });
        },
      };
    },
  });

  // --- DOM injection handler ------------------------------------------------
  // Roll20's onload handler does popup.document.getElementById('containerdiv')
  // .innerHTML = characterSheetHtml to inject the sheet into the popup window.
  // Our proxy captures that set and delivers it here as a message so we can
  // apply it to the real DOM element.
  window.addEventListener("message", function (e: MessageEvent) {
    if (!e.data || typeof e.data !== "object") return;
    if (e.data.__r20type === "domInject") {
      const sel = e.data.sel as string;
      const html = e.data.html as string;
      console.log("[Roll20Popout] domInject →", sel, "len:", (html || "").length);
      const el = document.querySelector(sel);
      if (el) {
        el.innerHTML = html;
        // Roll20 hides injected root elements and expects to call .show() on
        // the popup proxy — our IPC bridge doesn't forward that call.
        // Strip inline display:none from direct children only so the content
        // becomes visible without disturbing intentionally-hidden descendants.
        for (const child of Array.from(el.children) as HTMLElement[]) {
          if (child.style.display === "none") {
            child.style.removeProperty("display");
          }
        }
        console.log("[Roll20Popout] domInject applied to", sel);
      } else {
        console.warn("[Roll20Popout] domInject: element not found:", sel);
      }
    }
  });

  // Inject CSS overrides needed for popout panels.
  // Roll20's .dialog elements start hidden and are normally shown by the opener;
  // since our bridge doesn't forward .show() calls, force them visible here.
  // Must wait for DOMContentLoaded because document.head is null when the
  // preload first runs (the HTML parser hasn't created <head> yet).
  const injectPopoutStyles = (): void => {
    const target = document.head ?? document.documentElement;
    if (!target) return;
    const style = document.createElement("style");
    style.textContent = ".dialog { display: block }";
    target.appendChild(style);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectPopoutStyles);
  } else {
    injectPopoutStyles();
  }

  console.log("[Roll20Popout] Preload ready — opener, bridge, and domInject handler installed");
})();
