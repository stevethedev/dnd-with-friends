import React from 'react'
import { useBeyond20 } from '../hooks/useBeyond20'
import type { Beyond20LoadStatus } from '../../../shared/types'

const STATUS_LABELS: Record<Beyond20LoadStatus, string> = {
  idle: 'Beyond20',
  checking: 'Checking...',
  downloading: 'Downloading...',
  extracting: 'Extracting...',
  loading: 'Loading...',
  loaded: '',          // version number shown separately
  offline: 'Offline',
  error: 'Error'
}

export function Beyond20Status(): React.JSX.Element {
  const { status, version, error } = useBeyond20()

  const label =
    status === 'loaded' && version
      ? `B20 ${version}`
      : status === 'offline' && version
      ? `B20 ${version} (offline)`
      : STATUS_LABELS[status]

  const title =
    status === 'error' && error
      ? `Beyond20 error: ${error}`
      : status === 'loaded'
      ? `Beyond20 ${version ?? ''} active`
      : status === 'offline'
      ? `Beyond20 ${version ?? ''} — running from cache (offline)`
      : label

  return (
    <div className="toolbar__b20" role="status" title={title} aria-label={title}>
      <span className={`toolbar__b20-dot toolbar__b20-dot--${status}`} />
      <span className="toolbar__b20-label">{label}</span>
    </div>
  )
}
