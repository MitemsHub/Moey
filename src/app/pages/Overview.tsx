import { ArrowUpRight, Inbox, Radar, RefreshCw } from 'lucide-react'
import { Link } from 'react-router'

import { ProvenanceTicks } from '../components/Provenance'
import { Badge, Button, EmptyState, PageHeader, Skeleton, useToast } from '../components/ui'
import { runAllSources, useApiMutation, useMe, useOverview } from '../lib/api'
import { cx } from '../lib/cx'
import { relativeTime, shortDate } from '../lib/format'
import type { Opportunity } from '../../shared/types'

function Score({ value }: { value: number | null }) {
  if (value === null) return <span className="tnum text-[12px] text-faint">—</span>
  const strong = value >= 60
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cx('tnum text-[13px] font-medium', strong ? 'text-success' : value >= 35 ? 'text-fg' : 'text-faint')}>
        {value}
      </span>
      <span aria-hidden className="h-[3px] w-9 overflow-hidden rounded-full bg-line">
        <span className={cx('block h-full', strong ? 'bg-success' : 'bg-fg/45')} style={{ width: `${value}%` }} />
      </span>
    </span>
  )
}

function SignalType({ type }: { type: Opportunity['signalType'] }) {
  return type === 'emerging' ? (
    <Badge tone="warning" dot>
      Emerging
    </Badge>
  ) : (
    <Badge tone="success" dot>
      Verified listing
    </Badge>
  )
}

