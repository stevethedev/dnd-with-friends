import React from 'react'
import { DndBeyondPanel } from './DndBeyondPanel'
import { Roll20Panel } from './Roll20Panel'
import { Beyond20Status } from './Beyond20Status'
import { WindowControls } from './WindowControls'

export function Toolbar(): React.JSX.Element {
  return (
    <div className="toolbar">
      <WindowControls />
      <DndBeyondPanel />
      <Beyond20Status />
      <Roll20Panel />
    </div>
  )
}
