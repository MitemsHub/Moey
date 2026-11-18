#!/usr/bin/env node
/**
 * Research probe: which keyless gig / freelance / contract endpoints answer right now?
 *
 * Run: node scripts/probe-gig-sources.mjs
 *
 * Every row is a live request made today. Nothing here is wired into the app by this
 * script; it exists so "this source is usable" is a measurement, not an opinion.
 */
const UA = 'MitemshubOpportunityEngine/1.0 (+source-research; operator contact in repo)'
const T = 20_000

const PROBES = [
  // --- freelance marketplaces / gig boards ---
  { name: 'Freelancer paging', url: 'https://www.freelancer.com/api/projects/0.1/projects/active/?limit=100&offset=100' },
  { name: 'Freelancer contests', url: 'https://www.freelancer.com/api/contests/0.1/contests/?limit=20' },
  { name: 'Freelancermap rss', url: 'https://www.freelancermap.com/rss', xml: true },
  { name: 'Freelancermap de rss', url: 'https://www.freelancermap.de/rss.xml', xml: true },
  { name: 'Freelancehunt rss', url: 'https://freelancehunt.com/rss/projects.rss', xml: true },
  { name: 'Workana rss', url: 'https://www.workana.com/en/jobs?format=rss', xml: true },
  { name: 'Guru rss', url: 'https://www.guru.com/rss/jobs/', xml: true },
  { name: 'PeoplePerHour api', url: 'https://www.peopleperhour.com/api/v1/freelance-jobs' },
  { name: 'Truelancer api', url: 'https://www.truelancer.com/api/projects' },
  { name: 'Malt api', url: 'https://www.malt.com/api/v1/missions' },
  { name: 'Contra api', url: 'https://contra.com/api/v1/opportunities' },
  { name: 'Twine api', url: 'https://www.twine.net/api/jobs' },
  { name: 'Twine rss', url: 'https://www.twine.net/rss/jobs', xml: true },
  { name: 'LaborX api', url: 'https://laborx.com/api/v1/jobs' },
  { name: 'Upwork rss', url: 'https://www.upwork.com/ab/feed/jobs/rss?q=developer', xml: true },
  { name: 'Arc.dev api', url: 'https://arc.dev/api/v1/jobs' },
  { name: 'Gun.io api', url: 'https://gun.io/api/jobs/' },
  { name: 'DesignCrowd rss', url: 'https://www.designcrowd.com/rss', xml: true },
  { name: '99designs rss', url: 'https://99designs.com/contests/rss', xml: true },
  { name: 'Dribbble jobs rss', url: 'https://dribbble.com/jobs.rss', xml: true },

  // --- bounty / open-source contract work ---
  { name: 'Algora api', url: 'https://algora.io/api/v1/bounties?limit=20' },
  { name: 'Algora console api', url: 'https://console.algora.io/api/bounties' },
  { name: 'Superteam earn', url: 'https://earn.superteam.fun/api/listings/' },
  { name: 'DoraHacks bounty', url: 'https://dorahacks.io/api/bounty/' },
  { name: 'DoraHacks hackathon', url: 'https://dorahacks.io/api/hackathon/' },
  { name: 'IssueHunt api', url: 'https://issuehunt.io/api/v1/issues' },
  { name: 'HackerOne programs', url: 'https://hackerone.com/programs.json' },
  { name: 'HackerOne api', url: 'https://api.hackerone.com/v1/hackers/programs' },
  { name: 'Bugcrowd engagements', url: 'https://bugcrowd.com/engagements.json' },
  { name: 'Gitcoin api', url: 'https://api.gitcoin.co/v1/bounties' },

  // --- contract-heavy feeds already known to be open ---
  { name: 'Remotive (job_type)', url: 'https://remotive.com/api/remote-jobs?limit=5' },
  { name: 'Himalayas (types)', url: 'https://himalayas.app/jobs/api?limit=5' },
  { name: 'Himalayas contract', url: 'https://himalayas.app/jobs/api?limit=5&employmentType=contract' },
  { name: 'Jobicy (jobType)', url: 'https://jobicy.com/api/v2/remote-jobs?count=5' },
  { name: 'WWR contract rss', url: 'https://weworkremotely.com/categories/remote-contract-jobs.rss', xml: true },
  { name: 'WWR all rss', url: 'https://weworkremotely.com/remote-jobs.rss', xml: true },
  { name: 'NoDesk contract', url: 'https://nodesk.co/remote-jobs/contract/feed.xml', xml: true },
  { name: 'Jobspresso rss', url: 'https://jobspresso.co/feed/?post_type=job_listing', xml: true },
  { name: 'Authentic Jobs rss', url: 'https://authenticjobs.com/?feed=rss2', xml: true },
  { name: 'Remote.co contract', url: 'https://remote.co/remote-jobs/contract/feed/', xml: true },

  // --- often refused; kept to record the evidence ---
  { name: 'Upwork api', url: 'https://www.upwork.com/api/profiles/v2/search/jobs.json?q=developer' },
  { name: 'Fiverr rss', url: 'https://www.fiverr.com/rss', xml: true },
  { name: 'PeoplePerHour rss', url: 'https://www.peopleperhour.com/rss', xml: true },
]

