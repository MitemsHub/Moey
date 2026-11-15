import { Link } from 'react-router'

import { cx } from '../lib/cx'
import { relativeTime } from '../lib/format'
import type { HealthStrip as Health } from '../../shared/types'

const dot: Record<string, string> = {
  ok: 'bg-success',
  idle: 'bg-faint',
  degraded: 'bg-warning',
  failing: 'bg-danger',
  unconfigured: 'bg-line-strong',
}

const label: Record<string, string> = {
  ok: 'current',
  idle: 'ready, not yet run',
  degraded: 'partial',
  failing: 'failing',
  unconfigured: 'not configured',
}

/**
 * The one surface that is always visible. A discovery product fails silently when
 * a source stops returning results — you cannot tell "no news" from "broken".
 * This strip exists so that distinction is never more than a glance away.
 */
export function HealthStrip({ health }: { health: Health | undefined }) {
  if (!health) {
    return (
      <div className="flex h-10 items-center gap-3 border-b border-line px-4">
        <span className="tnum text-[11px] uppercase tracking-[0.14em] text-faint">Sources</span>
        <span className="text-[12px] text-faint">checking…</span>
      </div>
    )
  }

  const attention = health.attentionCount > 0

  return (
    <div className="relative flex h-10 items-center gap-4 overflow-x-auto border-b border-line px-4 scrollbar-thin">
      <Link
        to="/sources"
        className="flex shrink-0 items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-fg"
      >
        Sources
        <span className={cx('tnum rounded-[3px] px-1 text-[10px]', attention ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success')}>
          {health.okCount}/{health.sources.length} live
        </span>
      </Link>

      <span aria-hidden className="h-4 w-px shrink-0 bg-line" />

      <ul className="flex items-center gap-3.5">
        {health.sources.map((source) => (
          <li key={source.id} className="group flex shrink-0 items-center gap-1.5">
            <span className={cx('round size-1.5 rounded-full', dot[source.health])} aria-hidden />
            <span className="text-[12px] text-muted">{source.label}</span>
            <span className="sr-only">{label[source.health]}</span>
            {source.lastRunAt && (
              <span className="tnum hidden text-[10.5px] text-faint xl:inline">{relativeTime(source.lastRunAt)}</span>
            )}
          </li>
        ))}
      </ul>

      <span className="ml-auto shrink-0 whitespace-nowrap text-[11.5px] text-faint">
        {health.lastScanAt ? `Last scan ${relativeTime(health.lastScanAt)}` : 'No scan yet'}
      </span>
    </div>
  )
}
