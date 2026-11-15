#!/usr/bin/env node
/**
 * Throwaway proof for the discovery adapters. No project code is imported — this
 * is deliberately independent so it cannot be "passing" because the adapter and
 * the check share a bug.
 *
 *   node scripts/prove-discovery.mjs            # everything
 *   node scripts/prove-discovery.mjs --boards   # only the ATS board check
 *
 * It answers three questions with real responses:
 *   1. Does each ATS endpoint return jobs for real employer tokens?
 *   2. What does a normalised opportunity actually look like?
 *   3. What volume/quality do we get per request, i.e. is this worth building on?
 */

const ARGS = new Set(process.argv.slice(2))
const TIMEOUT = 25_000

/** Real employers. A token is only kept if the endpoint returns jobs for it. */
const CANDIDATES = {
  greenhouse: ['openai', 'anthropic', 'figma', 'datadog', 'gitlab', 'cloudflare', 'discord', 'notion', 'stripe', 'vercel'],
  lever: ['kraken', 'gopuff', 'chime', 'affirm', 'nuro', 'faire', 'benchling', 'mixpanel', 'patreon', 'quora', 'twitch', 'eventbrite'],
  ashby: ['linear', 'ramp', 'posthog', 'clerk', 'deel', 'vanta', 'attio', 'cal'],
}

const BOARDS = {
  greenhouse: (t) => `https://boards-api.greenhouse.io/v1/boards/${t}/jobs`,
  lever: (t) => `https://api.lever.co/v0/postings/${t}?mode=json`,
  ashby: (t) => `https://api.ashbyhq.com/posting-api/job-board/${t}?includeCompensation=true`,
}

const strip = (s) =>
  String(s ?? '')
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|li|div|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp|hellip|mdash|rsquo|ldquo|rdquo);/gi, (_, n) =>
      ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', rsquo: '’', ldquo: '“', rdquo: '”' })[n.toLowerCase()] ?? _,
    )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

async function json(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** Same shape the Worker's normalise() produces, reduced to what proves the point. */
function normalise(raw) {
  const title = String(raw.title ?? '').replace(/\s+/g, ' ').trim()
  return {
    title: title.slice(0, 90),
    org: raw.org ?? null,
    url: raw.url,
    remote: raw.remote ?? null,
    externalId: raw.externalId,
    published: raw.publishedAt ? new Date(raw.publishedAt).toISOString().slice(0, 10) : null,
    bodyChars: (raw.text ?? '').length,
  }
}

async function checkBoards() {
  console.log('\n=== ATS board tokens (each token is one real employer) ===\n')
  const verified = {}
  for (const [platform, tokens] of Object.entries(CANDIDATES)) {
    console.log(`-- ${platform} --`)
    verified[platform] = []
    for (const token of tokens) {
      try {
        const data = await json(BOARDS[platform](token))
        const jobs = platform === 'lever' ? (Array.isArray(data) ? data : []) : (data.jobs ?? [])
        const state = jobs.length === 0 ? 'EMPTY' : 'ok'
        if (jobs.length > 0) verified[platform].push(token)
        const sample = jobs[0] ? String(jobs[0].title ?? jobs[0].text ?? '').slice(0, 46) : ''
        console.log(`   ${state.padEnd(5)} ${token.padEnd(14)} ${String(jobs.length).padStart(4)} jobs   ${sample}`)
      } catch (error) {
        console.log(`   dead  ${token.padEnd(14)}    0 jobs   ${error.message}`)
      }
    }
    console.log('')
  }
  return verified
}

async function checkFeeds() {
  console.log('=== Free feeds: normalised output ===\n')

  // Jobicy — keyless remote board.
  try {
    // No `industry` param: an unknown industry value returns HTTP 400.
    const data = await json('https://jobicy.com/api/v2/remote-jobs?count=20')
    const jobs = data.jobs ?? []
    console.log(`Jobicy: ${jobs.length} jobs in one request`)
    for (const job of jobs.slice(0, 2)) {
      console.log('  ' + JSON.stringify(normalise({
        externalId: `jobicy:${job.id}`,
        title: job.jobTitle,
        org: job.companyName,
        url: job.url,
        remote: true,
        publishedAt: Date.parse(job.pubDate) || null,
        text: strip(job.jobDescription || job.jobExcerpt),
      })))
    }
    const withBody = jobs.filter((j) => strip(j.jobDescription).length > 1000).length
    console.log(`  → ${withBody}/${jobs.length} carry a full description (>1000 chars)\n`)
  } catch (error) {
    console.log(`Jobicy FAILED: ${error.message}\n`)
  }

  // EU TED — the API wants YYYYMMDD with no separators.
  try {
    const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10).replace(/-/g, '')
    const res = await fetch('https://api.ted.europa.eu/v3/notices/search', {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: `(FT~"software" OR FT~"web development") AND publication-date>=${since}`,
        fields: ['publication-number', 'notice-title', 'buyer-name', 'publication-date', 'description-lot', 'notice-type'],
        page: 1,
        limit: 10,
        scope: 'ACTIVE',
      }),
    })
    const data = await res.json()
    const notices = data.notices ?? []
    console.log(`EU TED: ${notices.length} notices in one request (total matches: ${data.totalNoticeCount ?? '?'})`)
    const pick = (v) => {
      if (v == null) return ''
      if (typeof v === 'string') return v
      if (Array.isArray(v)) return pick(v[0])
      if (typeof v === 'object') return pick(v.eng ?? v.ENG ?? Object.values(v)[0])
      return ''
    }
    const tedDate = (value) => {
      const m = /^(\d{4}-\d{2}-\d{2})([+-]\d{2}:\d{2})$/.exec(value)
      return m ? Date.parse(`${m[1]}T00:00:00${m[2]}`) : Date.parse(value)
    }
    for (const n of notices.slice(0, 2)) {
      const num = pick(n['publication-number'])
      console.log('  ' + JSON.stringify(normalise({
        externalId: `ted:${num}`,
        title: pick(n['notice-title']) || `Tender ${num}`,
        org: pick(n['buyer-name']),
        url: `https://ted.europa.eu/en/notice/-/detail/${num}`,
        publishedAt: tedDate(pick(n['publication-date'])),
        text: strip(pick(n['description-lot'])),
      })))
    }
    const english = notices.filter((n) => n['description-lot']?.eng).length
    console.log(`  → ${english}/${notices.length} have an English description (the rest are non-English)\n`)
  } catch (error) {
    console.log(`EU TED FAILED: ${error.message}\n`)
  }
}

const verified = await checkBoards()
if (!ARGS.has('--boards')) await checkFeeds()

console.log('=== Verified board tokens (only tokens that returned jobs) ===\n')
console.log(JSON.stringify(verified, null, 2))
console.log(`
Seeding model: one source row per platform, holding a list of employer tokens:

  sources.adapter = 'greenhouse'
  sources.config_json = { "boards": ${JSON.stringify(verified.greenhouse)} }

There is no global search. Each token is a specific employer's public board, so
coverage = the list you curate. Extend it by adding tokens to config_json.
`)
