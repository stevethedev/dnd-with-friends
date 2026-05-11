---
"dnd-with-friends": minor
---

- Roll20 popouts now open as floating in-app panels instead of separate browser windows.
- Panels support dragging, resizing, minimize/restore, z-index stacking, and persistent position/size across restarts.
- Minimized panels now appear as favicon tiles in the toolbar.
- Added favicon capture/display for panels and toolbar tiles.
- Roll20 `window.open()` is now transparently intercepted so popouts continue working normally inside embedded panels.
- Panel message delivery now queues until loading completes to avoid dropped `postMessage` events.
- Resize handling is now built directly into the floating overlay chrome.
- Added new IPC APIs for panel focus, movement, resizing, minimizing/restoring, and overlay mouse handling.
- `PanelInfo` now includes panel state, position, z-index, and favicon metadata.
- Removed the separate resize-handle window implementation.
