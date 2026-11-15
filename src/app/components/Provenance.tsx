import { AlertCircle, Check, Minus } from 'lucide-react'

import { cx } from '../lib/cx'
import { relativeTime } from '../lib/format'
import type { ProvenanceStep } from '../../shared/types'

const stateStyle = {
  done: 'border-success/40 bg-success-soft text-success',
  pending: 'border-warning/40 bg-warning-soft text-warning',
  missing: 'border-line-strong bg-surface-2 text-faint',
} as const

/**
 * The signature component. Every claim in this product reduces to "should I believe
 * this row?", and the honest answer is a chain: where it came from, when it was
 * fetched, what we did to it, how it was scored, what we decided.
 *
 * A step we cannot evidence is rendered as missing rather than omitted — silence
 * would read as success.
 */
export function ProvenanceRail({ steps }: { steps: ProvenanceStep[] }) {
  return (
    <ol className="relative flex flex-col gap-0">
      {steps.map((step, index) => {
        const Icon = step.state === 'done' ? Check : step.state === 'missing' ? Minus : AlertCircle
        const last = index === steps.length - 1
        return (
          <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
            {!last && <span aria-hidden className="absolute left-[11px] top-6 h-[calc(100%-12px)] w-px bg-line" />}
            <span
              className={cx('relative z-10 grid size-[23px] shrink-0 place-items-center rounded-full border', stateStyle[step.state])}
            >
              <Icon className="size-3" strokeWidth={2.5} />
            </span>
            <span className="min-w-0 flex-1 pt-0.5">
              <span className="flex items-baseline gap-2">
                <span className="text-[12.5px] font-medium">{step.label}</span>
                {step.at && <span className="tnum text-[10.5px] text-faint">{relativeTime(step.at)}</span>}
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted">{step.detail}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Row-level echo of the rail: three ticks for fetched / qualified / decided.
 * It lets a scan of the table show which rows are actually evidenced.
 */
export function ProvenanceTicks({ published, scored, decided }: { published: boolean; scored: boolean; decided: boolean }) {
  const ticks = [published, scored, decided]
  const titles = ['Publication date known', 'Scored against a profile', 'Decision recorded']
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label="Evidence chain">
      {ticks.map((on, i) => (
        <span
          key={i}
          title={titles[i]}
          className={cx('h-[9px] w-[3px] rounded-[1px]', on ? 'bg-fg/70' : 'bg-line-strong/60')}
        />
      ))}
    </span>
  )
}