const countItems = (xml) => (xml.match(/<item[\s>]/g) || []).length + (xml.match(/<entry[\s>]/g) || []).length

function guessCount(name, data) {
  if (Array.isArray(data)) return data.length
  if (!data || typeof data !== 'object') return undefined
  for (const key of ['jobs', 'projects', 'results', 'data', 'items', 'listings', 'bounties', 'programs', 'engagements', 'result', 'records', 'posts', 'hits', 'missions', 'offers']) {
    const value = data[key]
    if (Array.isArray(value)) return value.length
    if (value && typeof value === 'object' && Array.isArray(value.projects)) return value.projects.length
    if (value && typeof value === 'object' && Array.isArray(value.results)) return value.results.length
    if (value && typeof value === 'object' && Array.isArray(value.data)) return value.data.length
  }
  return undefined
}

function firstTitle(data) {
  const pool = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? Object.values(data).find((v) => Array.isArray(v) && v.length && typeof v[0] === 'object')
      : null
  const row = Array.isArray(pool) ? pool[0] : null
  if (!row) return ''
  for (const key of ['title', 'position', 'name', 'jobTitle', 'text', 'headline', 'role']) {
    if (typeof row[key] === 'string' && row[key].trim()) return `${key}="${row[key].trim().slice(0, 48)}"`
  }
  return ''
}

for (const probe of PROBES) {
  try {
    const res = await fetch(probe.url, {
      signal: AbortSignal.timeout(T),
      redirect: 'follow',
      headers: {
        'user-agent': UA,
        accept: probe.xml ? 'application/rss+xml, application/xml, text/xml' : 'application/json, text/plain, */*',
      },
    })
    const body = await res.text()
    let detail = ''
    if (probe.xml) {
      detail = `${countItems(body)} feed items`
    } else if (res.ok) {
      let data
      try {
        data = JSON.parse(body)
      } catch {
        detail = `not JSON (${body.slice(0, 40).replace(/\s+/g, ' ')})`
      }
      if (data !== undefined) {
        const n = guessCount(data)
        const shape = data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data).slice(0, 6).join(',') : 'array'
        detail = `${n === undefined ? 'count?' : `${n} items`} [${shape}] ${firstTitle(data)}`
      }
    } else {
      detail = body.slice(0, 70).replace(/\s+/g, ' ')
    }
    const type = res.headers.get('content-type') ?? ''
    console.log(`${res.ok ? 'OPEN ' : 'BLOCK'} ${String(res.status).padEnd(4)} ${probe.name.padEnd(22)} ${type.split(';')[0].padEnd(18)} ${detail}`)
  } catch (error) {
    console.log(`ERROR      ${probe.name.padEnd(22)} ${' '.repeat(18)} ${error.message}`)
  }
}
