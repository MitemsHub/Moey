import type { Pipeline, SignalType, SourceKind } from '../shared/types'

export interface RawOpportunity {
  externalId: string
  title: string
  org?: string | null
  url: string
  text?: string
  location?: string | null
  remote?: boolean | null
  publishedAt?: number | null
  deadline?: number | null
  compensation?: { min?: number; max?: number; currency?: string } | null
  signal?: SignalType
  tags?: string[]
}

export interface AdapterDefaults {
  pipeline: Pipeline
  signal: SignalType
}

export interface AdapterContext extends AdapterDefaults {
  config: Record<string, unknown>
  /** Abort after this many milliseconds so one slow source cannot hold a scan. */
  timeoutMs: number
}

export interface Adapter {
  key: string
  label: string
  kind: SourceKind
  pipeline: Pipeline | 'both'
  /** What this adapter contributes, shown in the source registry. */
  note: string
  attribution: { label: string; url: string }
  /** Non-empty means the adapter cannot run until configured. */
  needs: 'board-list' | 'api-key' | 'feed-urls' | null
  configHint: string
  fetch(ctx: AdapterContext): Promise<RawOpportunity[]>
}

const UA = 'MitemshubOpportunityEngine/1.0 (+adapter; respects robots and terms)'

export function fetchJson<T>(url: string, init: RequestInit & { timeoutMs: number }): Promise<T> {
  const { timeoutMs, ...rest } = init
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, {
    ...rest,
    signal: controller.signal,
    headers: { accept: 'application/json', 'user-agent': UA, ...(rest.headers ?? {}) },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      return (await response.json()) as T
    })
    .finally(() => clearTimeout(timer))
}

/** Same fetch discipline as fetchJson, for the RSS feeds that return XML. */
export function fetchText(url: string, init: RequestInit & { timeoutMs: number }): Promise<string> {
  const { timeoutMs, ...rest } = init
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, {
    ...rest,
    signal: controller.signal,
    headers: { accept: 'application/rss+xml, application/xml, text/xml', 'user-agent': UA, ...(rest.headers ?? {}) },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      return response.text()
    })
    .finally(() => clearTimeout(timer))
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '\u2026', mdash: '\u2014',
  ndash: '\u2013', rsquo: '\u2019', lsquo: '\u2018', ldquo: '\u201c', rdquo: '\u201d', bull: '\u2022',
  middot: '\u00b7', copy: '\u00a9', reg: '\u00ae', trade: '\u2122', deg: '\u00b0', euro: '\u20ac',
  pound: '\u00a3', times: '\u00d7', laquo: '\u00ab', raquo: '\u00bb', eacute: '\u00e9', egrave: '\u00e8',
  agrave: '\u00e0', ccedil: '\u00e7', uuml: '\u00fc', ouml: '\u00f6', auml: '\u00e4', szlig: '\u00df',
}

/** Decodes the entities that actually appear in job-board and tender feeds. */
export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (match, hex: string) => {
      const code = Number.parseInt(hex, 16)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    })
    .replace(/&#(\d+);/g, (match, dec: string) => {
      const code = Number.parseInt(dec, 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    })
    .replace(/&([a-z][a-z0-9]*);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
}

