const MIN_PANEL_WIDTH = 320; // canonical value: shared/constants.ts MIN_PANEL_WIDTH
let panelId: string | null = null;
let panelWidth = 0;
let isDragging = false;
let startScreenX = 0;
let startWidth = 0;
const handle = document.getElementById("handle");
if (!handle) throw new Error("Resize handle not found");

window.resizeAPI.onInit(function (pid, width) {
  panelId = pid;
  panelWidth = width;
});

// ── Drag start ──────────────────────────────────────────────────────────────
handle.addEventListener("mousedown", function (e) {
  if (e.button !== 0 || !panelId) return;
  isDragging = true;
  startScreenX = e.screenX;
  startWidth = panelWidth;

  // Pin the handle bar at its current screen position so it stays
  // visible when the view expands to cover the full window.
  handle.style.left = startWidth + "px";

  document.body.classList.add("dragging");
  window.resizeAPI.startDrag();
  e.preventDefault();
});

// ── Drag move ───────────────────────────────────────────────────────────────
document.addEventListener("mousemove", function (e) {
  if (!isDragging || !panelId) return;
  const delta = e.screenX - startScreenX;
  const newWidth = Math.max(MIN_PANEL_WIDTH, startWidth + delta);
  // Keep the visual bar tracking the drag position
  handle.style.left = newWidth + "px";
  window.resizeAPI.resize(panelId, newWidth);
});

// ── Drag end ────────────────────────────────────────────────────────────────
document.addEventListener("mouseup", function (e) {
  if (!isDragging || e.button !== 0 || !panelId) return;
  isDragging = false;
  document.body.classList.remove("dragging");

  const delta = e.screenX - startScreenX;
  const newWidth = Math.max(MIN_PANEL_WIDTH, startWidth + delta);
  panelWidth = newWidth;

  // Reset handle to fill the (now-shrunk-back) 8px view
  handle.style.left = "0";

  window.resizeAPI.endDrag(panelId, newWidth);
});
