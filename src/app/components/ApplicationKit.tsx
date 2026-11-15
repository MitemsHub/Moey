import { Copy, Download, FileSignature, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import { Button, Skeleton, useToast } from './ui'
import { cx } from '../lib/cx'
import { relativeTime } from '../lib/format'
import { generateKit, useApiMutation, useKit } from '../lib/api'
import type { ApplicationKit } from '../../shared/types'

function toMarkdown(kit: ApplicationKit, title: string, org: string | null): string {
  const lines: string[] = [`# ${kit.headline}`, '', kit.summary, '', '## Skills', kit.skills.join(', ')]
  if (kit.experience.length) {
    lines.push('', '## Experience')
    for (const entry of kit.experience) {
      lines.push('', `### ${entry.role}${entry.org ? ` — ${entry.org}` : ''}${entry.period ? ` (${entry.period})` : ''}`)
      for (const bullet of entry.bullets) lines.push(`- ${bullet}`)
    }
  }
  if (kit.projects.length) {
    lines.push('', '## Projects')
    for (const project of kit.projects) {
      lines.push(`- **${project.name}**${project.url ? ` (${project.url})` : ''} — ${project.why}`)
    }
  }
  lines.push('', `## Cover letter — ${org ?? title}`, '', kit.coverLetter)
  if (kit.gaps.length) {
    lines.push('', '## Asked for, not evidenced', ...kit.gaps.map((gap) => `- ${gap}`))
  }
  lines.push(
    '',
    '---',
    `Drafted with ${kit.model} from the posting, the stated profile${kit.repoCount ? ` and ${kit.repoCount} public repositories` : ''}. Check every line before sending.`,
  )
  return lines.join('\n')
}

export function ApplicationKitPanel({ opportunityId, title, org }: { opportunityId: string; title: string; org: string | null }) {
  const { data, isLoading } = useKit(opportunityId)
  const toast = useToast()
  const [tab, setTab] = useState<'cv' | 'letter' | 'gaps' | 'evidence'>('cv')

  const kit = data?.kit ?? null
  const generate = useApiMutation(() => generateKit(opportunityId), ['kit', 'opportunity'], {
    onSuccess: () => toast('Draft built — nothing has been sent'),
    onError: (error) => toast(error instanceof Error ? error.message : 'Could not build the draft', 'danger'),
  })

  const tabs = [
    { key: 'cv' as const, label: 'CV' },
    { key: 'letter' as const, label: 'Cover letter' },
    { key: 'gaps' as const, label: kit?.gaps.length ? `Gaps (${kit.gaps.length})` : 'Gaps' },
    { key: 'evidence' as const, label: 'Evidence' },
  ]

  async function copy() {
    if (!kit) return
    try {
      await navigator.clipboard.writeText(toMarkdown(kit, title, org))
      toast('Copied as Markdown')
    } catch {
      toast('Clipboard is blocked in this browser', 'danger')
    }
  }

  function download() {
    if (!kit) return
    const blob = new Blob([toMarkdown(kit, title, org)], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(org ?? title).replace(/[^a-z0-9]+/gi, '-').slice(0, 48).toLowerCase()}-application.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="border-t border-line px-5 py-5 sm:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[10.5px] uppercase tracking-[0.14em] text-muted">Application kit</h2>
          <p className="mt-1 max-w-[62ch] text-[11.5px] leading-relaxed text-faint">
            A CV and cover letter built from this posting, your profile and your public GitHub repositories. Every bullet must trace to something you supplied; what the posting asks for and you cannot
            evidence is listed as a gap, not written into the letter. Nothing is sent anywhere.
          </p>
        </div>
        <Button
          size="sm"
          variant={kit ? 'secondary' : 'primary'}
          loading={generate.isPending}
          onClick={() => generate.mutate(undefined)}
        >
          {kit ? <RefreshCw /> : <FileSignature />}
          {kit ? 'Rebuild' : 'Build draft'}
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="mt-4 h-40" />
      ) : !kit ? (
        <div className="mt-3 border border-dashed border-line px-4 py-6">
          <p className="text-[12.5px] text-muted">
            {generate.isError
              ? generate.error instanceof Error
                ? generate.error.message
                : 'The draft could not be built.'
              : 'No draft yet. Building one reads this posting, your profile and your public repositories, and stores the result against this record.'}
          </p>
          {!generate.isError && (
            <p className="mt-1.5 text-[11.5px] text-faint">
              More real material in your profile (summary, skills, experience) and a GitHub username means a stronger draft. With a model key the letter is written for this posting; without one it is assembled from your own words and says so.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-1 border-b border-line">
            {tabs.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setTab(entry.key)}
                className={cx(
                  '-mb-px border-b-2 px-2.5 py-1.5 text-[11.5px] transition-colors',
                  tab === entry.key ? 'border-accent text-fg' : 'border-transparent text-faint hover:text-fg',
                )}
              >
                {entry.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1.5 py-1">
              <Button size="sm" variant="ghost" onClick={copy}>
                <Copy /> Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={download}>
                <Download /> .md
              </Button>
            </div>
          </div>

          <div className="mt-3 max-w-[74ch]">
            {tab === 'cv' && (
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-[15px] font-medium leading-snug">{kit.headline}</h3>
                  {kit.summary && <p className="mt-1 text-[13px] leading-[1.65] text-fg/90">{kit.summary}</p>}
                </div>
                {kit.skills.length > 0 && (
                  <div>
                    <h4 className="text-[10.5px] uppercase tracking-[0.14em] text-faint">Skills</h4>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{kit.skills.join(' · ')}</p>
                  </div>
                )}
                {kit.experience.map((entry, index) => (
                  <div key={`${entry.role}-${index}`}>
                    <p className="text-[13px] font-medium">
                      {entry.role}
                      {entry.org && <span className="font-normal text-muted"> — {entry.org}</span>}
                      {entry.period && <span className="tnum ml-1.5 text-[11.5px] text-faint">{entry.period}</span>}
                    </p>
                    <ul className="mt-1 flex flex-col gap-1">
                      {entry.bullets.map((bullet) => (
                        <li key={bullet} className="text-[12.5px] leading-relaxed text-muted">
                          — {bullet}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {kit.projects.length > 0 && (
                  <div>
                    <h4 className="text-[10.5px] uppercase tracking-[0.14em] text-faint">Projects</h4>
                    <ul className="mt-1 flex flex-col gap-1.5">
                      {kit.projects.map((project) => (
                        <li key={project.name} className="text-[12.5px] leading-relaxed text-muted">
                          <span className="font-medium text-fg">{project.name}</span>
                          {project.url && (
                            <a href={project.url} target="_blank" rel="noreferrer noopener" className="ml-1.5 text-[11.5px] text-accent hover:underline">
                              repository
                            </a>
                          )}
                          {project.why && <span> — {project.why}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {tab === 'letter' && (
              <div className="whitespace-pre-wrap text-[13.5px] leading-[1.7] text-fg/90">{kit.coverLetter}</div>
            )}

            {tab === 'gaps' && (
              <div>
                {kit.gaps.length === 0 ? (
                  <p className="text-[12.5px] text-muted">
                    The model found no requirement in the posting that your material could not evidence.
                  </p>
                ) : (
                  <>
                    <p className="text-[11.5px] leading-relaxed text-faint">
                      Asked for in the posting, not evidenced by your profile or repositories. The draft was told not to
                      claim these — read them before you send, and say honestly what you do not have yet.
                    </p>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {kit.gaps.map((gap) => (
                        <li key={gap} className="border-l-2 border-warning/50 pl-2.5 text-[12.5px] leading-relaxed text-muted">
                          {gap}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            {tab === 'evidence' && (
              <div>
                <p className="text-[11.5px] leading-relaxed text-faint">
                  Each claim in the draft, and the fact it came from. If a line here names nothing you recognise, that
                  line should not survive into your application.
                </p>
                <ul className="mt-2 flex flex-col gap-2">
                  {kit.evidence.map((entry, index) => (
                    <li key={`${entry.claim}-${index}`} className="grid gap-0.5 border-b border-line/60 pb-2 last:border-0">
                      <span className="text-[12.5px] leading-relaxed text-fg/90">{entry.claim}</span>
                      <span className="text-[11px] text-faint">from {entry.source}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <p className="mt-4 border-t border-line/60 pt-2.5 text-[11px] leading-relaxed text-faint">
            {kit.model} · {relativeTime(kit.generatedAt)} · {kit.repoCount} repositories supplied
            {kit.notes.length ? ` · ${kit.notes.join(' ')}` : ''}
          </p>
        </div>
      )}
    </section>
  )
}
