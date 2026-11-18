import { Download, Plus, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'

import { ProvenanceTicks } from '../components/Provenance'
import { Button, Dialog, EmptyState, Field, Input, PageHeader, Select, Skeleton, Textarea, useToast } from '../components/ui'
import { submitManual, useApiMutation, useOpportunities, useSources } from '../lib/api'
import { cx } from '../lib/cx'
import { relativeTime, shortDate } from '../lib/format'
import type { OpportunityQuery, SourceKind } from '../../shared/types'

/**
 * Work-type marker for a row. The source's kind is the default, and it is overridden
 * only by a work type the row itself carries: a job feed that tags one posting
 * Contract/Freelance is quoting that posting, so the row reads "contract" and is
 * counted in the gig view. Nothing here is read from a title or a description.
 * Gig marketplaces read "gig", procurement notices "contract", employer boards and job
 * feeds "job", so a salaried row is labelled as plainly as a gig row. Directory and
 * community rows stay unmarked: those are prospects and conversations, not offered work.
 */
function workMarker(
  kind: SourceKind | null | undefined,
  workType: 'gig' | null | undefined,
): 'gig' | 'contract' | 'job' | null {
  if (workType === 'gig') return 'contract'
  if (kind === 'gig') return 'gig'
  if (kind === 'tender') return 'contract'
  if (kind === 'ats' || kind === 'feed') return 'job'
  return null
}

function WorkMarker({ kind, workType }: { kind: SourceKind | null | undefined; workType: 'gig' | null | undefined }) {
  const mark = workMarker(kind, workType)
  if (!mark) return null
  return (
    <span
      className={cx(
        'shrink-0 rounded-[2px] border px-1 text-[9.5px] uppercase tracking-wide',
        // Salaried work is the default case, so its marker stays quieter than a gig's.
        mark === 'job' ? 'border-line/60 text-faint' : 'border-line text-muted',
      )}
    >
      {mark}
    </span>
  )
}

function ManualDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({
    title: '',
    org: '',
    url: '',
    pipeline: 'business' as 'individual' | 'business',
    signal: 'explicit' as 'explicit' | 'emerging',
    location: '',
    deadline: '',
    body: '',
  })
  const create = useApiMutation(submitManual, ['opportunities', 'overview'], {
    onSuccess: () => {
      toast('Opportunity added')
      setForm({ title: '', org: '', url: '', pipeline: 'business', signal: 'explicit', location: '', deadline: '', body: '' })
      onClose()
    },
    onError: () => toast('Could not save', 'danger'),
  })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Submit an opportunity"
      description="For anything you found yourself. The record keeps your entry and the link, and is marked as manually submitted."
      width={560}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!form.title.trim()}
            onClick={() =>
              create.mutate({
                title: form.title,
                org: form.org || undefined,
                url: form.url || undefined,
                pipeline: form.pipeline,
                signal: form.signal,
                location: form.location || undefined,
                deadline: form.deadline || undefined,
                body: form.body || undefined,
              })
            }
          >
            Add to the list
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Field label="Title">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What is the work?" maxLength={300} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Organisation">
            <Input value={form.org} onChange={(e) => setForm({ ...form, org: e.target.value })} placeholder="Who is asking" />
          </Field>
          <Field label="Location">
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="City or Remote" />
          </Field>
        </div>
        <Field label="Link" hint="Optional, but a record without a link cannot be verified later.">
          <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" inputMode="url" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Pipeline">
            <Select value={form.pipeline} onChange={(e) => setForm({ ...form, pipeline: e.target.value as 'individual' | 'business' })}>
              <option value="business">Mitemshub business</option>
              <option value="individual">Individual</option>
            </Select>
          </Field>
          <Field label="Kind">
            <Select value={form.signal} onChange={(e) => setForm({ ...form, signal: e.target.value as 'explicit' | 'emerging' })}>
              <option value="explicit">Advertised</option>
              <option value="emerging">Emerging signal</option>
            </Select>
          </Field>
          <Field label="Closes">
            <Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
          </Field>
        </div>
        <Field label="Notes" hint="Paste the description if you have it — scoring reads this text.">
          <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4} />
        </Field>
      </div>
    </Dialog>
  )
}

const QUERY_KEY = 'moey:list:query'
const SCROLL_KEY = 'moey:list:scroll'

/** The list remembers where you were: filters and page in localStorage, scroll in
 *  sessionStorage. Opening a row and coming back must not start over. */