export function Overview() {
  const { data, isLoading, isError, error, refetch, isFetching } = useOverview()
  const { data: me } = useMe()
  const toast = useToast()

  const scan = useApiMutation(() => runAllSources(), ['overview', 'opportunities', 'sources', 'source-runs'], {
    onSuccess: (result) => {
      const inserted = result.results.reduce((sum, r) => sum + r.inserted, 0)
      const failed = result.results.filter((r) => r.error).length
      toast(
        `${inserted} new ${inserted === 1 ? 'opportunity' : 'opportunities'}${failed ? ` · ${failed} source${failed === 1 ? '' : 's'} failed` : ''}`,
        failed && !inserted ? 'danger' : 'neutral',
      )
    },
  })

  if (isLoading) {
    return (
      <div className="p-5 sm:p-7">
        <Skeleton className="h-8 w-56" />
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        <Skeleton className="mt-6 h-96" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <EmptyState
        icon={<Radar />}
        title="Could not load the signal view"
        description={error instanceof Error ? error.message : 'The API did not answer.'}
        action={<Button onClick={() => refetch()}>Try again</Button>}
      />
    )
  }

  const { kpis, feed, reviewQueue, bySource, pipelineSplit, scanRuns } = data
  const empty = feed.length === 0
  const profileFilled = me?.profiles.some((p) => p.filled) ?? false

  const stats: { label: string; value: string | number; detail: string; tone?: 'success' | 'warning' }[] = [
    { label: 'New · 24h', value: kpis.newToday, detail: `${kpis.newThisWeek} this week` },
    { label: 'High fit', value: kpis.highFit, detail: 'score ≥ 60', tone: 'success' },
    { label: 'Awaiting review', value: kpis.awaitingReview, detail: 'not yet decided' },
    { label: 'Emerging', value: kpis.emerging, detail: 'unverified signals', tone: 'warning' },
    { label: 'Open leads', value: kpis.activeLeads, detail: 'on the board' },
    { label: 'Mean score', value: kpis.averageScore, detail: 'average, all rows' },
  ]

  return (
    <div>
      <div className="border-b border-line px-5 py-5 sm:px-7">
        <PageHeader
          title="Signal"
          subtitle="Everything the engine pulled in, with where it came from."
          actions={
            <>
              <Button size="sm" onClick={() => refetch()} loading={isFetching} aria-label="Refresh">
                <RefreshCw />
              </Button>
              <Button size="sm" variant="primary" onClick={() => scan.mutate(undefined)} loading={scan.isPending}>
                Scan now
              </Button>
            </>
          }
        />

        <dl className="mt-5 grid grid-cols-2 border-t border-line sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className={cx(
                'border-b border-line py-3 pr-4',
                i !== 0 && 'sm:border-l sm:pl-4',
                i === 0 && 'lg:pr-4',
                'lg:border-b-0',
              )}
            >
              <dt className="text-[10.5px] uppercase tracking-[0.14em] text-faint">{stat.label}</dt>
              <dd
                className={cx(
                  'tnum mt-1 text-[26px] font-medium leading-none',
                  stat.tone === 'success' && stat.value !== 0 && 'text-success',
                  stat.tone === 'warning' && stat.value !== 0 && 'text-warning',
                )}
              >
                {stat.value}
              </dd>
              <dd className="mt-1 text-[11px] text-faint">{stat.detail}</dd>
            </div>
          ))}
        </dl>
      </div>

      {!profileFilled && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-warning/25 bg-warning-soft/50 px-5 py-2.5 text-[12.5px] text-warning sm:px-7">
          <span className="font-medium">Scores are near-meaningless until a profile has real skills.</span>
          <span className="text-warning/80">Records are empty on purpose — nothing was invented for you.</span>
          <Link to="/profiles" className="underline underline-offset-2 hover:text-fg">
            Fill a profile
          </Link>
        </div>
      )}

      {empty ? (
        <div className="grid lg:grid-cols-[1fr_320px]">
          <EmptyState
            icon={<Inbox />}
            title="Nothing discovered yet"
            description="Run a scan, or submit an opportunity you already know about. No sample rows were created for you — a made-up opportunity in this list would be worse than an empty one."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="primary" onClick={() => scan.mutate(undefined)} loading={scan.isPending}>
                  Scan sources
                </Button>
                <Link to="/opportunities?new=1">
                  <Button>Submit manually</Button>
                </Link>
              </div>
            }
          />
          <aside className="border-t border-line p-5 lg:border-l lg:border-t-0">
            <h2 className="text-[10.5px] uppercase tracking-[0.14em] text-faint">What scans look at</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {data.health.sources.map((source) => (
                <li key={source.id} className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className={cx(
                      'mt-1.5 size-1.5 shrink-0 rounded-full',
                      source.health === 'ok'
                        ? 'bg-success'
                        : source.health === 'unconfigured'
                          ? 'bg-line-strong'
                          : 'bg-warning',
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-[12.5px]">{source.label}</span>
                    <span className="block text-[11px] text-faint">
                      {source.health === 'unconfigured' ? 'needs configuration' : source.lastRunAt ? `ran ${relativeTime(source.lastRunAt)}` : 'never run'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <Link to="/sources" className="mt-4 inline-flex items-center gap-1 text-[12px] text-accent hover:underline">
              Configure sources <ArrowUpRight className="size-3" />
            </Link>
          </aside>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
          {/* Review queue — the work surface */}
          <section className="min-w-0 border-b border-line lg:border-b-0 lg:border-r">
            <header className="flex items-baseline justify-between gap-3 px-5 pb-2 pt-4 sm:px-7">
              <h2 className="text-[10.5px] uppercase tracking-[0.14em] text-muted">Waiting for a decision</h2>
              <span className="tnum text-[11px] text-faint">{kpis.awaitingReview} total</span>
            </header>
            {reviewQueue.length === 0 ? (
              <EmptyState title="Review queue is clear" description="Every new row has a decision recorded against it." />
            ) : (
              <ul className="divide-y divide-line">
                {reviewQueue.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={`/opportunities/${item.id}`}
                      className="group grid grid-cols-[1fr_auto] items-start gap-4 px-5 py-3 transition-colors hover:bg-surface/60 sm:px-7"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13.5px] font-medium leading-snug">{item.title}</span>
                          {item.signalType === 'emerging' && (
                            <span className="shrink-0 text-[10px] uppercase tracking-[0.1em] text-warning">signal</span>
                          )}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-faint">
                          <span className="truncate">{item.org ?? 'Organisation not stated'}</span>
                          <span aria-hidden>·</span>
                          <span>{item.sourceLabel ?? 'Manual'}</span>
                          {item.deadline && (
                            <>
                              <span aria-hidden>·</span>
                              <span className="tnum">closes {shortDate(item.deadline)}</span>
                            </>
                          )}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1.5 pt-0.5">
                        <Score value={item.score} />
                        <ProvenanceTicks
                          published={Boolean(item.publishedAt)}
                          scored={item.score !== null}
                          decided={false}
                        />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <div className="grid gap-6 border-t border-line px-5 py-5 sm:grid-cols-2 sm:px-7">
              <div>
                <h2 className="text-[10.5px] uppercase tracking-[0.14em] text-faint">Where it came from</h2>
                {bySource.length === 0 ? (
                  <p className="mt-2 text-[12px] text-faint">No rows yet.</p>
                ) : (
                  <ul className="mt-2.5 flex flex-col gap-2">
                    {bySource.map((row) => {
                      const max = Math.max(...bySource.map((r) => r.count), 1)
                      return (
                        <li key={row.sourceId ?? row.label} className="grid grid-cols-[1fr_auto] items-center gap-2">
                          <span className="min-w-0">
                            <span className="block truncate text-[12px]">{row.label}</span>
                            <span className="mt-1 block h-[2px] w-full bg-line">
                              <span className="block h-full bg-fg/40" style={{ width: `${(row.count / max) * 100}%` }} />
                            </span>
                          </span>
                          <span className="tnum text-[11.5px] text-muted">{row.count}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              <div>
                <h2 className="text-[10.5px] uppercase tracking-[0.14em] text-faint">Pipeline split</h2>
                <ul className="mt-2.5 flex flex-col gap-2.5">
                  {(['individual', 'business'] as const).map((key) => {
                    const row = pipelineSplit.find((p) => p.pipeline === key)
                    return (
                      <li key={key}>
                        <span className="flex items-baseline justify-between">
                          <span className="text-[12px] capitalize">{key}</span>
                          <span className="tnum text-[11.5px] text-muted">
                            {row?.count ?? 0}
                            <span className="text-faint"> · {row?.highFit ?? 0} strong</span>
                          </span>
                        </span>
                      </li>
                    )
                  })}
                </ul>
                <h2 className="mt-4 text-[10.5px] uppercase tracking-[0.14em] text-faint">Recent scans</h2>
                {scanRuns.length === 0 ? (
                  <p className="mt-2 text-[12px] text-faint">No scan has run yet.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {scanRuns.slice(0, 4).map((run) => (
                      <li key={run.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                        <span className="truncate text-muted">{run.sourceLabel ?? 'Source'}</span>
                        <span className="tnum shrink-0 text-faint">
                          +{run.inserted} · {run.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          {/* Signal feed — the signature surface */}
          <aside className="min-w-0">
            <header className="flex items-baseline justify-between gap-3 px-5 pb-2 pt-4">
              <h2 className="text-[10.5px] uppercase tracking-[0.14em] text-muted">Latest arrivals</h2>
              <Link to="/opportunities" className="text-[11px] text-accent hover:underline">
                All
              </Link>
            </header>
            <ul className="divide-y divide-line">
              {feed.slice(0, 14).map((item) => (
                <li key={item.id}>
                  <Link to={`/opportunities/${item.id}`} className="block px-5 py-2.5 transition-colors hover:bg-surface/60">
                    <span className="flex items-center justify-between gap-2">
                      <span className="tnum text-[10px] uppercase tracking-[0.1em] text-faint">
                        {item.sourceLabel ?? 'Manual'}
                      </span>
                      <span className="tnum text-[10px] text-faint">{relativeTime(item.firstSeenAt)}</span>
                    </span>
                    <span className="mt-1 block text-[12.5px] leading-snug text-fg">{item.title}</span>
                    <span className="mt-1 flex items-center gap-2">
                      <SignalType type={item.signalType} />
                      <span className="tnum text-[10.5px] text-faint">{item.pipeline}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </div>
  )
}
