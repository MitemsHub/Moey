import type { RawOpportunity } from './adapters'
import { stripHtml } from './adapters'

export interface Normalised {
  title: string
  org: string | null
  url: string
  externalId: string
  body: string
  location: string | null
  remote: boolean | null
  publishedAt: number | null
  deadline: number | null
  compMin: number | null
  compMax: number | null
  compCurrency: string | null
  signal: 'explicit' | 'emerging'
  tags: string[]
  contentHash: string
}

const MAX_BODY = 20_000

/**
 * FNV-1a over a canonical string. Not cryptographic — it only has to be stable
 * across runs and cheap, because dedupe compares hashes, not content.
 */
export function hash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function canonicalTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(senior|sr|junior|jr|lead|principal|staff|remote|contract|full[- ]time|part[- ]time)\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalise(
  raw: RawOpportunity,
  defaults: { pipeline: 'individual' | 'business'; signal: 'explicit' | 'emerging'; adapter: string },
): Normalised | null {
  const title = stripHtml(raw.title).replace(/\s+/g, ' ').trim()
  const url = (raw.url ?? '').trim()
  if (!title || !url) return null
  if (!/^https?:\/\//i.test(url)) return null

  const body = stripHtml(raw.text ?? '').slice(0, MAX_BODY)
  const org = raw.org ? stripHtml(raw.org).replace(/\s+/g, ' ').trim().slice(0, 160) : null
  const signal = raw.signal ?? defaults.signal

  return {
    title: title.slice(0, 300),
    org,
    url,
    externalId: (raw.externalId || hash(url)).slice(0, 200),
    body,
    location: raw.location ? String(raw.location).slice(0, 160) : null,
    remote: raw.remote ?? null,
    publishedAt: raw.publishedAt ?? null,
    deadline: raw.deadline ?? null,
    compMin: raw.compensation?.min ?? null,
    compMax: raw.compensation?.max ?? null,
    compCurrency: raw.compensation?.currency ?? null,
    signal,
    tags: (raw.tags ?? []).map((t) => String(t).slice(0, 40)).slice(0, 12),
    // Title + org are the identity; descriptions change on re-edit, so they are
    // excluded — otherwise the same posting would dedupe as new every scan.
    contentHash: hash(`${canonicalTitle(title)}|${(org ?? '').toLowerCase()}`),
  }
}

/** Token overlap used for the fuzzy pass when two sources report the same role. */
export function similarity(a: string, b: string): number {
  const left = new Set(canonicalTitle(a).split(' ').filter((w) => w.length > 2))
  const right = new Set(canonicalTitle(b).split(' ').filter((w) => w.length > 2))
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const token of left) if (right.has(token)) shared++
  return shared / Math.max(left.size, right.size)
}