function rememberedQuery(): OpportunityQuery | null {
  try {
    const raw = localStorage.getItem(QUERY_KEY)
    const parsed = raw ? (JSON.parse(raw) as OpportunityQuery) : null
    if (!parsed || typeof parsed !== 'object') return null
    // A list remembered before the work-type filter existed has no preference, so it
    // opens on the same default as a first visit instead of back on everything.
    return { ...parsed, work: parsed.work ?? 'gig', page: Math.max(1, Number(parsed.page) || 1) }
  } catch {
    return null
  }
}

function queryFromParams(params: URLSearchParams): OpportunityQuery {
  return {
    q: params.get('q') ?? undefined,
    pipeline: (params.get('pipeline') as OpportunityQuery['pipeline']) ?? undefined,
    signal: (params.get('signal') as OpportunityQuery['signal']) ?? undefined,
    status: (params.get('status') as OpportunityQuery['status']) ?? undefined,
    remote: params.get('remote') === 'only' ? 'only' : undefined,
    location: params.get('location') ?? undefined,
    // Gigs and contract work lead: that is what this seat is looking for first.
    work: (params.get('work') as OpportunityQuery['work']) ?? 'gig',
    sort: (params.get('sort') as OpportunityQuery['sort']) ?? 'recent',
    page: Number(params.get('page') ?? 1) || 1,
  }
}