export function stripHtml(input: string | undefined | null): string {
  if (!input) return ''
  return decodeEntities(
    input
      .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, ' ')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/\s*(p|li|div|h[1-6])\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function toEpoch(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return value < 1e12 ? Math.round(value * 1000) : Math.round(value)
  const text = String(value).trim()
  // EU TED sends a date with an offset but no time: "2026-08-03+02:00", which
  // Date.parse rejects outright. Without this, every tender looked undated.
  const dateWithOffset = /^(\d{4}-\d{2}-\d{2})([+-]\d{2}:\d{2})$/.exec(text)
  const parsed = Date.parse(dateWithOffset ? `${dateWithOffset[1]}T00:00:00${dateWithOffset[2]}` : text)
  return Number.isNaN(parsed) ? null : parsed
}

export function isRemote(text: string): boolean {
  return /\b(remote|anywhere|distributed|work from home|wfh)\b/i.test(text)
}

function boards(config: Record<string, unknown>): string[] {
  const list = config.boards
  if (!Array.isArray(list)) return []
  return list.map((v) => String(v).trim()).filter(Boolean)
}

/**
 * Greenhouse. Public board API that powers the employer's own careers page.
 * Per-employer only: we must already know the board token (config.boards).
 */
const greenhouse: Adapter = {
  key: 'greenhouse',
  label: 'Greenhouse boards',
  kind: 'ats',
  pipeline: 'both',
  note: 'Public JSON per employer board. Needs a curated list of board tokens.',
  attribution: { label: 'Greenhouse', url: 'https://boards.greenhouse.io' },
  needs: 'board-list',
  configHint: '{ "boards": ["stripe", "figma"] }',
  async fetch(ctx) {
    const list = boards(ctx.config)
    const out: RawOpportunity[] = []
    for (const board of list) {
      // One slow or dead board must not throw away the dozen that worked.
      const data = await fetchJson<{ jobs?: Record<string, unknown>[] }>(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs`,
        { timeoutMs: ctx.timeoutMs },
      ).catch(() => ({ jobs: [] as Record<string, unknown>[] }))
      const perBoard: RawOpportunity[] = []
      for (const job of data.jobs ?? []) {
        const loc = (job.location as { name?: string } | undefined)?.name ?? null
        const title = String(job.title ?? '').trim()
        if (!title) continue
        perBoard.push({
          externalId: `gh:${board}:${job.id}`,
          title,
          org: String(job.company_name ?? board),
          url: String(job.absolute_url ?? ''),
          location: loc,
          remote: isRemote(`${title} ${loc ?? ''}`),
          publishedAt: toEpoch(job.first_published ?? job.updated_at),
        })
      }
      out.push(...capPerBoard(perBoard, ctx.config.maxPerBoard))
    }
    return out
  },
}

/** Lever. Public postings API; no key, one request per company slug. */
const lever: Adapter = {
  key: 'lever',
  label: 'Lever postings',
  kind: 'ats',
  pipeline: 'both',
  note: 'Public postings API. Needs a curated list of company slugs.',
  attribution: { label: 'Lever', url: 'https://jobs.lever.co' },
  needs: 'board-list',
  configHint: '{ "boards": ["spotify", "netflix"] }',
  async fetch(ctx) {
    const out: RawOpportunity[] = []
    for (const board of boards(ctx.config)) {
      const data = await fetchJson<Record<string, unknown>[]>(
        `https://api.lever.co/v0/postings/${encodeURIComponent(board)}?mode=json`,
        { timeoutMs: ctx.timeoutMs },
      ).catch(() => [] as Record<string, unknown>[])
      const perBoard: RawOpportunity[] = []
      for (const post of Array.isArray(data) ? data : []) {
        const categories = (post.categories as Record<string, unknown> | undefined) ?? {}
        const title = String(post.text ?? '').trim()
        if (!title) continue
        perBoard.push({
          externalId: `lever:${board}:${post.id}`,
          title,
          org: board,
          url: String(post.hostedUrl ?? post.applyUrl ?? ''),
          location: (categories.location as string) ?? null,
          remote: isRemote(`${title} ${categories.location ?? ''} ${post.workplaceType ?? ''}`),
          publishedAt: toEpoch(post.createdAt),
          text: stripHtml(
            `${post.descriptionPlain ?? post.description ?? ''}\n${(post.lists as { text?: string }[] | undefined)
              ?.map((l) => l.text)
              .join('\n') ?? ''}`,
          ),
        })
      }
      out.push(...capPerBoard(perBoard, ctx.config.maxPerBoard))
    }
    return out
  },
}

/** Ashby. Documented public job-posting API, includes compensation when published. */
const ashby: Adapter = {
  key: 'ashby',
  label: 'Ashby job boards',
  kind: 'ats',
  pipeline: 'both',
  note: 'Documented public posting API with optional compensation. Needs board names.',
  attribution: { label: 'Ashby', url: 'https://jobs.ashbyhq.com' },
  needs: 'board-list',
  configHint: '{ "boards": ["linear", "ramp"] }',
  async fetch(ctx) {
    const out: RawOpportunity[] = []
    for (const board of boards(ctx.config)) {
      const data = await fetchJson<{ jobs?: Record<string, unknown>[] }>(
        `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`,
        { timeoutMs: ctx.timeoutMs },
      ).catch(() => ({ jobs: [] as Record<string, unknown>[] }))
      const perBoard: RawOpportunity[] = []
      for (const job of data.jobs ?? []) {
        const title = String(job.title ?? '').trim()
        if (!title) continue
        const comp = job.compensation as
          | { compensationTierSummary?: string; summaryComponents?: { minValue?: number; maxValue?: number; currencyCode?: string }[] }
          | undefined
        const component = comp?.summaryComponents?.[0]
        perBoard.push({
          externalId: `ashby:${board}:${job.id}`,
          title,
          org: board,
          url: String(job.jobUrl ?? ''),
          location: (job.location as string) ?? null,
          remote: job.isRemote === true || isRemote(`${title} ${job.location ?? ''}`),
          publishedAt: toEpoch(job.publishedAt),
          text: stripHtml((job.descriptionPlain as string) ?? (job.descriptionHtml as string) ?? ''),
          compensation: component
            ? { min: component.minValue, max: component.maxValue, currency: component.currencyCode }
            : null,
        })
      }
      out.push(...capPerBoard(perBoard, ctx.config.maxPerBoard))
    }
    return out
  },
}

/**
 * One large employer can post 2,500 openings and bury every other company. Cap
 * each board to its most recent N so widening the board list widens coverage
 * instead of just multiplying volume.
 */
function capPerBoard(items: RawOpportunity[], configured: unknown): RawOpportunity[] {
  const max = Math.min(Math.max(Number(configured ?? 40), 1), 400)
  if (items.length <= max) return items
  return [...items]
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    .slice(0, max)
}

/** Jobicy. Public remote-job API; commercial use permitted with visible credit. */
const jobicy: Adapter = {
  key: 'jobicy',
  label: 'Jobicy remote jobs',
  kind: 'feed',
  pipeline: 'individual',
  note: 'Keyless remote feed. Terms permit commercial use with attribution; poll at most hourly.',
  attribution: { label: 'Jobicy', url: 'https://jobicy.com' },
  needs: null,
  configHint: '{ "count": 50, "industry": "technology" }',
  async fetch(ctx) {
    const count = Number(ctx.config.count ?? 50)
    const industry = ctx.config.industry ? String(ctx.config.industry) : ''
    const url = `https://jobicy.com/api/v2/remote-jobs?count=${Math.min(Math.max(count, 1), 100)}${
      industry ? `&industry=${encodeURIComponent(industry)}` : ''
    }`
    const data = await fetchJson<{ jobs?: Record<string, unknown>[] }>(url, { timeoutMs: ctx.timeoutMs })
    return (data.jobs ?? []).map((job) => ({
      externalId: `jobicy:${job.id}`,
      title: String(job.jobTitle ?? '').trim(),
      org: String(job.companyName ?? '') || null,
      url: String(job.url ?? ''),
      location: (job.jobGeo as string) ?? null,
      remote: true,
      publishedAt: toEpoch(job.pubDate),
      // Jobicy ships both a short `jobExcerpt` and the full `jobDescription`. Taking
      // the excerpt scored every row on a teaser; the full text is the real signal.
      text: stripHtml(
        (job.jobDescription as string) || (job.jobExcerpt as string) || '',
      ),
      tags: Array.isArray(job.jobIndustry) ? job.jobIndustry.map(String) : undefined,
    }))
  },
}

/** Hacker News. Algolia search over public HN content — discussion of real problems. */
const hackerNews: Adapter = {
  key: 'hn',
  label: 'Hacker News',
  kind: 'community',
  pipeline: 'both',
  note: 'Public Algolia search. Used for emerging signals: people describing unmet needs.',
  attribution: { label: 'Hacker News', url: 'https://news.ycombinator.com' },
  needs: null,
  configHint: '{ "queries": ["looking for a freelancer"], "sinceDays": 3 }',
  async fetch(ctx) {
    const queries = Array.isArray(ctx.config.queries)
      ? ctx.config.queries.map(String)
      : ['freelance developer needed', 'looking for a consultant']
    const sinceDays = Number(ctx.config.sinceDays ?? 3)
    const since = Math.floor((Date.now() - sinceDays * 86_400_000) / 1000)
    const out: RawOpportunity[] = []
    for (const query of queries) {
      const data = await fetchJson<{ hits?: Record<string, unknown>[] }>(
        `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=25`,
        { timeoutMs: ctx.timeoutMs },
      )
      for (const hit of data.hits ?? []) {
        const title = String(hit.title ?? '').trim()
        if (!title) continue
        out.push({
          externalId: `hn:${hit.objectID}`,
          title,
          org: null,
          url: String(hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`),
          publishedAt: toEpoch(hit.created_at_i),
          text: stripHtml((hit.story_text as string) ?? ''),
          signal: 'emerging',
        })
      }
    }
    return out
  },
}

/**
 * TED returns every text field as a multilingual object (`{ eng: ["…"], fra: [...] }`)
 * or an array, depending on the field. Normalise to one string, preferring English.
 */
function pickLang(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return pickLang(value[0])
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return pickLang(record.eng ?? record.ENG ?? Object.values(record)[0])
  }
  return ''
}

/** EU TED. Free reuse, no key for published notices. Highest signal per request. */
const ted: Adapter = {
  key: 'ted',
  label: 'EU TED tenders',
  kind: 'tender',
  pipeline: 'business',
  note: 'EU public procurement notices. Free reuse under the EU reuse policy; no key needed.',
  attribution: { label: 'TED · EU Publications Office', url: 'https://ted.europa.eu' },
  needs: null,
  configHint: 'FT~"software" — full-text expert query, e.g. FT~"web development"',
  async fetch(ctx) {
    // The API requires `fields` to be non-empty and an expert query using FT~"…".
    // Both were confirmed against the live endpoint before shipping this adapter.
    const phrase = String(ctx.config.query ?? 'FT~"software" OR FT~"web development" OR FT~"data analysis"')
    // `scope: ACTIVE` still returns notices from 2016 (qualification systems stay
    // open for a decade). An explicit publication-date bound is the only thing that
    // keeps decade-old notices out of a “today’s leads” board. The API wants
    // YYYYMMDD with no separators, and 400s on an ISO date.
    const sinceDays = Math.min(Math.max(Number(ctx.config.sinceDays ?? 120), 1), 3650)
    const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10).replace(/-/g, '')
    const query = /publication-date/i.test(phrase) ? phrase : `(${phrase}) AND publication-date>=${since}`
    const data = await fetchJson<{ notices?: Record<string, unknown>[] }>(
      'https://api.ted.europa.eu/v3/notices/search',
      {
        method: 'POST',
        timeoutMs: ctx.timeoutMs,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query,
          fields: [
            'publication-number',
            'notice-title',
            'buyer-name',
            'publication-date',
            'deadline-receipt-tender-date-lot',
            'notice-type',
            'description-lot',
          ],
          page: 1,
          limit: Math.min(Number(ctx.config.limit ?? 40), 100),
          scope: 'ACTIVE',
        }),
      },
    )
    return (data.notices ?? []).flatMap((n) => {
      const publication = pickLang(n['publication-number'])
      const title = pickLang(n['notice-title']).trim() || `Tender ${publication}`
      if (!publication) return []
      return [
        {
          externalId: `ted:${publication}`,
          title,
          org: pickLang(n['buyer-name']) || null,
          url: `https://ted.europa.eu/en/notice/-/detail/${publication}`,
          publishedAt: toEpoch(pickLang(n['publication-date'])),
          deadline: toEpoch(pickLang(n['deadline-receipt-tender-date-lot'])),
          signal: 'explicit',
          text: stripHtml(pickLang(n['description-lot'])),
        } satisfies RawOpportunity,
      ]
    })
  },
}

/** SAM.gov. Federal opportunities; requires a free API key stored as a secret. */
const sam: Adapter = {
  key: 'sam',
  label: 'SAM.gov opportunities',
  kind: 'tender',
  pipeline: 'business',
  note: 'US federal contract opportunities. Needs a free API key; daily request caps apply.',
  attribution: { label: 'SAM.gov', url: 'https://sam.gov' },
  needs: 'api-key',
  configHint: '{ "keywords": ["web development", "data analytics"] }',
  async fetch(ctx) {
    const apiKey = String(ctx.config.apiKey ?? '')
    if (!apiKey) throw new Error('SAM.gov needs an API key in the source config secret.')
    const keywords = Array.isArray(ctx.config.keywords)
      ? ctx.config.keywords.map(String)
      : ['web development', 'data analytics']
    const out: RawOpportunity[] = []
    const fmt = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
    const to = new Date()
    const from = new Date(Date.now() - 7 * 86_400_000)
    for (const keyword of keywords) {
      const url =
        `https://api.sam.gov/opportunities/v2/search?api_key=${encodeURIComponent(apiKey)}` +
        `&postedFrom=${fmt(from)}&postedTo=${fmt(to)}&limit=25&q=${encodeURIComponent(keyword)}`
      const data = await fetchJson<{ opportunitiesData?: Record<string, unknown>[] }>(url, {
        timeoutMs: ctx.timeoutMs,
      })
      for (const o of data.opportunitiesData ?? []) {
        out.push({
          externalId: `sam:${o.noticeId}`,
          title: String(o.title ?? '').trim(),
          org: (o.organizationName as string) ?? (o.department as string) ?? null,
          url: (o.uiLink as string) ?? '',
          publishedAt: toEpoch(o.postedDate),
          deadline: toEpoch(o.responseDeadLine),
          signal: 'explicit',
          text: stripHtml((o.description as string) ?? ''),
        })
      }
    }
    return out
  },
}

/**
 * Mastodon. Public hashtag timelines are readable without an account or a key,
 * which is why this is the one "social" source that ships: the alternatives need
 * credentials that only the operator can create (see docs/SOURCES.md).
 *
 * Everything here is an EMERGING signal. A post saying "I need a developer" is a
 * person describing a problem, not a published contract, so it must never be
 * presented as an opportunity that exists.
 */
const mastodon: Adapter = {
  key: 'mastodon',
  label: 'Mastodon hashtags',
  kind: 'community',
  pipeline: 'both',
  note: 'Public hashtag timelines. Emerging signals only; no key needed.',
  attribution: { label: 'Mastodon', url: 'https://joinmastodon.org' },
  needs: null,
  configHint: '{ "instance": "mastodon.social", "tags": ["freelance", "hiring"] }',
  async fetch(ctx) {
    const instance = String(ctx.config.instance ?? 'mastodon.social').replace(/^https?:\/\//, '')
    const tags = Array.isArray(ctx.config.tags)
      ? ctx.config.tags.map(String)
      : ['freelance', 'hiring']
    const out: RawOpportunity[] = []
    for (const tag of tags.slice(0, 4)) {
      const data = await fetchJson<Record<string, unknown>[]>(
        `https://${instance}/api/v1/timelines/tag/${encodeURIComponent(tag)}?limit=20`,
        { timeoutMs: ctx.timeoutMs },
      )
      for (const post of Array.isArray(data) ? data : []) {
        const text = stripHtml((post.content as string) ?? '')
        if (text.length < 40) continue
        const account = post.account as { acct?: string } | undefined
        const url = String(post.url ?? (post.uri as string) ?? '')
        // Posts have no title; the first line is the closest honest equivalent.
        // Hashtag timelines carry fragments like "[2/2]" that are not a subject at all.
        const title = text.split('\n')[0].slice(0, 120)
        if (title.length < 20) continue
        out.push({
          externalId: `mastodon:${post.id}`,
          title,
          org: account?.acct ? `@${account.acct}` : null,
          url,
          publishedAt: toEpoch(post.created_at),
          text,
          signal: 'emerging',
        })
      }
    }
    return out
  },
}

/** Minimal RSS reader — enough for the job feeds, which all use the same four tags. */
function parseRss(xml: string): { title: string; link: string; date: string; text: string }[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []
  return items.map((item) => ({
    title: (/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(item)?.[1] ?? '').trim(),
    link: (/<link>([\s\S]*?)<\/link>/i.exec(item)?.[1] ?? '').trim(),
    date: (/<pubDate>([\s\S]*?)<\/pubDate>/i.exec(item)?.[1] ?? '').trim(),
    text: stripHtml(/<description>([\s\S]*?)<\/description>/i.exec(item)?.[1] ?? ''),
  }))
}

/** Remotive. Keyless; requires attribution and no mass republication. */
const remotive: Adapter = {
  key: 'remotive',
  label: 'Remotive',
  kind: 'feed',
  pipeline: 'individual',
  note: 'Keyless remote feed. Attribution required; poll infrequently.',
  attribution: { label: 'Remotive', url: 'https://remotive.com' },
  needs: null,
  configHint: '{ "limit": 50 }',
  async fetch(ctx) {
    const limit = Math.min(Number(ctx.config.limit ?? 50), 100)
    const data = await fetchJson<{ jobs?: Record<string, unknown>[] }>(
      `https://remotive.com/api/remote-jobs?limit=${limit}`,
      { timeoutMs: ctx.timeoutMs },
    )
    return (data.jobs ?? []).flatMap((job) => {
      const title = String(job.title ?? '').trim()
      const url = String(job.url ?? '')
      if (!title || !url) return []
      return [{
        externalId: `remotive:${job.id}`,
        title,
        org: String(job.company_name ?? '') || null,
        url,
        location: (job.candidate_required_location as string) ?? null,
        remote: true,
        publishedAt: toEpoch(job.publication_date),
        text: stripHtml(job.description as string),
        tags: Array.isArray(job.tags) ? job.tags.map(String) : undefined,
      } satisfies RawOpportunity]
    })
  },
}

/** Arbeitnow. Keyless; EU-weighted, so it also feeds the business pipeline's geography. */
const arbeitnow: Adapter = {
  key: 'arbeitnow',
  label: 'Arbeitnow',
  kind: 'feed',
  pipeline: 'both',
  note: 'Keyless job-board API, EU-weighted. Free for reuse with attribution.',
  attribution: { label: 'Arbeitnow', url: 'https://www.arbeitnow.com' },
  needs: null,
  configHint: '{ "pages": 1 }',
  async fetch(ctx) {
    const pages = Math.min(Math.max(Number(ctx.config.pages ?? 1), 1), 5)
    const out: RawOpportunity[] = []
    for (let page = 1; page <= pages; page++) {
      const data = await fetchJson<{ data?: Record<string, unknown>[] }>(
        `https://www.arbeitnow.com/api/job-board-api?page=${page}`,
        { timeoutMs: ctx.timeoutMs },
      )
      for (const job of data.data ?? []) {
        const title = String(job.title ?? '').trim()
        const url = String(job.url ?? '')
        if (!title || !url) continue
        out.push({
          externalId: `arbeitnow:${job.slug}`,
          title,
          org: String(job.company_name ?? '') || null,
          url,
          location: (job.location as string) ?? null,
          remote: job.remote === true,
          publishedAt: toEpoch(job.created_at),
          text: stripHtml(job.description as string),
          tags: Array.isArray(job.tags) ? job.tags.map(String) : undefined,
        })
      }
    }
    return out
  },
}

const himalayas: Adapter = {
  key: 'himalayas',
  label: 'Himalayas',
  kind: 'feed',
  pipeline: 'individual',
  note: 'Keyless remote jobs feed. Attribution required.',
  attribution: { label: 'Himalayas', url: 'https://himalayas.app' },
  needs: null,
  configHint: '{ "limit": 50 }',
  async fetch(ctx) {
    const limit = Math.min(Number(ctx.config.limit ?? 50), 100)
    const data = await fetchJson<{ jobs?: Record<string, unknown>[] }>(
      `https://himalayas.app/jobs/api?limit=${limit}`,
      { timeoutMs: ctx.timeoutMs },
    )
    return (data.jobs ?? []).flatMap((job) => {
      const title = String(job.title ?? '').trim()
      const url = String(job.applicationLink ?? job.guid ?? '')
      if (!title || !url) return []
      return [{
        externalId: `himalayas:${job.guid ?? title}`,
        title,
        org: String(job.companyName ?? '') || null,
        url,
        remote: true,
        publishedAt: toEpoch(job.pubDate),
        text: stripHtml((job.description as string) ?? ''),
      } satisfies RawOpportunity]
    })
  },
}

/** RemoteOK. Its terms require a visible link back, which the attribution row supplies. */
const remoteok: Adapter = {
  key: 'remoteok',
  label: 'Remote OK',
  kind: 'feed',
  pipeline: 'individual',
  note: 'Keyless JSON. Terms require attribution with a link back to Remote OK.',
  attribution: { label: 'Remote OK', url: 'https://remoteok.com' },
  needs: null,
  configHint: '{ "tag": "dev" }',
  async fetch(ctx) {
    const tag = ctx.config.tag ? String(ctx.config.tag) : ''
    const data = await fetchJson<Record<string, unknown>[]>(
      `https://remoteok.com/api${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`,
      { timeoutMs: ctx.timeoutMs },
    )
    // The first element of this array is a legal notice, not a job.
    return (Array.isArray(data) ? data : []).flatMap((job) => {
      const title = String(job.position ?? '').trim()
      const url = String(job.url ?? '')
      if (!title || !url || !job.id) return []
      return [{
        externalId: `remoteok:${job.id}`,
        title,
        org: String(job.company ?? '') || null,
        url,
        location: (job.location as string) ?? null,
        remote: true,
        publishedAt: toEpoch(job.date),
        text: stripHtml(job.description as string),
        tags: Array.isArray(job.tags) ? job.tags.map(String) : undefined,
        compensation: job.salary_min
          ? { min: Number(job.salary_min), max: Number(job.salary_max ?? 0) || undefined, currency: 'USD' }
          : null,
      } satisfies RawOpportunity]
    })
  },
}

const workingNomads: Adapter = {
  key: 'workingnomads',
  label: 'Working Nomads',
  kind: 'feed',
  pipeline: 'individual',
  note: 'Keyless remote jobs API. Attribution required.',
  attribution: { label: 'Working Nomads', url: 'https://www.workingnomads.com' },
  needs: null,
  configHint: '{ "category": "development" }',
  async fetch(ctx) {
    const category = ctx.config.category ? `?category=${encodeURIComponent(String(ctx.config.category))}` : ''
    const data = await fetchJson<Record<string, unknown>[]>(
      `https://www.workingnomads.com/api/exposed_jobs/${category}`,
      { timeoutMs: ctx.timeoutMs },
    )
    return (Array.isArray(data) ? data : []).flatMap((job) => {
      const title = String(job.title ?? '').trim()
      const url = String(job.url ?? '')
      if (!title || !url) return []
      return [{
        externalId: `workingnomads:${job.id}`,
        title,
        org: String(job.company_name ?? '') || null,
        url,
        location: (job.location as string) ?? null,
        remote: true,
        publishedAt: toEpoch(job.pub_date),
        text: stripHtml(job.description as string),
        tags: Array.isArray(job.tags) ? job.tags.map(String) : undefined,
      } satisfies RawOpportunity]
    })
  },
}

const weWorkRemotely: Adapter = {
  key: 'weworkremotely',
  label: 'We Work Remotely',
  kind: 'feed',
  pipeline: 'individual',
  note: 'Public RSS feed. Attribution required.',
  attribution: { label: 'We Work Remotely', url: 'https://weworkremotely.com' },
  needs: null,
  configHint: '{ "category": "remote-programming-jobs" }',
  async fetch(ctx) {
    const category = String(ctx.config.category ?? 'remote-programming-jobs')
    const xml = await fetchText(
      `https://weworkremotely.com/categories/${encodeURIComponent(category)}.rss`,
      { timeoutMs: ctx.timeoutMs },
    )
    return parseRss(xml).flatMap((item) => {
      if (!item.title || !item.link) return []
      // Titles are "Company: Role" in this feed.
      const [company, role] = item.title.split(':').length > 1
        ? [item.title.split(':')[0].trim(), item.title.split(':').slice(1).join(':').trim()]
        : [null, item.title]
      return [{
        externalId: `wwr:${hashish(item.link)}`,
        title: role || item.title,
        org: company,
        url: item.link,
        remote: true,
        publishedAt: toEpoch(item.date),
        text: item.text,
        tags: [category.replace(/-/g, ' ')],
      } satisfies RawOpportunity]
    })
  },
}

/**
 * Freelancer.com — a GIG marketplace, not a job board. Public read endpoint, no key
 * for this call shape. Projects are explicit demand from a named buyer, which is
 * the closest thing to a written brief that exists in open data.
 */
const freelancer: Adapter = {
  key: 'freelancer',
  label: 'Freelancer.com projects',
  kind: 'gig',
  pipeline: 'individual',
  note: 'Public active-projects endpoint. Explicit demand from a named buyer; no key for this call.',
  attribution: { label: 'Freelancer.com', url: 'https://www.freelancer.com' },
  needs: null,
  configHint: '{ "limit": 40 }',
  async fetch(ctx) {
    const limit = Math.min(Number(ctx.config.limit ?? 40), 100)
    const data = await fetchJson<{ result?: { projects?: Record<string, unknown>[] } }>(
      `https://www.freelancer.com/api/projects/0.1/projects/active/?limit=${limit}&job_details=true&full_description=true`,
      { timeoutMs: ctx.timeoutMs },
    )
    return (data.result?.projects ?? []).flatMap((project) => {
      const title = String(project.title ?? '').trim()
      // seo_url is a relative path; the canonical public URL needs the /projects/ prefix.
      const url = project.seo_url ? `https://www.freelancer.com/projects/${String(project.seo_url)}` : ''
      if (!title || !url) return []
      const budget = (project.budget as { minimum?: number; maximum?: number } | undefined) ?? {}
      return [{
        externalId: `freelancer:${project.id}`,
        title,
        org: null,
        url,
        publishedAt: toEpoch(project.time_submitted),
        text: stripHtml((project.description as string) ?? (project.preview_description as string) ?? ''),
        compensation: budget.minimum
          ? {
              min: budget.minimum,
              max: budget.maximum ?? undefined,
              currency: (project.currency as { code?: string } | undefined)?.code ?? 'USD',
            }
          : null,
        signal: 'explicit',
      } satisfies RawOpportunity]
    })
  },
}

/**
 * OpenStreetMap: businesses that exist, have a name, and have no website recorded.
 *
 * This is the "sell ourselves" source. A restaurant with no `website` tag is a
 * PROSPECT — not a request for anything. It is therefore an EMERGING signal with a
 * rationale that says exactly what was observed and when, and it must never be
 * presented as a business that asked for help.
 *
 * Data is ODbL: attribution is required, which the source row carries.
 */
/** Default coverage: four Lagos districts unioned into one query (~1,200 km²). */
const DEFAULT_AREAS = [
  [6.42, 3.3, 6.46, 3.36],
  [6.44, 3.36, 6.48, 3.42],
  [6.46, 3.4, 6.5, 3.46],
  [6.5, 3.34, 6.55, 3.42],
]

/**
 * The tags the scorer reads: which gap this is, plus the contact details that actually
 * exist upstream. A business with no recorded phone must not look reachable. The business
 * category is not a tag — it is already in the title.
 */
function prospectTags(tags: Record<string, string>, gap: string): string[] {
  return [gap, ...(tags.phone ? ['has-phone'] : []), ...(tags['addr:street'] ? ['has-address'] : [])]
}

const DEFAULT_KINDS = ['restaurant', 'cafe', 'hairdresser', 'dentist', 'gym']

interface OverpassElement {
  id: number
  lat: number
  lon: number
  tags: Record<string, string>
}

/**
 * One box, or several unioned into one request — several is how a default covers a city
 * without paying for a request per district. Boxes are [south, west, north, east]; an
 * inverted box (west > east) is read as an anti-meridian span and would return the other
 * side of the world, so it is dropped rather than sent.
 */
function resolveBoxes(config: Record<string, unknown>): number[][] {
  const raw = Array.isArray(config.area) ? [config.area] : config.areas
  return (Array.isArray(raw) ? raw : DEFAULT_AREAS)
    .map((box) => (Array.isArray(box) ? box.map(Number) : []))
    .filter((box) => box.length === 4 && box.every(Number.isFinite))
    .filter(([s, w, n, e]) => s < n && w < e)
}

function resolveKinds(config: Record<string, unknown>): string[] {
  return Array.isArray(config.kinds) ? config.kinds.map(String) : DEFAULT_KINDS
}

/**
 * The public Overpass instances are volunteer-run and regularly answer 502 under load,
 * so the same query is tried against each mirror in turn. Overpass is a batch service:
 * a 12s budget is not realistic for it, unlike the JSON feeds, hence the floor.
 */
async function overpass(query: string, timeoutMs: number): Promise<OverpassElement[]> {
  const mirrors = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ]
  let lastError = 'no mirror answered'
  for (const mirror of mirrors) {
    try {
      const response = await fetch(mirror, {
        method: 'POST',
        signal: AbortSignal.timeout(Math.max(timeoutMs, 45_000)),
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
        body: `data=${encodeURIComponent(query)}`,
      })
      if (!response.ok) {
        lastError = `${response.status} ${response.statusText}`
        continue
      }
      const payload = (await response.json()) as { elements?: OverpassElement[] }
      return payload.elements ?? []
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }
  throw new Error(lastError)
}

const osm: Adapter = {
  key: 'osm',
  label: 'OSM: businesses with no website',
  kind: 'directory',
  pipeline: 'business',
  note: 'OpenStreetMap places with no website tag. Prospects, not requests. ODbL attribution required.',
  attribution: { label: 'OpenStreetMap contributors (ODbL)', url: 'https://www.openstreetmap.org/copyright' },
  needs: null,
  configHint: '{ "areas": [[6.43,3.34,6.47,3.42],[6.47,3.34,6.51,3.42]], "kinds": ["restaurant", "cafe", "hairdresser"], "limit": 120 }',
  async fetch(ctx) {
    const boxes = resolveBoxes(ctx.config)
    if (!boxes.length) return []
    const kinds = resolveKinds(ctx.config)
    const limit = Math.min(Math.max(Number(ctx.config.limit ?? 60), 1), 200)

    const filter = kinds.join('|')
    const clauses = boxes
      .map((box) => `node["amenity"~"^(${filter})$"]["name"]["website"!~"."]["contact:website"!~"."](${box.join(',')});`)
      .join('\n')
    const query = `[out:json][timeout:25];\n(\n${clauses}\n);\nout ${limit};`

    const elements = await overpass(query, ctx.timeoutMs)

    return elements.flatMap((element) => {
      const tags = element.tags ?? {}
      const name = tags.name?.trim()
      if (!name) return []
      const kind = (tags.amenity ?? 'business').replace(/_/g, ' ')
      // Fall back to the point, never to the bounding box: the box is an area the
      // operator chose, not where this business is.
      const place =
        [tags['addr:street'], tags['addr:city']].filter(Boolean).join(', ') ||
        `${element.lat.toFixed(4)}, ${element.lon.toFixed(4)}`
      return [{
        // Date-stamped: "no website" is true when observed, and websites appear later.
        externalId: `osm:${element.id}:${new Date().toISOString().slice(0, 10)}`,
        title: `${name} — ${kind}, no website listed`,
        org: name,
        url: `https://www.openstreetmap.org/node/${element.id}`,
        location: place,
        remote: false,
        publishedAt: null,
        signal: 'emerging' as const,
        text: [
          `${name} is a ${kind} recorded in OpenStreetMap at ${place}.`,
          'As of this scan it had no website or contact:website tag.',
          tags.phone ? `Phone recorded: ${tags.phone}.` : 'No phone recorded.',
          tags.opening_hours ? `Opening hours: ${tags.opening_hours}.` : '',
          'This is an observation from public map data, not a request for work.',
        ].filter(Boolean).join(' '),
        tags: prospectTags(tags, 'no-website'),
      } satisfies RawOpportunity]
    })
  },
}

/**
 * The makeover lead: businesses that DO list a website, where that website is dead,
 * parked, or only a social page. This is stronger evidence than "no website" — they
 * already decided a site mattered and it stopped working.
 *
 * Each candidate costs one live request to a third-party site, so the batch is small
 * and the checker never retries aggressively.
 */
const PARKED = /domain (is|may be) for sale|buy this domain|this domain is available|parked (free|domain)|sedo\.com|afternic|hugedomains|domainmarket|is for sale/i
const SOCIAL_HOSTS = /(^|\.)(facebook\.com|instagram\.com|linktr\.ee|business\.site|wa\.me|tiktok\.com)$/i

const osmDeadSites: Adapter = {
  key: 'osmdead',
  label: 'OSM: dead or parked websites',
  kind: 'directory',
  pipeline: 'business',
  note: 'Businesses whose recorded website is dead, parked or only a social page. ODbL attribution; checks one live request per candidate.',
  attribution: { label: 'OpenStreetMap contributors (ODbL)', url: 'https://www.openstreetmap.org/copyright' },
  needs: null,
  configHint: '{ "areas": [[6.43,3.34,6.47,3.42]], "kinds": ["restaurant"], "limit": 20 }',
  async fetch(ctx) {
    const boxes = resolveBoxes(ctx.config)
    if (!boxes.length) return []
    const kinds = resolveKinds(ctx.config)
    // Each URL check is a request, so this list is deliberately short.
    const limit = Math.min(Math.max(Number(ctx.config.limit ?? 20), 1), 40)

    const filter = kinds.join('|')
    const clauses = boxes
      .map((box) => `node["amenity"~"^(${filter})$"]["name"]["website"~"."](${box.join(',')});`)
      .join('\n')
    const query = `[out:json][timeout:25];\n(\n${clauses}\n);\nout ${limit * 2};`

    const candidates = await overpass(query, ctx.timeoutMs)

    const out: RawOpportunity[] = []
    for (const element of candidates.slice(0, limit)) {
      const tags = element.tags ?? {}
      const website = (tags.website ?? tags['contact:website'] ?? '').trim()
      const name = tags.name?.trim()
      if (!name || !/^https?:\/\//i.test(website)) continue

      let verdict: 'dead' | 'parked' | 'social' | null = null
      let detail = ''
      try {
        const url = new URL(website)
        if (SOCIAL_HOSTS.test(url.hostname)) {
          verdict = 'social'
          detail = `the recorded site is a ${url.hostname.replace(/^www\./, '')} page, not a website`
        } else {
          const response = await fetch(website, {
            redirect: 'follow',
            signal: AbortSignal.timeout(Math.min(ctx.timeoutMs, 10_000)),
            headers: { 'user-agent': UA, accept: 'text/html' },
          })
          if (response.status === 404 || response.status === 410) {
            verdict = 'dead'
            detail = `the recorded site returned HTTP ${response.status}`
          } else if (response.ok) {
            const html = (await response.text()).slice(0, 20_000)
            if (PARKED.test(html)) {
              verdict = 'parked'
              detail = 'the recorded site is a parked or for-sale domain'
            }
          }
        }
      } catch {
        // A domain that no longer resolves is the clearest signal of all.
        verdict = 'dead'
        detail = 'the recorded domain no longer resolves'
      }

      if (!verdict) continue
      const kind = (tags.amenity ?? 'business').replace(/_/g, ' ')
      const place =
        [tags['addr:street'], tags['addr:city']].filter(Boolean).join(', ') ||
        `${element.lat.toFixed(4)}, ${element.lon.toFixed(4)}`
      out.push({
        externalId: `osmdead:${element.id}:${new Date().toISOString().slice(0, 10)}`,
        title: `${name} — ${kind}, website ${verdict === 'social' ? 'is only a social page' : verdict}`,
        org: name,
        url: `https://www.openstreetmap.org/node/${element.id}`,
        location: place,
        remote: false,
        publishedAt: null,
        signal: 'emerging' as const,
        text: [
          `${name} is a ${kind} recorded in OpenStreetMap at ${place}.`,
          `Its recorded website ${website} was checked on ${new Date().toISOString().slice(0, 10)}: ${detail}.`,
          tags.phone ? `Phone recorded: ${tags.phone}.` : 'No phone recorded.',
          'This is an observation from public data, not a request for work.',
        ].join(' '),
        tags: prospectTags(tags, verdict === 'social' ? 'social-only' : 'dead-website'),
      })
    }
    return out
  },
}

/**
 * DataAnnotation publishes its role list only in its sitemap: the /job-board hub now
 * redirects to the homepage, so there is no card markup to read. This is the entire
 * parser, and it throws rather than returning an empty source, because "0 roles today"
 * and "the sitemap changed shape" must never look the same from the outside.
 */
export function parseDataAnnotationRoles(xml: string): { slug: string; url: string }[] {
  const roles = new Map<string, string>()
  for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    const slug = match[1].match(/\/job-board\/([a-z0-9-]+)\/?$/i)?.[1]?.toLowerCase()
    // Same role listed with and without a trailing slash is one row, one URL.
    if (slug) roles.set(slug, match[1].replace(/\/$/, ''))
  }
  // The board has held ~130 roles for months; a handful means the markup moved.
  if (roles.size < 10) {
    throw new Error(`DataAnnotation sitemap no longer lists job-board roles (parsed ${roles.size})`)
  }
  return [...roles].map(([slug, url]) => ({ slug, url }))
}

const ACRONYMS: Record<string, string> = { ai: 'AI', ml: 'ML', stem: 'STEM', qa: 'QA', sql: 'SQL' }

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((word) => ACRONYMS[word] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Every role DataAnnotation lists publicly. Application-gated by design: the listing is
 * real, but nobody gets work without a starter assessment and an ID check, so the body
 * says so instead of implying a job waiting to be claimed.
 */
const dataAnnotation: Adapter = {
  key: 'dataannotation',
  label: 'DataAnnotation roles',
  kind: 'directory',
  pipeline: 'individual',
  note: 'Every AI-training role DataAnnotation lists publicly. Entry is an application: a starter assessment, then an ID check.',
  attribution: { label: 'DataAnnotation', url: 'https://www.dataannotation.tech/' },
  needs: null,
  configHint: '{}',
  async fetch(ctx) {
    const xml = await fetchText('https://www.dataannotation.tech/sitemap.xml', { timeoutMs: ctx.timeoutMs })
    return parseDataAnnotationRoles(xml).map(({ slug, url }) => {
      const title = titleFromSlug(slug)
      return {
        externalId: `dataannotation:${slug}`,
        title: `${title} — DataAnnotation`,
        org: 'DataAnnotation',
        url,
        location: 'Remote',
        remote: true,
        signal: 'explicit' as const,
        text: `${title} is one of DataAnnotation's public AI-training roles. Entry is an application: a starter assessment, then an ID check. Pay is set per role and shown on the posting, which is a listing rather than an offer of work.`,
        tags: ['ai-training', 'application-gated'],
      }
    })
  },
}

/** Stable short id for feeds that only give a URL (RSS). */
function hashish(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i++) hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0
  return Math.abs(hash).toString(36)
}

export const ADAPTERS: Adapter[] = [
  greenhouse, lever, ashby,
  jobicy, remotive, remoteok, himalayas, workingNomads, arbeitnow, weWorkRemotely, freelancer,
  hackerNews, mastodon, ted, sam,
  osm, osmDeadSites, dataAnnotation,
]

export function getAdapter(key: string): Adapter | undefined {
  return ADAPTERS.find((a) => a.key === key)
}
