import React, { useRef, useState } from 'react'
import type { PanelInfo } from '../../../shared/types'

interface Props {
  panel: PanelInfo
}

const MIN_WIDTH = 320

export function ResizeHandle({ panel }: Props): React.JSX.Element {
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)
  const [dragging, setDragging] = useState(false)
  // Local width state for immediate visual feedback during drag
  const [dragWidth, setDragWidth] = useState<number | null>(null)

  const displayWidth = dragWidth ?? panel.width

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    startXRef.current = e.screenX
    startWidthRef.current = panel.width
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const w = Math.max(MIN_WIDTH, startWidthRef.current + (e.screenX - startXRef.current))
    setDragWidth(w)
    window.electronAPI.resizePanel(panel.id, w)
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const w = Math.max(MIN_WIDTH, startWidthRef.current + (e.screenX - startXRef.current))
    setDragWidth(null)
    setDragging(false)
    window.electronAPI.resizePanelEnd(panel.id, w)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  function onPointerCancel(e: React.PointerEvent<HTMLDivElement>): void {
    setDragWidth(null)
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  return (
    <div
      className={`resize-handle ${dragging ? 'resize-handle--dragging' : ''}`}
      style={{ left: displayWidth }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    />
  )
}
