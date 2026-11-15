import { useState } from 'react'
import { Link } from 'react-router'

import { Button, EmptyState, PageHeader, Skeleton, useToast } from '../components/ui'
import { moveLead, useApiMutation, useApplications } from '../lib/api'
import { cx } from '../lib/cx'
import { relativeTime, shortDate } from '../lib/format'
import { LEAD_STAGES, type Application, type LeadStage } from '../../shared/types'

export function Leads() {
  const { data, isLoading } = useApplications()
  const toast = useToast()
  const [dragging, setDragging] = useState<Application | null>(null)
  const [over, setOver] = useState<LeadStage | null>(null)

  const move = useApiMutation(
    ({ id, stage }: { id: string; stage: LeadStage }) => moveLead(id, stage),
    ['applications', 'overview'],
    { onSuccess: () => toast('Stage updated') },
  )

  const items = data?.items ?? []

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-5 py-5 sm:px-7">
        <PageHeader
          title="Leads"
          subtitle="Only advertised opportunities reach this board. Emerging signals stay in review until confirmed."
        />
      </div>

      {isLoading ? (
        <div className="grid gap-3 p-5 sm:p-7 lg:grid-cols-5">
          {LEAD_STAGES.map((stage) => (
            <Skeleton key={stage.key} className="h-40" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No leads tracked yet"
          description="Open an advertised opportunity and choose “Track as lead”. Nothing here means nothing has been sent, accepted or agreed."
          action={
            <Link to="/opportunities">
              <Button>Browse opportunities</Button>
            </Link>
          }
        />
      ) : (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-x-auto p-5 sm:p-7">
          <div className="grid min-w-[820px] grid-cols-5 gap-3">
            {LEAD_STAGES.map((stage) => {
              const column = items.filter((item) => item.stage === stage.key)
              return (
                <section
                  key={stage.key}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setOver(stage.key)
                  }}
                  onDragLeave={() => setOver((s) => (s === stage.key ? null : s))}
                  onDrop={() => {
                    if (dragging && dragging.stage !== stage.key) move.mutate({ id: dragging.id, stage: stage.key })
                    setDragging(null)
                    setOver(null)
                  }}
                  className={cx(
                    'flex min-h-[220px] flex-col rounded-card border bg-surface/40 p-1.5 transition-colors',
                    over === stage.key ? 'border-accent/50 bg-accent-soft/30' : 'border-line',
                  )}
                >
                  <header className="flex items-baseline justify-between px-1.5 pb-1.5 pt-1">
                    <h2 className="text-[11px] uppercase tracking-[0.12em] text-muted">{stage.label}</h2>
                    <span className="tnum text-[11px] text-faint">{column.length}</span>
                  </header>

                  <ul className="flex flex-1 flex-col gap-1.5">
                    {column.map((item) => (
                      <li key={item.id}>
                        <article
                          draggable
                          onDragStart={() => setDragging(item)}
                          onDragEnd={() => { setDragging(null); setOver(null) }}
                          className={cx(
                            'cursor-grab rounded-[7px] border border-line bg-surface p-2.5 shadow-card transition-opacity active:cursor-grabbing',
                            dragging?.id === item.id && 'opacity-40',
                          )}
                        >
                          <Link to={`/opportunities/${item.opportunityId}`} className="block">
                            <span className="block text-[12.5px] font-medium leading-snug">{item.oppTitle}</span>
                            <span className="mt-0.5 block truncate text-[11px] text-faint">{item.org ?? 'Organisation not stated'}</span>
                          </Link>
                          <div className="mt-1.5 flex items-center justify-between">
                            <span className="tnum text-[10.5px] text-faint">{relativeTime(item.updatedAt)}</span>
                            {item.score != null && (
                              <span className={cx('tnum text-[10.5px]', item.score >= 60 ? 'text-success' : 'text-muted')}>{item.score}</span>
                            )}
                          </div>
                          {item.nextActionAt && (
                            <p className="tnum mt-1 text-[10px] text-faint">next {shortDate(item.nextActionAt)}</p>
                          )}
                        </article>
                      </li>
                    ))}
                    {column.length === 0 && (
                      <li className="grid flex-1 place-items-center rounded-[7px] border border-dashed border-line/80 px-2 py-6 text-center text-[11px] text-faint">
                        Drop here
                      </li>
                    )}
                  </ul>
                </section>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