export function Opportunities() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const [manual, setManual] = useState(params.get('new') === '1')
  // The URL wins when it carries a query; otherwise the last list you were on is
  // restored, so a plain visit to /opportunities does not silently reset to page 1.
  const [initial] = useState<OpportunityQuery>(() =>
    params.toString() ? queryFromParams(params) : (rememberedQuery() ?? { work: 'gig', sort: 'recent', page: 1 }),
  )
  const [query, setQuery] = useState<OpportunityQuery>(initial)
  const [search, setSearch] = useState(initial.q ?? '')
  const [place, setPlace] = useState(initial.location ?? '')
  const restored = useRef(false)

  useEffect(() => {
    if (!params.toString() && initial.page !== 1) {
      const next = new URLSearchParams()
      for (const [key, value] of Object.entries(initial)) {
        if (value !== undefined && value !== '') next.set(key, String(value))
      }
      setParams(next, { replace: true })
    }
    // Only the first mount decides this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      // Only a real change to the search text resets the page. On mount the text
      // already matches the query, so this is a no-op — which is what used to send
      // the list back to page 1 every time a row was opened.
      setQuery((q) => {
        const nextQ = search || undefined
        if ((q.q ?? undefined) === nextQ) return q
        return { ...q, q: nextQ, page: 1 }
      })
    }, 220)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    // Same debounce as the search box: a location is typed a letter at a time.
    const timer = setTimeout(() => {
      setQuery((q) => {
        const nextPlace = place.trim() || undefined
        if ((q.location ?? undefined) === nextPlace) return q
        return { ...q, location: nextPlace, page: 1 }
      })
    }, 220)
    return () => clearTimeout(timer)
  }, [place])

  useEffect(() => {
    try {
      localStorage.setItem(QUERY_KEY, JSON.stringify(query))
    } catch {
      /* storage is optional */
    }
  }, [query])

  useEffect(() => {
    // Saved as you scroll, not on unmount: StrictMode's simulated unmount fires
    // between mounts and would record a zero position straight over the real one.
    const scroller = document.getElementById('main-scroll')
    if (!scroller) return
    // A time throttle, not requestAnimationFrame: a background tab never runs a
    // frame, which would silently record nothing at all.
    let last = 0
    const onScroll = () => {
      const at = Date.now()
      if (at - last < 200) return
      last = at
      try {
        sessionStorage.setItem(SCROLL_KEY, String(scroller.scrollTop))
      } catch {
        /* storage is optional */
      }
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [])

  const { data, isLoading, isError, error } = useOpportunities(query)
  const { data: sources } = useSources()

  useEffect(() => {
    if (restored.current || isLoading || !data) return
    restored.current = true
    const scroller = document.getElementById('main-scroll')
    const y = Number(sessionStorage.getItem(SCROLL_KEY) ?? 0)
    if (!scroller || y <= 0) return
    // Wait for the rows to be laid out; restoring against a half-built table gets
    // clamped to the placeholder height.
    const settle = () => {
      if (Math.abs(scroller.scrollTop - y) > 4) scroller.scrollTop = y
    }
    const first = requestAnimationFrame(settle)
    const second = setTimeout(settle, 120)
    return () => {
      cancelAnimationFrame(first)
      clearTimeout(second)
    }
  }, [data, isLoading])

  function update(patch: Partial<OpportunityQuery>) {
    const next = { ...query, ...patch, page: patch.page ?? 1 }
    setQuery(next)
    const nextParams = new URLSearchParams()
    for (const [key, value] of Object.entries(next)) {
      if (value !== undefined && value !== '') nextParams.set(key, String(value))
    }
    setParams(nextParams, { replace: true })
  }

  const active =
    (query.q ? 1 : 0) +
    (query.pipeline ? 1 : 0) +
    (query.signal ? 1 : 0) +
    (query.status ? 1 : 0) +
    (query.remote ? 1 : 0) +
    (query.location ? 1 : 0) +
    (query.work ? 1 : 0)
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div>
      <div className="border-b border-line px-5 py-5 sm:px-7">
        <PageHeader
          title="Opportunities"
          subtitle="Every row keeps its source link. Emerging signals are labelled, never dressed up as contracts."
          actions={
            <Button variant="primary" size="sm" onClick={() => setManual(true)}>
              <Plus /> Submit
            </Button>
          }
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search titles, organisations and text"
              className="pl-8.5"
              type="search"
              aria-label="Search opportunities"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-fg">
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <Select value={query.pipeline ?? ''} onChange={(e) => update({ pipeline: (e.target.value || undefined) as OpportunityQuery['pipeline'] })} className="w-[150px]" aria-label="Pipeline">
            <option value="">Both pipelines</option>
            <option value="individual">Individual</option>
            <option value="business">Mitemshub business</option>
          </Select>

          <Select
            value={query.work ?? ''}
            onChange={(e) => update({ work: (e.target.value || undefined) as OpportunityQuery['work'] })}
            className="w-[176px]"
            aria-label="Work type"
          >
            <option value="">All work · gigs first</option>
            <option value="gig">Gigs &amp; contract</option>
            <option value="job">Salaried jobs</option>
          </Select>

          <Select
            value={query.remote ?? ''}
            onChange={(e) => update({ remote: (e.target.value || undefined) as OpportunityQuery['remote'] })}
            className="w-[148px]"
            aria-label="Work setting"
          >
            <option value="">Any setting</option>
            <option value="only">Remote only</option>
          </Select>

          <div className="relative w-[172px]">
            <Input
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="City or country"
              className="pr-8"
              aria-label="Filter by location"
            />
            {place && (
              <button
                type="button"
                onClick={() => setPlace('')}
                aria-label="Clear location"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-fg"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <Select value={query.signal ?? ''} onChange={(e) => update({ signal: (e.target.value || undefined) as OpportunityQuery['signal'] })} className="w-[142px]" aria-label="Kind">
            <option value="">All kinds</option>
            <option value="explicit">Advertised</option>
            <option value="emerging">Emerging signals</option>
          </Select>

          <Select value={query.status ?? ''} onChange={(e) => update({ status: (e.target.value || undefined) as OpportunityQuery['status'] })} className="w-[136px]" aria-label="Status">
            <option value="">Any status</option>
            <option value="new">New</option>
            <option value="reviewing">Reviewing</option>
            <option value="shortlisted">Shortlisted</option>
            <option value="in_progress">In progress</option>
            <option value="closed">Closed</option>
            <option value="rejected">Rejected</option>
          </Select>

          <Select value={query.sort ?? 'recent'} onChange={(e) => update({ sort: e.target.value as OpportunityQuery['sort'] })} className="w-[130px]" aria-label="Sort">
            <option value="recent">Newest</option>
            <option value="score">Best fit</option>
            <option value="deadline">Closing soon</option>
          </Select>

          {active > 0 && (
            <Button size="sm" variant="ghost" onClick={() => { setSearch(''); setPlace(''); setQuery({ sort: 'recent', page: 1 }); setParams({}, { replace: true }) }}>
              Clear {active}
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2 p-5 sm:p-7">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState title="Could not load opportunities" description={error instanceof Error ? error.message : 'Unknown error'} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={<Download />}
          title={active ? 'Nothing matches those filters' : 'No opportunities yet'}
          description={active ? 'Loosen a filter, or clear the search.' : 'Run a scan or submit one you already know about.'}
          action={
            !active && (
              <Button variant="primary" onClick={() => setManual(true)}>
                Submit an opportunity
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            {/* Source and Seen are hidden on phones: the row still answers
                "what is it, how well does it fit, when does it close". */}
            <table className="w-full border-collapse text-left sm:min-w-[720px] sm:table-fixed">
              <thead>
                <tr className="border-b border-line text-[10.5px] uppercase tracking-[0.12em] text-faint">
                  <th scope="col" className="py-2 pl-5 pr-3 font-normal sm:w-[46%] sm:pl-7">Opportunity</th>
                  <th scope="col" className="hidden px-3 py-2 font-normal sm:table-cell sm:w-[21%]">Source</th>
                  <th scope="col" className="w-[30px] px-2 py-2 text-right font-normal sm:w-[7%]">Fit</th>
                  <th scope="col" className="w-[62px] px-2 py-2 font-normal sm:w-[10%]">Closes</th>
                  <th scope="col" className="hidden px-2 py-2 font-normal sm:table-cell sm:w-[8%]">Seen</th>
                  <th scope="col" className="hidden w-[46px] py-2 pl-2 pr-5 text-right font-normal sm:table-cell sm:w-[8%] sm:pr-7">Trace</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} className="group border-b border-line/70 transition-colors hover:bg-surface/70">
                    <td className="max-w-0 py-2.5 pl-5 pr-3 sm:pl-7">
                      <Link
                        to={`/opportunities/${item.id}`}
                        state={{ from: `${location.pathname}${location.search}` }}
                        className="block"
                      >
                        <span className="line-clamp-2 text-[13px] font-medium leading-snug sm:line-clamp-1">
                          {item.title}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
                          {item.signalType === 'emerging' ? (
                            <span className="shrink-0 uppercase tracking-[0.08em] text-warning">emerging</span>
                          ) : (
                            <span className="shrink-0 uppercase tracking-[0.08em] text-success">advertised</span>
                          )}
                          <span aria-hidden>·</span>
                          <span className="truncate">{item.org ?? 'Organisation not stated'}</span>
                          <WorkMarker kind={item.sourceKind} workType={item.workType} />
                          {item.remote && (
                            <span className="hidden shrink-0 rounded-[2px] bg-surface-2 px-1 text-[9.5px] uppercase tracking-wide sm:inline-block">
                              remote
                            </span>
                          )}
                        </span>
                      </Link>
                    </td>
                    <td className="hidden truncate px-3 py-2.5 text-[11.5px] text-muted sm:table-cell">{item.sourceLabel ?? 'Manual'}</td>
                    <td className="px-2 py-2.5 text-right">
                      <span className={cx('tnum text-[12.5px]', item.score !== null && item.score >= 60 ? 'font-medium text-success' : 'text-muted')}>
                        {item.score ?? '—'}
                      </span>
                    </td>
                    <td className="tnum whitespace-nowrap px-2 py-2.5 text-[11.5px] text-muted">
                      {item.deadline ? shortDate(item.deadline) : <span className="text-faint">—</span>}
                    </td>
                    <td className="tnum hidden whitespace-nowrap px-2 py-2.5 text-[11.5px] text-faint sm:table-cell">{relativeTime(item.firstSeenAt)}</td>
                    {/* Trace is the third column dropped on phones, with Source and Seen:
                        the work marker needs that width or the organisation disappears. */}
                    <td className="hidden py-2.5 pl-2 pr-5 text-right sm:table-cell sm:pr-7">
                      <ProvenanceTicks published={Boolean(item.publishedAt)} scored={item.score !== null} decided={item.status !== 'new'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 px-5 py-3 sm:px-7">
            <p className="tnum text-[11.5px] text-faint">
              {data.total} {data.total === 1 ? 'row' : 'rows'} · page {data.page} of {totalPages}
              {sources?.items.length ? ` · ${sources.items.filter((s) => s.enabled).length} sources enabled` : ''}
            </p>
            <div className="flex items-center gap-1.5">
              <Button size="sm" disabled={data.page <= 1} onClick={() => update({ page: data.page - 1 })}>
                Previous
              </Button>
              <Button size="sm" disabled={data.page >= totalPages} onClick={() => update({ page: data.page + 1 })}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <ManualDialog
        open={manual}
        onClose={() => {
          setManual(false)
          if (params.get('new')) {
            params.delete('new')
            setParams(params, { replace: true })
          }
        }}
      />
    </div>
  )
}
