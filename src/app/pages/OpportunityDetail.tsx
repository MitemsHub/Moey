import { ArrowLeft, ArrowUpRight, ExternalLink, RefreshCw } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router'

import { ApplicationKitPanel } from '../components/ApplicationKit'
import { ProvenanceRail } from '../components/Provenance'
import { Badge, Button, EmptyState, Select, Skeleton, useToast } from '../components/ui'
import { rescore, setStatus, track, useApiMutation, useOpportunity } from '../lib/api'
import { cx } from '../lib/cx'
import { longDate, relativeTime } from '../lib/format'
import type { OpportunityStatus } from '../../shared/types'

const STATUSES: { key: OpportunityStatus; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'closed', label: 'Closed' },
  { key: 'rejected', label: 'Rejected' },
]

export function OpportunityDetail() {
  const { id } = useParams()
  const location = useLocation()
  const { data, isLoading, isError, error } = useOpportunity(id)
  const toast = useToast()
  // Where the operator came from, so "All opportunities" returns to the same page
  // of the same filtered list instead of the top of a fresh one.
  const backTo = (location.state as { from?: string } | null)?.from ?? '/opportunities'

  const status = useApiMutation((next: OpportunityStatus) => setStatus(id!, next), ['opportunity', 'opportunities', 'overview'], {
    onSuccess: (_r, next) => toast(`Marked ${next.replace('_', ' ')}`),
  })
  const score = useApiMutation(() => rescore(id!), ['opportunity', 'opportunities', 'overview'], {
    onSuccess: (result) => toast(`Re-scored ${(result as { score: number }).score}/100`),
  })
  const addToBoard = useApiMutation(() => track(id!), ['opportunity', 'applications', 'overview'], {
    onSuccess: () => toast('Added to the board — nothing has been sent'),
    onError: (err) => toast(err instanceof Error ? err.message : 'Could not add', 'danger'),
  })

  if (isLoading) {
    return (
      <div className="p-5 sm:p-7">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-4 h-10 w-3/4" />
        <Skeleton className="mt-6 h-64" />
      </div>
    )
  }
  if (isError || !data) {
    return (
      <EmptyState
        title="This opportunity could not be loaded"
        description={error instanceof Error ? error.message : 'It may have been removed.'}
        action={
                      <Link to={backTo}>
              <Button>Back to opportunities</Button>
            </Link>
        }
      />
    )
  }

  const external = /^https?:\/\//i.test(data.url)

  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 border-b border-line xl:border-b-0 xl:border-r">
        <div className="border-b border-line px-5 py-4 sm:px-7">
          <Link to={backTo} className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-fg">
            <ArrowLeft className="size-3.5" /> All opportunities
          </Link>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {data.signalType === 'emerging' ? (
              <Badge tone="warning" dot>
                Emerging signal
              </Badge>
            ) : (
              <Badge tone="success" dot>
                Advertised
              </Badge>
            )}
            <Badge tone="neutral">{data.pipeline === 'business' ? 'Mitemshub business' : 'Individual'}</Badge>
            <span className="tnum text-[11px] text-faint">{data.status.replace('_', ' ')}</span>
          </div>

          <h1 className="mt-2.5 max-w-[46ch] text-balance text-[26px] font-medium leading-[1.15] xl:text-[30px]">{data.title}</h1>

          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
            <span>{data.org ?? 'Organisation not stated'}</span>
            {data.location && (
              <>
                <span aria-hidden>·</span>
                <span>{data.location}</span>
              </>
            )}
            {data.deadline && (
              <>
                <span aria-hidden>·</span>
                <span className="tnum">Closes {longDate(data.deadline)}</span>
              </>
            )}
            {(data.compMin || data.compMax) && (
              <>
                <span aria-hidden>·</span>
                <span className="tnum">
                  {data.compCurrency ?? ''} {data.compMin?.toLocaleString() ?? '—'}
                  {data.compMax ? `–${data.compMax.toLocaleString()}` : '+'}
                </span>
              </>
            )}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Select
              value={data.status}
              onChange={(e) => status.mutate(e.target.value as OpportunityStatus)}
              className="w-[150px]"
              aria-label="Status"
            >
              {STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Button size="sm" onClick={() => score.mutate(undefined)} loading={score.isPending}>
              <RefreshCw /> Re-score
            </Button>
            {!data.application && (
              <Button size="sm" variant="primary" onClick={() => addToBoard.mutate(undefined)} loading={addToBoard.isPending}>
                Track as lead
              </Button>
            )}
            {external && (
              <a href={data.url} target="_blank" rel="noreferrer noopener">
                <Button size="sm" variant="ghost">
                  Open original <ArrowUpRight />
                </Button>
              </a>
            )}
          </div>
          {data.signalType === 'emerging' && (
            <p className="mt-3 border-l-2 border-warning/50 pl-2.5 text-[11.5px] leading-relaxed text-warning">
              This is an unverified signal from a public discussion. Confirm it against a real source before treating it as
              work — it cannot be added to the board.
            </p>
          )}
        </div>

        <section className="px-5 py-5 sm:px-7">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[10.5px] uppercase tracking-[0.14em] text-muted">The posting</h2>
            {external && (
              <a href={data.url} target="_blank" rel="noreferrer noopener" className="tnum inline-flex items-center gap-1 text-[11px] text-faint hover:text-accent">
                {new URL(data.url).hostname} <ExternalLink className="size-2.5" />
              </a>
            )}
          </div>
          {data.body ? (
            <div className="mt-2 max-w-[74ch] whitespace-pre-wrap text-[13.5px] leading-[1.65] text-fg/90">{data.body}</div>
          ) : (
            <p className="mt-2 text-[13px] text-faint">
              The source published no description. Open the original to read it — nothing has been inferred to fill the gap.
            </p>
          )}
        </section>

        <ApplicationKitPanel opportunityId={data.id} title={data.title} org={data.org} url={data.url} />

        <section className="border-t border-line px-5 py-5 sm:px-7">
          <h2 className="text-[10.5px] uppercase tracking-[0.14em] text-muted">Decision log</h2>
          {data.activities.length === 0 ? (
            <p className="mt-2 text-[12.5px] text-faint">Nothing recorded yet.</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2.5">
              {data.activities.map((activity) => (
                <li key={activity.id} className="grid grid-cols-[76px_1fr] gap-3 border-b border-line/60 pb-2.5 last:border-0">
                  <span className="tnum text-[10.5px] uppercase tracking-[0.08em] text-faint">
                    {activity.actor}
                    <span className="block text-[10px] normal-case tracking-normal">{relativeTime(activity.createdAt)}</span>
                  </span>
                  <span className="text-[12px] leading-relaxed text-muted">{activity.body}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <aside className="min-w-0 px-5 py-5 sm:px-7 xl:px-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[10.5px] uppercase tracking-[0.14em] text-muted">Fit</h2>
          <span className="tnum text-[11px] text-faint">{data.scoreModel ?? 'unscored'}</span>
        </div>
        <p className={cx('tnum mt-1 text-[44px] font-medium leading-none', (data.score ?? 0) >= 60 ? 'text-success' : 'text-fg')}>
          {data.score ?? '—'}
          <span className="ml-1 text-[13px] font-normal text-faint">/100</span>
        </p>
        {data.scoreRationale ? (
          <p className="mt-2 text-[12px] leading-relaxed text-muted">{data.scoreRationale}</p>
        ) : (
          <p className="mt-2 text-[12px] text-faint">No rationale recorded. Re-score once a profile has skills.</p>
        )}

        {data.matched.length > 0 && (
          <>
            <h3 className="mt-4 text-[10.5px] uppercase tracking-[0.14em] text-faint">Matched</h3>
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {data.matched.map((skill) => (
                <li key={skill} className="rounded-[3px] bg-success-soft px-1.5 py-0.5 text-[11px] text-success">
                  {skill}
                </li>
              ))}
            </ul>
          </>
        )}
        {data.missing.length > 0 && (
          <>
            <h3 className="mt-4 text-[10.5px] uppercase tracking-[0.14em] text-faint">Asked for, not in profile</h3>
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {data.missing.map((skill) => (
                <li key={skill} className="rounded-[3px] bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                  {skill}
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-6 border-t border-line pt-4">
          <h2 className="text-[10.5px] uppercase tracking-[0.14em] text-muted">Provenance</h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-faint">
            Every step this record passed through. A missing step is shown, not hidden.
          </p>
          <div className="mt-3">
            <ProvenanceRail steps={data.provenance} />
          </div>
        </div>

        <div className="mt-6 border-t border-line pt-4">
          <h2 className="text-[10.5px] uppercase tracking-[0.14em] text-muted">Source terms</h2>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
            {data.sourceLabel
              ? `Imported from ${data.sourceLabel}. The original link is kept so the claim can be checked, and that source's attribution terms apply to reuse.`
              : 'Submitted manually by the operator. No third-party attribution applies.'}
          </p>
        </div>
      </aside>
    </div>
  )
}

