/**
 * How a source's declared kind becomes a list marker. Pure, so the rule can be
 * tested without a browser.
 *
 * Only declared data is read: the source's kind, or a work type the row itself
 * carries. A title or a description is never inspected. Directory and community
 * rows stay unmarked: they are prospects and conversations, not offered work.
 */
import type { SourceKind } from './types'

export type WorkMark = 'gig' | 'contract' | 'job' | 'bounty'

export function workMarker(
  kind: SourceKind | null | undefined,
  workType: 'gig' | null | undefined,
): WorkMark | null {
  if (workType === 'gig') return 'contract'
  if (kind === 'bounty') return 'bounty'
  if (kind === 'gig') return 'gig'
  if (kind === 'tender') return 'contract'
  if (kind === 'ats' || kind === 'feed') return 'job'
  return null
}
