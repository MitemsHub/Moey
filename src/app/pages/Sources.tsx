import { AlertTriangle, ExternalLink, Play, Settings2 } from 'lucide-react'
import { useState } from 'react'

import { Badge, Button, Dialog, Field, PageHeader, Skeleton, Textarea, useToast } from '../components/ui'
import { runSource, updateSource, useApiMutation, useSourceRuns, useSources } from '../lib/api'
import { cx } from '../lib/cx'
import { relativeTime } from '../lib/format'
import type { Source } from '../../shared/types'

type SourceWithConfig = Source & { config: Record<string, unknown>; configHint: string; needs: string | null }

const healthTone: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  ok: 'success',
  idle: 'neutral',
  degraded: 'warning',
  failing: 'danger',
  unconfigured: 'neutral',
}

function configToText(source: SourceWithConfig): string {
  const boards = source.config.boards
  if (Array.isArray(boards)) return boards.join('\n')
  const queries = source.config.queries
  if (Array.isArray(queries)) return queries.join('\n')
  const keywords = source.config.keywords
  if (Array.isArray(keywords)) return keywords.join('\n')
  if (typeof source.config.query === 'string') return source.config.query
  if (typeof source.config.industry === 'string') return source.config.industry
  return ''
}

export function Sources() {
  const { data, isLoading } = useSources()
  const { data: runs } = useSourceRuns()
  const toast = useToast()
  const [editing, setEditing] = useState<SourceWithConfig | null>(null)
  const [text, setText] = useState('')

  const toggle = useApiMutation(
    ({ id, enabled }: { id: string; enabled: boolean }) => updateSource(id, { enabled }),
    ['sources', 'overview'],
  )
  const run = useApiMutation((id: string) => runSource(id), ['sources', 'source-runs', 'overview', 'opportunities'], {
    onSuccess: (result) => toast(`${result.inserted} new · ${result.duplicates} already known`),
    onError: (error) => toast(error instanceof Error ? error.message : 'Scan failed', 'danger'),
  })
  const save = useApiMutation(
    ({ id, list }: { id: string; list: string[] }) => updateSource(id, { config: listToConfig(editing!, list) }),
    ['sources', 'overview'],
    { onSuccess: () => { toast('Source updated'); setEditing(null) } },
  )

  function listToConfig(source: SourceWithConfig, list: string[]) {
    const values = list.map((v) => v.trim()).filter(Boolean)
    if (Array.isArray(source.config.boards)) return { boards: values }
    if (Array.isArray(source.config.queries)) return { queries: values, sinceDays: 3 }
    if (Array.isArray(source.config.keywords)) return { keywords: values }
    if (typeof source.config.query === 'string') return { query: values[0] ?? '', limit: 40 }
    return { industry: values[0] ?? '' }
  }

  const items = data?.items ?? []
  const ready = items.filter((s) => s.enabled && s.health !== 'unconfigured').length

  return (
    <div>
      <div className="border-b border-line px-5 py-5 sm:px-7">
        <PageHeader
          title="Sources"
          subtitle="Adapters the engine can read. A source that cannot run legally is not listed as available."
        />
        <p className="mt-2 max-w-[80ch] text-[12.5px] leading-relaxed text-muted">
          {ready} of {items.length} sources are running. Sources marked <span className="text-faint">not configured</span> are
          deliberately off: some need a curated board list, some need an API key. Social platforms named in the brief
          (Reddit, LinkedIn, Meta, TikTok) are refused rather than scraped — see <code className="tnum text-[11.5px]">docs/SOURCES.md</code>.
        </p>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2 p-5 sm:p-7">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((source) => (
            <li key={source.id} className="px-5 py-3.5 sm:px-7">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-medium">{source.label}</span>
                    <Badge tone={healthTone[source.health] ?? 'neutral'} dot>
                      {source.health}
                    </Badge>
                    <span className="tnum text-[10.5px] uppercase tracking-[0.08em] text-faint">{source.kind}</span>
                    {source.pipeline !== 'both' && (
                      <span className="tnum text-[10.5px] text-faint">{source.pipeline}</span>
                    )}
                  </div>
                  <p className="mt-1 max-w-[75ch] text-[12px] leading-relaxed text-muted">{source.note}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint">
                    <span className="tnum">{source.insertedTotal} rows</span>
                    <span className="tnum">{source.foundTotal} seen</span>
                    <span>{source.lastRunAt ? `ran ${relativeTime(source.lastRunAt)}` : 'never run'}</span>
                    {source.attributionLabel && (
                      <a href={source.attributionUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 hover:text-accent">
                        {source.attributionLabel} <ExternalLink className="size-2.5" />
                      </a>
                    )}
                  </p>
                  {source.lastError && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-[11.5px] text-danger">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                      <span className="min-w-0 break-words">{source.lastError}</span>
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {source.needs && (
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(source); setText(configToText(source)) }}>
                      <Settings2 /> Configure
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggle.mutate({ id: source.id, enabled: !source.enabled })}
                  >
                    {source.enabled ? 'Pause' : 'Enable'}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => run.mutate(source.id)}
                    loading={run.isPending && run.variables === source.id}
                    disabled={!source.enabled}
                  >
                    <Play /> Run
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="border-t border-line px-5 py-5 sm:px-7">
        <h2 className="text-[10.5px] uppercase tracking-[0.14em] text-muted">Scan history</h2>
        {!runs || runs.items.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-faint">No scan has run yet. Use Run on a source above.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-[0.1em] text-faint">
                  <th className="py-1.5 pr-3 font-normal">Source</th>
                  <th className="px-3 py-1.5 font-normal">When</th>
                  <th className="px-3 py-1.5 text-right font-normal">Seen</th>
                  <th className="px-3 py-1.5 text-right font-normal">New</th>
                  <th className="px-3 py-1.5 text-right font-normal">Dupes</th>
                  <th className="py-1.5 pl-3 font-normal">Result</th>
                </tr>
              </thead>
              <tbody>
                {runs.items.map((row) => (
                  <tr key={row.id} className="border-b border-line/60">
                    <td className="py-1.5 pr-3">{row.sourceLabel ?? '—'}</td>
                    <td className="tnum px-3 py-1.5 text-faint">{relativeTime(row.startedAt)}</td>
                    <td className="tnum px-3 py-1.5 text-right">{row.found}</td>
                    <td className="tnum px-3 py-1.5 text-right font-medium">{row.inserted}</td>
                    <td className="tnum px-3 py-1.5 text-right text-faint">{row.duplicates}</td>
                    <td className={cx('py-1.5 pl-3', row.status === 'failed' ? 'text-danger' : row.status === 'partial' ? 'text-warning' : 'text-success')}>
                      {row.status}
                      {row.message && <span className="ml-1.5 text-faint">{row.message.slice(0, 60)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `Configure ${editing.label}` : 'Configure'}
        description="One entry per line. Only the fields this adapter documents are kept."
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={save.isPending}
              onClick={() => editing && save.mutate({ id: editing.id, list: text.split('\n') })}
            >
              Save
            </Button>
          </>
        }
      >
        <Field label={Array.isArray(editing?.config.boards) ? 'Board tokens' : Array.isArray(editing?.config.queries) ? 'Search phrases' : 'Values'} hint={editing?.configHint}>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="font-mono text-[12.5px]" />
        </Field>
        <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
          A board token is the last part of an employer's public careers URL. Adding a company here does not imply any
          relationship with it — it only tells the adapter where to look.
        </p>
      </Dialog>
    </div>
  )
}

