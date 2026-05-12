import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ipc } from "../../lib/ipc/client";
import type { PanelInfo } from "../../../shared/types";
import {
  TOOLBAR_HEIGHT,
  TITLE_BAR_HEIGHT,
  PANEL_MIN_GRAB_PX,
} from "../../../shared/constants";

interface Props {
  panel: PanelInfo;
  allPanels: PanelInfo[];
  onMinimize: (id: string) => void;
  onClose: (id: string) => void;
  onFocus: (id: string) => void;
  onDragCapture: (capturing: boolean) => void;
}

// Matches .floating-panel__titlebar border-radius: 6px 6px 0 0
const TITLE_RADIUS = 6;

/**
 * Build an SVG path string for a rectangle with independent per-corner radii.
 * A radius of 0 gives a sharp corner; >0 gives a quadratic-bezier arc.
 * Corners are ordered: top-left, top-right, bottom-right, bottom-left.
 */
function roundedRectPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tl: number,
  tr: number,
  br: number,
  bl: number,
): string {
  const parts: string[] = [`M${x1 + tl} ${y1}`];
  if (tr > 0) {
    parts.push(`L${x2 - tr} ${y1}`, `Q${x2} ${y1} ${x2} ${y1 + tr}`);
  } else {
    parts.push(`L${x2} ${y1}`);
  }
  if (br > 0) {
    parts.push(`L${x2} ${y2 - br}`, `Q${x2} ${y2} ${x2 - br} ${y2}`);
  } else {
    parts.push(`L${x2} ${y2}`);
  }
  if (bl > 0) {
    parts.push(`L${x1 + bl} ${y2}`, `Q${x1} ${y2} ${x1} ${y2 - bl}`);
  } else {
    parts.push(`L${x1} ${y2}`);
  }
  if (tl > 0) {
    parts.push(`L${x1} ${y1 + tl}`, `Q${x1} ${y1} ${x1 + tl} ${y1}`);
  } else {
    parts.push(`L${x1} ${y1}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/**
 * Compute a CSS clip-path that represents this panel's visible region: its
 * full bounds (with rounded top corners) minus rectangular holes for every
 * higher-z panel that overlaps it. Uses the panel's *rendered* local position
 * so the mask stays accurate during drag/resize without waiting for an IPC
 * round-trip.
 *
 * Each hole corner is rounded only when it aligns with the overlapping panel's
 * own corner (i.e. the intersection was not clipped by this panel's boundary).
 */
function buildClipPath(
  x: number,
  y: number,
  w: number,
  h: number,
  zIndex: number,
  allPanels: PanelInfo[],
): string | undefined {
  const holes: string[] = [];

  for (const p of allPanels) {
    if (p.zIndex <= zIndex) continue;

    // Intersection of p's bounds with this panel's bounds, in local coords
    const x1 = Math.max(0, p.x - x);
    const y1 = Math.max(0, p.y - y);
    const x2 = Math.min(w, p.x + p.width - x);
    const y2 = Math.min(h, p.y + p.height - y);

    if (x2 <= x1 || y2 <= y1) continue;

    // Round a hole corner only when it sits at p's actual corner, not where
    // the intersection was clipped by this panel's edge.
    const atTop = p.y >= y;
    const atLeft = p.x >= x;
    const atRight = p.x + p.width <= x + w;

    holes.push(
      roundedRectPath(
        x1,
        y1,
        x2,
        y2,
        atTop && atLeft ? TITLE_RADIUS : 0,
        atTop && atRight ? TITLE_RADIUS : 0,
        0,
        0,
      ),
    );
  }

  if (holes.length === 0) return undefined;

  // Use SVG path() so each sub-path closes independently (M...Z M...Z).
  // polygon(evenodd) concatenates all points into one polygon, which draws
  // diagonal connecting edges between the outer rect and each hole — causing
  // triangular/trapezoidal fill artifacts. path() avoids that entirely.
  const outer = roundedRectPath(0, 0, w, h, TITLE_RADIUS, TITLE_RADIUS, 0, 0);
  return `path(evenodd, "${outer} ${holes.join(" ")}")`;
}

/**
 * Mirror the clamping logic from windowManager.ts clampPanelBounds so the
 * HTML chrome never drifts outside the allowed viewport region during a drag.
 * Only x/y are clamped here; width/height are handled by the resize handler.
 */
function clampDragPosition(
  x: number,
  y: number,
  width: number,
): { x: number; y: number } {
  const winWidth = window.innerWidth;
  const winHeight = window.innerHeight;
  return {
    x: Math.max(
      -(width - PANEL_MIN_GRAB_PX),
      Math.min(x, winWidth - PANEL_MIN_GRAB_PX),
    ),
    y: Math.max(TOOLBAR_HEIGHT, Math.min(y, winHeight - TITLE_BAR_HEIGHT)),
  };
}

export function FloatingPanel({
  panel,
  allPanels,
  onMinimize,
  onClose,
  onFocus,
  onDragCapture,
}: Props): React.JSX.Element {
  const isDragging = useRef(false);
  const isResizing = useRef<"e" | "s" | "se" | null>(null);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, panelX: 0, panelY: 0 });
  const resizeStart = useRef({ mouseX: 0, mouseY: 0, width: 0, height: 0 });
  const rafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  // Local state for optimistic positioning during drag/resize
  const [localX, setLocalX] = useState(panel.x);
  const [localY, setLocalY] = useState(panel.y);
  const [localW, setLocalW] = useState(panel.width);
  const [localH, setLocalH] = useState(panel.height);

  // Sync local state from props when not actively dragging/resizing
  useEffect(() => {
    if (!isDragging.current && !isResizing.current) {
      setLocalX(panel.x);
      setLocalY(panel.y);
      setLocalW(panel.width);
      setLocalH(panel.height);
    }
  }, [panel.x, panel.y, panel.width, panel.height]);

  // Clip this panel's chrome to its visible region: full bounds minus rectangular
  // holes for every higher-z panel that currently overlaps it. Computed from the
  // rendered local position so it remains accurate during drag/resize.
  const clipPath = useMemo(
    () =>
      buildClipPath(localX, localY, localW, localH, panel.zIndex, allPanels),
    [localX, localY, localW, localH, panel.zIndex, allPanels],
  );
  const handleTitleBarMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      onFocus(panel.id);
      isDragging.current = true;
      dragStart.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        panelX: localX,
        panelY: localY,
      };
      onDragCapture(true);

      const onMove = (ev: MouseEvent): void => {
        const dx = ev.clientX - dragStart.current.mouseX;
        const dy = ev.clientY - dragStart.current.mouseY;
        const { x: newX, y: newY } = clampDragPosition(
          dragStart.current.panelX + dx,
          dragStart.current.panelY + dy,
          localW,
        );
        setLocalX(newX);
        setLocalY(newY);
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          void ipc.panels.move({ id: panel.id, x: newX, y: newY });
        });
      };

      const onUp = (ev: MouseEvent): void => {
        isDragging.current = false;
        onDragCapture(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        const dx = ev.clientX - dragStart.current.mouseX;
        const dy = ev.clientY - dragStart.current.mouseY;
        const { x: finalX, y: finalY } = clampDragPosition(
          dragStart.current.panelX + dx,
          dragStart.current.panelY + dy,
          localW,
        );
        void ipc.panels.move({
          id: panel.id,
          x: finalX,
          y: finalY,
        });
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    // localW is needed by clampDragPosition inside onMove; include it so the
    // callback is never stale after a resize that precedes a drag.
    [panel.id, localX, localY, localW, onFocus, onDragCapture],
  );

  const startResize = useCallback(
    (e: React.MouseEvent, dir: "e" | "s" | "se") => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      onFocus(panel.id);
      isResizing.current = dir;
      resizeStart.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        width: localW,
        height: localH,
      };
      onDragCapture(true);

      const onMove = (ev: MouseEvent): void => {
        const dx = ev.clientX - resizeStart.current.mouseX;
        const dy = ev.clientY - resizeStart.current.mouseY;
        const newW =
          dir === "s"
            ? resizeStart.current.width
            : resizeStart.current.width + dx;
        const newH =
          dir === "e"
            ? resizeStart.current.height
            : resizeStart.current.height + dy;
        setLocalW(newW);
        setLocalH(newH);
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          void ipc.panels.resize({ id: panel.id, width: newW, height: newH });
        });
      };

      const onUp = (ev: MouseEvent): void => {
        isResizing.current = null;
        onDragCapture(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        const dx = ev.clientX - resizeStart.current.mouseX;
        const dy = ev.clientY - resizeStart.current.mouseY;
        void ipc.panels.resize({
          id: panel.id,
          width:
            dir === "s"
              ? resizeStart.current.width
              : resizeStart.current.width + dx,
          height:
            dir === "e"
              ? resizeStart.current.height
              : resizeStart.current.height + dy,
          final: true,
        });
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [panel.id, localW, localH, onFocus, onDragCapture],
  );

  return (
    <div
      className="floating-panel"
      style={{
        left: localX,
        top: localY,
        width: localW,
        height: localH,
        zIndex: panel.zIndex,
        clipPath,
      }}
      onMouseDown={() => {
        onFocus(panel.id);
      }}
    >
      {/* Title bar — drag handle */}
      <div
        className="floating-panel__titlebar"
        onMouseDown={handleTitleBarMouseDown}
      >
        {panel.favicon ? (
          <img
            className="floating-panel__favicon"
            src={panel.favicon}
            alt=""
            aria-hidden="true"
          />
        ) : (
          <span className="floating-panel__favicon-fallback" aria-hidden="true">
            ⚔
          </span>
        )}
        <span className="floating-panel__title" title={panel.title}>
          {panel.title}
        </span>
        <button
          className="floating-panel__btn floating-panel__btn--minimize"
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onClick={() => {
            onMinimize(panel.id);
          }}
          title="Minimize"
          aria-label="Minimize panel"
        >
          _
        </button>
        <button
          className="floating-panel__btn floating-panel__btn--close"
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onClick={() => {
            onClose(panel.id);
          }}
          title="Close"
          aria-label="Close panel"
        >
          ×
        </button>
      </div>

      {/* Transparent content area — WebContentsView sits behind this */}
      <div className="floating-panel__content" />

      {/* Resize handles */}
      <div
        className="floating-panel__resize floating-panel__resize--e"
        onMouseDown={(e) => {
          startResize(e, "e");
        }}
      />
      <div
        className="floating-panel__resize floating-panel__resize--s"
        onMouseDown={(e) => {
          startResize(e, "s");
        }}
      />
      <div
        className="floating-panel__resize floating-panel__resize--se"
        onMouseDown={(e) => {
          startResize(e, "se");
        }}
      />
    </div>
  );
}
