import React from 'react'
import { WindowControls } from './WindowControls'
import { Beyond20Status } from './Beyond20Status'
import { Roll20Panel } from './Roll20Panel'
import { DndBeyondToggle } from './DndBeyondToggle'
import { useDndPanel } from '../hooks/useDndPanel'

export function Toolbar(): React.JSX.Element {
  const panel = useDndPanel()

  return (
    <div className="toolbar">
      <WindowControls />
      <DndBeyondToggle isOpen={panel.isOpen} onToggle={panel.toggle} />
      <Beyond20Status />
      <Roll20Panel />
    </div>
  )
}
